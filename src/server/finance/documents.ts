import "server-only";
import { getDatabasePool } from "@/server/db";

export type Ledger = "ar" | "ap";
// The supplied starter data is a snapshot. All live calculations use its reporting date.
export const reportingDate = "2025-12-31";

// Allocations and adjustments are aggregated independently to avoid multiplying rows.
export function documentBalancesSql(ledger: Ledger, includeAudit = false) {
  // These table and column names come only from the validated ledger choice, never from user input.
  const ar = ledger === "ar";
  const id = ar ? "invoice_id" : "bill_id";
  const party = ar ? "customer_id" : "vendor_id";
  const header = ar ? "ar_invoices" : "ap_invoices";
  const master = ar ? "customer_master" : "vendor_master";
  const partyName = ar ? "customer_name" : "vendor_name";
  const number = ar ? "invoice_number" : "bill_number";
  const originalDate = ar ? "invoice_date" : "bill_date";
  const amount = ar ? "invoice_amount_inr" : "bill_amount_inr";
  const allocation = ar ? "ar_receipt_allocations" : "ap_payment_allocations";
  const cash = ar ? "ar_receipts" : "ap_payments";
  const cashId = ar ? "receipt_id" : "payment_id";
  const cashDate = ar ? "receipt_date" : "payment_date";
  const cashAmount = ar ? "receipt_amount_inr" : "payment_amount_inr";
  const adjustment = ar ? "ar_adjustments" : "ap_adjustments";

  return `
    -- Check the entire receipt or payment before applying any of its allocations.
    -- A split payment cannot be trusted if its allocations exceed the cash received or paid.
    cash_totals AS (
      SELECT a.${cashId}, SUM(GREATEST(a.allocated_amount_inr, 0)) AS allocated,
        BOOL_OR(a.allocated_amount_inr IS NULL OR a.allocated_amount_inr < 0
          OR c.${party} <> d.${party} OR a.allocation_date < c.${cashDate}
          OR d.posting_date IS NULL OR a.allocation_date < d.posting_date
          OR d.status IS DISTINCT FROM 'Posted') AS invalid
      FROM finance.${allocation} a
      JOIN finance.${cash} c ON c.${cashId} = a.${cashId}
      JOIN finance.${header} d ON d.${id} = a.${id}
      WHERE a.status = 'Allocated' AND a.allocation_date <= $1::date
      GROUP BY a.${cashId}
    ), allocation_totals AS (
      -- Sum the eligible portion for each invoice or bill at the reporting date.
      SELECT a.${id} AS document_id,
        SUM(a.allocated_amount_inr) AS paid, MAX(a.allocation_date) AS last_allocation,
        BOOL_OR(a.allocated_amount_inr IS NULL OR a.allocated_amount_inr < 0
          OR c.${party} <> d.${party} OR c.${cashAmount} IS NULL OR t.allocated > c.${cashAmount} OR t.invalid
          OR a.allocation_date < c.${cashDate} OR a.allocation_date < d.posting_date) AS invalid
      FROM finance.${allocation} a
      JOIN finance.${cash} c ON c.${cashId} = a.${cashId}
      JOIN finance.${header} d ON d.${id} = a.${id}
      JOIN cash_totals t ON t.${cashId} = a.${cashId}
      WHERE a.status = 'Allocated' AND c.status = 'Posted'
        AND a.allocation_date <= $1::date AND c.${cashDate} <= $1::date
      GROUP BY a.${id}
    ), adjustment_totals AS (
      -- A credit reduces the balance; a debit increases it. Keep this sum separate from allocations.
      SELECT a.${id} AS document_id,
        MAX(a.adjustment_date) AS last_adjustment,
        SUM(CASE a.adjustment_type WHEN 'Credit Note' THEN -a.amount_inr WHEN 'Debit Note' THEN a.amount_inr END) AS adjustment,
        BOOL_OR(a.amount_inr IS NULL OR a.amount_inr < 0 OR a.adjustment_type NOT IN ('Credit Note', 'Debit Note') OR a.adjustment_type IS NULL OR a.${party} <> d.${party}
          OR a.adjustment_date < d.posting_date) AS invalid
      FROM finance.${adjustment} a JOIN finance.${header} d ON d.${id} = a.${id}
      WHERE a.status = 'Posted' AND a.adjustment_date <= $1::date
      GROUP BY a.${id}
    ), uncertain_events AS (
      -- A missing date or unknown status prevents us from deciding whether an event applies.
      SELECT a.${id} AS document_id
      FROM finance.${allocation} a JOIN finance.${cash} c ON c.${cashId} = a.${cashId}
      WHERE (a.allocation_date <= $1::date OR a.allocation_date IS NULL) AND (a.status IS NULL OR c.status IS NULL
        OR a.status NOT IN ('Allocated', 'Cancelled', 'Canceled', 'Reversed', 'Voided')
        OR c.status NOT IN ('Posted', 'Cancelled', 'Canceled', 'Reversed', 'Voided')
        OR (a.status = 'Allocated' AND c.status = 'Posted'
          AND (a.allocation_date IS NULL OR c.${cashDate} IS NULL)))
      UNION
      SELECT a.${id} FROM finance.${adjustment} a
      WHERE (a.adjustment_date <= $1::date OR a.adjustment_date IS NULL) AND (a.status IS NULL OR a.status NOT IN ('Posted', 'Cancelled', 'Canceled', 'Reversed', 'Voided')
        OR (a.status = 'Posted' AND a.adjustment_date IS NULL))
    ), amounts AS (
      -- Outstanding = original amount - allocated cash + signed adjustments.
      -- NULL means the supporting information is incomplete or inconsistent.
      SELECT d.${id} AS id, d.${number} AS number, d.${party} AS party_id, p.${partyName} AS party,
        d.${originalDate} AS date, d.posting_date AS posted, d.due_date AS due, d.status AS source_status,
        ${ar ? "NULL::text" : "p.criticality"} AS criticality,
        ${ar ? "NULL::integer" : "p.payment_terms_days"} AS terms_days,
        ${ar ? "NULL::boolean" : "p.msme_flag"} AS msme,
        ${ar ? "NULL::text" : "d.purchase_order_id"} AS purchase_order,
        ${ar ? "NULL::text" : "d.grn_reference"} AS grn,
        d.${amount} AS face,
        CASE WHEN COALESCE(a.invalid, false) OR u.document_id IS NOT NULL THEN NULL ELSE COALESCE(a.paid, 0) END AS paid,
        CASE WHEN COALESCE(j.invalid, false) OR u.document_id IS NOT NULL THEN NULL ELSE COALESCE(j.adjustment, 0) END AS adjustment,
        d.source_filename, d.source_record_number,
        GREATEST(d.posting_date, a.last_allocation, j.last_adjustment) AS last_transaction,
        CASE WHEN d.${amount} IS NULL OR d.posting_date IS NULL OR d.posting_date > $1::date OR d.status IS DISTINCT FROM 'Posted' OR d.currency IS DISTINCT FROM 'INR'
            OR d.posting_date < d.${originalDate} OR d.due_date < d.${originalDate}
            OR COALESCE(a.invalid, false) OR COALESCE(j.invalid, false) OR u.document_id IS NOT NULL
          THEN NULL ELSE d.${amount} - COALESCE(a.paid, 0) + COALESCE(j.adjustment, 0) END AS outstanding
      FROM finance.${header} d JOIN finance.${master} p ON p.${party} = d.${party}
      LEFT JOIN allocation_totals a ON a.document_id = d.${id}
      LEFT JOIN adjustment_totals j ON j.document_id = d.${id}
      LEFT JOIN uncertain_events u ON u.document_id = d.${id}
      ${includeAudit ? '' : `WHERE (d.status IS NULL OR d.status NOT IN ('Cancelled', 'Canceled', 'Reversed', 'Voided'))
        AND (d.posting_date <= $1::date OR d.posting_date IS NULL)`}
    ), balances AS (
      SELECT *, CASE WHEN outstanding IS NULL THEN 'unknown' WHEN outstanding < 0 THEN 'credit'
        WHEN outstanding = 0 THEN 'settled' WHEN due IS NULL THEN 'unknown'
        WHEN due < $1::date THEN 'overdue' ELSE 'current' END AS status
      FROM amounts
    )`;
}

