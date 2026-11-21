import "server-only";
import { getDatabasePool } from "@/server/db";
import { documentBalancesSql, reportingDate, type Ledger } from "./documents";

export function cashBalancesSql(ledger: Ledger) {
  const ar = ledger === "ar";
  const header = ar ? "ar_receipts" : "ap_payments";
  const id = ar ? "receipt_id" : "payment_id";
  const party = ar ? "customer_id" : "vendor_id";
  const date = ar ? "receipt_date" : "payment_date";
  const amount = ar ? "receipt_amount_inr" : "payment_amount_inr";
  const allocation = ar ? "ar_receipt_allocations" : "ap_payment_allocations";
  const document = ar ? "ar_invoices" : "ap_invoices";
  const documentId = ar ? "invoice_id" : "bill_id";
  const master = ar ? "customer_master" : "vendor_master";
  const name = ar ? "customer_name" : "vendor_name";
  // Cash remains separate from trade balances until a valid, dated allocation identifies its invoice.
  return `cash_headers AS (
    SELECT c.*, m.${name} AS party_name
    FROM finance.${header} c JOIN finance.${master} m ON m.${party} = c.${party}
    WHERE (c.${date} <= $1::date OR c.${date} IS NULL)
      AND (c.status IS NULL OR c.status NOT IN ('Cancelled', 'Canceled', 'Reversed', 'Voided'))
  ), cash_allocation_sums AS (
    SELECT c.${id}, COALESCE(sum(a.allocated_amount_inr) FILTER (
      WHERE a.status = 'Allocated' AND a.allocation_date <= $1::date
        AND i.status = 'Posted' AND i.posting_date <= $1::date), 0) AS applied,
      COALESCE(bool_or(a.allocation_id IS NOT NULL AND (
        a.status IS NULL OR a.status NOT IN ('Allocated', 'Cancelled', 'Canceled', 'Reversed', 'Voided')
        OR (a.status = 'Allocated' AND (a.allocation_date IS NULL OR
          (a.allocation_date <= $1::date AND (a.allocated_amount_inr IS NULL OR a.allocated_amount_inr < 0
            OR i.${party} <> c.${party} OR i.status IS DISTINCT FROM 'Posted' OR i.posting_date IS NULL
            OR i.currency IS DISTINCT FROM 'INR' OR a.allocation_date < c.${date}
            OR a.allocation_date < i.posting_date))))
      )), false) AS invalid
    FROM cash_headers c
    LEFT JOIN finance.${allocation} a ON a.${id} = c.${id}
    LEFT JOIN finance.${document} i ON i.${documentId} = a.${documentId}
    GROUP BY c.${id}
  ), cash_balances AS (
    SELECT c.${id} AS id, c.${party} AS party_id, c.party_name, c.${date} AS date,
      c.${amount} AS face, a.applied,
      CASE WHEN c.status IS DISTINCT FROM 'Posted' OR c.${date} IS NULL
        OR c.${amount} IS NULL OR c.${amount} < 0 OR a.invalid OR a.applied > c.${amount}
        THEN NULL ELSE c.${amount} - a.applied END AS unallocated
    FROM cash_headers c JOIN cash_allocation_sums a ON a.${id} = c.${id}
  )`;
}

export async function getFinanceSummary() {
  // One statement gives all headline figures the same database snapshot and reporting cutoff.
  const result = await getDatabasePool().query(`
    WITH ar AS (
      WITH ${documentBalancesSql("ar")}
      SELECT CASE WHEN bool_or(outstanding IS NULL) THEN NULL ELSE COALESCE(sum(outstanding), 0) END AS total
      FROM balances
    ), ap AS (
      WITH ${documentBalancesSql("ap")}
      SELECT CASE WHEN bool_or(outstanding IS NULL) THEN NULL ELSE COALESCE(sum(outstanding), 0) END AS total
      FROM balances
    ), unallocated AS (
      WITH ${cashBalancesSql("ar")}
      SELECT CASE WHEN bool_or(unallocated IS NULL) THEN NULL ELSE COALESCE(sum(unallocated), 0) END AS total,
        CASE WHEN bool_or(unallocated IS NULL) THEN NULL ELSE count(*) FILTER (WHERE unallocated > 0)::integer END AS count
      FROM cash_balances
    ), coverage AS (
      SELECT count(*) FILTER (WHERE issue_code = 'rejected') AS rejected FROM finance.import_issues
    )
    SELECT CASE WHEN coverage.rejected > 0 THEN NULL ELSE ar.total::text END AS receivables,
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE ap.total::text END AS payables,
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE (ar.total - ap.total)::text END AS "netTradeBalance",
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE unallocated.total::text END AS "unallocatedReceipts",
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE unallocated.count END AS "unallocatedReceiptCount",
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE (SELECT count(*)::integer FROM finance.ar_invoices) END AS "invoiceCount",
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE (SELECT count(*)::integer FROM finance.ap_invoices) END AS "billCount",
      CASE WHEN coverage.rejected > 0 OR EXISTS (
        SELECT 1 FROM finance.ap_payments WHERE (payment_date <= $1::date OR payment_date IS NULL)
          AND (status IS NULL OR status NOT IN ('Posted', 'Cancelled', 'Canceled', 'Reversed', 'Voided')
            OR (status = 'Posted' AND (payment_date IS NULL OR approval_status IS NULL OR approval_status NOT IN ('Approved', 'Pending'))))
      ) THEN NULL ELSE (SELECT count(*)::integer FROM finance.ap_payments
        WHERE status = 'Posted' AND approval_status = 'Pending' AND payment_date <= $1::date) END AS "pendingApprovals",
      coverage.rejected::integer AS "rejectedRows"
    FROM ar CROSS JOIN ap CROSS JOIN unallocated CROSS JOIN coverage
  `, [reportingDate]);
  return { asOf: reportingDate, ...result.rows[0] };
}