export type DocumentRow = {
  id: string; number: string | null; partyId: string; party: string;
  date: string | null; posted: string | null; due: string | null;
  face: string | null; paid: string | null; adjustment: string | null; outstanding: string | null;
  criticality: string | null; termsDays: number | null; msme: boolean | null;
  purchaseOrder: string | null; grn: string | null;
  status: string; sourceStatus: string | null; sourceFilename: string; sourceRecordNumber: number;
};

const selectedColumns = `id, number, party_id AS "partyId", party,
  date::text AS date, posted::text AS posted, due::text AS due,
  face::text AS face, paid::text AS paid, adjustment::text AS adjustment,
  criticality, terms_days AS "termsDays", msme, purchase_order AS "purchaseOrder", grn,
  outstanding::text AS outstanding, status, source_status AS "sourceStatus",
  source_filename AS "sourceFilename", source_record_number AS "sourceRecordNumber"`;

export async function listDocuments(ledger: Ledger, page: number, pageSize: number, search: string, status: string, partyId: string, sort: "number" | "due" | "outstanding", direction: "asc" | "desc") {
  // Map validated sort choices to fixed SQL identifiers. Amounts stay numeric while sorting.
  const sortColumn = { number: "number", due: "due", outstanding: "outstanding" }[sort];
  const order = direction === "desc" ? "DESC" : "ASC";
  // Return only the requested page, while counting all matching documents for pagination.
  const result = await getDatabasePool().query<{ rows: DocumentRow[]; total: number; rejected: number }>(`
    WITH ${documentBalancesSql(ledger)}, filtered AS (
      SELECT * FROM balances
      WHERE ($2::text = '' OR position(lower($2) IN lower(concat_ws(' ', id, number, party, party_id))) > 0)
        AND ($3::text = 'all' OR status = $3) AND ($6::text = '' OR party_id = $6)
    ), page_rows AS (
      SELECT ${selectedColumns}, row_number() OVER (ORDER BY ${sortColumn} ${order} NULLS LAST, id ASC) AS sort_index
      FROM filtered ORDER BY sort_index LIMIT $4 OFFSET $5
    )
    SELECT COALESCE((SELECT json_agg(page_rows ORDER BY sort_index) FROM page_rows), '[]'::json) AS rows,
      (SELECT COUNT(*)::integer FROM filtered) AS total,
      (SELECT COUNT(*)::integer FROM finance.import_issues WHERE issue_code = 'rejected') AS rejected
  `, [reportingDate, search, status, pageSize, (page - 1) * pageSize, partyId]);
  return { asOf: reportingDate, rows: result.rows[0].rows, total: result.rows[0].total, page, pageSize, rejectedRows: result.rows[0].rejected };
}

export async function getDocumentEvidence(ledger: Ledger, id: string) {
  // Reuse the table's balance calculation so the detail and list share the same reporting scope.
  const ar = ledger === "ar";
  const docId = ar ? "invoice_id" : "bill_id";
  const allocation = ar ? "ar_receipt_allocations" : "ap_payment_allocations";
  const cash = ar ? "ar_receipts" : "ap_payments";
  const cashId = ar ? "receipt_id" : "payment_id";
  const cashDate = ar ? "receipt_date" : "payment_date";
  const reference = ar ? "receipt_reference" : "payment_reference";
  const adjustment = ar ? "ar_adjustments" : "ap_adjustments";
  const pool = getDatabasePool();
  const result = await pool.query<DocumentRow & { allocations: unknown[]; adjustments: unknown[] }>(`
    WITH ${documentBalancesSql(ledger, true)}
    SELECT ${selectedColumns},
      -- Include source IDs and CSV locations so a reviewer can trace each displayed allocation.
      COALESCE((SELECT json_agg(json_build_object(
        'id', a.allocation_id, 'cashId', c.${cashId}, 'date', a.allocation_date::text,
        'amount', a.allocated_amount_inr::text, 'reference', c.${reference},
        'approval', ${ar ? "NULL" : "c.approval_status"}, 'sourceFilename', a.source_filename,
        'sourceRecordNumber', a.source_record_number) ORDER BY a.allocation_date, a.allocation_id)
        FROM finance.${allocation} a JOIN finance.${cash} c ON c.${cashId} = a.${cashId}
        WHERE a.${docId} = balances.id AND a.status = 'Allocated' AND c.status = 'Posted'
          AND a.allocation_date <= $1::date AND c.${cashDate} <= $1::date), '[]'::json) AS allocations,
      COALESCE((SELECT json_agg(json_build_object(
        'id', a.adjustment_id, 'date', a.adjustment_date::text, 'type', a.adjustment_type,
        'amount', a.amount_inr::text, 'reference', a.reference, 'sourceFilename', a.source_filename,
        'sourceRecordNumber', a.source_record_number) ORDER BY a.adjustment_date, a.adjustment_id)
        FROM finance.${adjustment} a WHERE a.${docId} = balances.id AND a.status = 'Posted'
          AND a.adjustment_date <= $1::date), '[]'::json) AS adjustments
    FROM balances WHERE id = $2
  `, [reportingDate, id]);
  return result.rows[0] ?? null;
}
