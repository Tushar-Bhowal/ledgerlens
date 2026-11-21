import "server-only";
import { getDatabasePool } from "@/server/db";
import { cashBalancesSql } from "./summary";
import { documentBalancesSql, reportingDate } from "./documents";

export type ExceptionItem = {
  id: string;
  kind: string;
  severity: "High" | "Review" | "Info";
  party: string;
  partyId: string;
  documentId?: string;
  status: string;
  exposure: number | null;
  reason: string;
  action: string;
  evidence: string[];
};

export type ExceptionsResult = {
  asOf: string;
  rows: ExceptionItem[];
  total: number;
  rejectedRows: number;
};

function exposureAmount(value: string | null): number | null {
  if (value === null) return null;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = BigInt(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(2, "0")}`);
  // The UI contract is numeric. Values beyond exact integer cents remain explicitly undetermined.
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) && cents >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(cents) / 100 : null;
}

export async function getExceptions(): Promise<ExceptionsResult> {
  const result = await getDatabasePool().query<{ rows: (Omit<ExceptionItem, "exposure"> & { exposure: string | null })[]; rejected: number }>(`
    WITH ar AS (WITH ${documentBalancesSql("ar")} SELECT * FROM balances),
    ap AS (WITH ${documentBalancesSql("ap")} SELECT * FROM balances),
    ar_cash AS (WITH ${cashBalancesSql("ar")} SELECT * FROM cash_balances),
    ap_cash AS (WITH ${cashBalancesSql("ap")} SELECT * FROM cash_balances),
    docs AS (
      SELECT 'AR' AS ledger, id, number, party_id, party, date, posted, due, face, outstanding FROM ar
      UNION ALL SELECT 'AP', id, number, party_id, party, date, posted, due, face, outstanding FROM ap
    ), customer_totals AS (
      SELECT party_id, party, sum(greatest(outstanding, 0)) AS outstanding,
        bool_or(outstanding IS NULL) AS incomplete, min(id) AS document_id
      FROM ar GROUP BY party_id, party
    ), duplicate_refs AS (
      SELECT ledger, number, party_id, party, min(id) AS first_id, array_agg(id ORDER BY id) AS evidence,
        CASE WHEN bool_or(outstanding IS NULL) THEN NULL ELSE sum(greatest(outstanding, 0)) END AS exposure
      FROM docs WHERE nullif(trim(number), '') IS NOT NULL
      GROUP BY ledger, number, party_id, party HAVING count(*) > 1
    ), cross_party_refs AS (
      SELECT ledger, number, min(id) AS first_id, min(party_id) AS first_party_id,
        string_agg(DISTINCT party, ', ' ORDER BY party) AS parties, array_agg(id ORDER BY id) AS evidence,
        CASE WHEN bool_or(outstanding IS NULL) THEN NULL ELSE sum(greatest(outstanding, 0)) END AS exposure
      FROM docs WHERE nullif(trim(number), '') IS NOT NULL
      GROUP BY ledger, number HAVING count(DISTINCT party_id) > 1
    ), items AS (
      SELECT 'LIMIT-' || c.party_id AS id, 'Credit limit'::text AS kind, 'High'::text AS severity,
        c.party, c.party_id, c.document_id, 'Needs review'::text AS status, c.outstanding AS exposure,
        'Positive exposure exceeds the supplied current credit limit.'::text AS reason,
        'Review current credit exposure and the specific overdue invoices; historical credit-limit changes are not supplied.'::text AS action,
        ARRAY[c.party_id, c.document_id]::text[] AS evidence
      FROM customer_totals c JOIN finance.customer_master m ON m.customer_id = c.party_id
      WHERE NOT c.incomplete AND m.credit_limit_inr > 0 AND c.outstanding > m.credit_limit_inr
      UNION ALL
      SELECT d.dispute_id, 'Dispute', 'High', coalesce(b.party, d.party_id), d.party_id, coalesce(d.invoice_id, d.bill_id), d.status,
        CASE WHEN d.party_id = b.party_id AND d.disputed_amount_inr >= 0 AND b.outstanding IS NOT NULL
          THEN least(d.disputed_amount_inr, greatest(b.outstanding, 0)) ELSE NULL END,
        coalesce(d.dispute_reason, 'Unresolved commercial dispute.'),
        'Inspect the dispute and original invoice. Resolve the supported disputed portion before collecting or scheduling it.',
        ARRAY[d.dispute_id, coalesce(d.invoice_id, d.bill_id)]::text[]
      FROM finance.disputes d JOIN docs b ON b.id = coalesce(d.invoice_id, d.bill_id)
      WHERE d.status IN ('Open', 'Under Review') AND d.raised_date BETWEEN b.date AND $1::date
      UNION ALL
      SELECT h.hold_id, 'Active hold', 'High', b.party, h.vendor_id, h.bill_id, 'Active at cutoff', CASE WHEN b.outstanding IS NULL THEN NULL ELSE greatest(b.outstanding, 0) END,
        coalesce(h.hold_reason, 'Payment hold active on bill.'), 'Review dated hold documentation before scheduling payment.',
        ARRAY[h.hold_id, h.bill_id]::text[]
      FROM finance.payment_holds h JOIN ap b ON b.id = h.bill_id AND b.party_id = h.vendor_id
      WHERE h.hold_date <= $1::date AND (h.released_date > $1::date OR (h.released_date IS NULL AND h.hold_status = 'Active'))
      UNION ALL
      SELECT f.followup_id, 'Broken promise', 'High', b.party, f.customer_id, f.invoice_id, 'Promise broken',
        CASE WHEN f.promised_amount_inr >= 0 THEN least(f.promised_amount_inr, b.outstanding) ELSE NULL END,
        coalesce(f.notes, 'Recorded promise was broken on a currently overdue invoice.'),
        'Confirm allocations and contact the account owner about the valid overdue commitment.', ARRAY[f.followup_id, f.invoice_id]::text[]
      FROM finance.collection_followups f JOIN ar b ON b.id = f.invoice_id AND b.party_id = f.customer_id
      WHERE f.followup_status = 'Promise Broken' AND f.followup_date BETWEEN b.date AND $1::date
        AND f.promise_to_pay_date BETWEEN f.followup_date AND $1::date AND b.status = 'overdue'
      UNION ALL
      SELECT p.payment_id, 'Posted payment pending approval', 'Review', v.vendor_name, p.vendor_id, NULL, 'Pending approval', CASE WHEN p.payment_amount_inr >= 0 THEN p.payment_amount_inr ELSE NULL END,
        'Payment is recorded as posted but its approval remains pending.',
        'Investigate the approval workflow; this is a control exception, not a second unpaid obligation.', ARRAY[p.payment_id]::text[]
      FROM finance.ap_payments p JOIN finance.vendor_master v ON v.vendor_id = p.vendor_id
      WHERE p.status = 'Posted' AND p.approval_status = 'Pending' AND p.payment_date <= $1::date
      UNION ALL
      SELECT id, 'Unallocated receipt', 'Review', party_name, party_id, NULL, 'Unallocated', unallocated,
        'Posted receipt has an eligible residual not assigned to invoices.', 'Match remittance evidence before further collection outreach.', ARRAY[id]::text[]
      FROM ar_cash WHERE unallocated > 0
      UNION ALL
      SELECT id, 'Unallocated payment', 'Review', party_name, party_id, NULL, 'Unallocated', unallocated,
        'Posted supplier payment has an eligible residual not assigned to bills.', 'Match payment references to supplier bills; do not pay this amount again.', ARRAY[id]::text[]
      FROM ap_cash WHERE unallocated > 0
      UNION ALL
      SELECT 'PO-' || b.id, 'Missing PO', 'Review', b.party, b.party_id, b.id, 'Missing purchase order', CASE WHEN b.outstanding IS NULL THEN NULL ELSE greatest(b.outstanding, 0) END,
        'Supplier bill has no recorded purchase-order reference.', 'Verify spend authorization before scheduling payment.', ARRAY[b.id]::text[]
      FROM ap b WHERE nullif(trim(b.purchase_order), '') IS NULL
      UNION ALL
      SELECT 'GRN-' || b.id, 'Missing GRN', 'Review', b.party, b.party_id, b.id, 'Missing GRN', CASE WHEN b.outstanding IS NULL THEN NULL ELSE greatest(b.outstanding, 0) END,
        'Supplier bill has no goods-receipt or service-confirmation reference.', 'Confirm goods or services with procurement before scheduling payment.', ARRAY[b.id]::text[]
      FROM ap b WHERE nullif(trim(b.grn), '') IS NULL
      UNION ALL
      SELECT 'STALE-' || id, 'Stale balance', 'High', party, party_id, id, 'Over 90 days overdue', outstanding,
        'Invoice is ' || ($1::date - due)::text || ' days past due with a remaining balance.',
        'Review allocation history, disputes and collection ownership before any escalation.', ARRAY[id]::text[]
      FROM ar WHERE status = 'overdue' AND ($1::date - due) > 90
      UNION ALL
      SELECT 'DUP-' || ledger || '-' || first_id, 'Duplicate reference', 'Review', party, party_id, first_id, 'Reference collision', exposure,
        'Several active documents for the same party share printed reference ' || number || '.',
        'Compare original vouchers, amounts and delivery records. A repeated reference does not prove duplicate liability or fraud.', evidence
      FROM duplicate_refs
      UNION ALL
      SELECT 'CROSS-' || ledger || '-' || first_id, 'Cross-party reference collision', 'Review', parties,
        first_party_id, first_id, 'Reference collision', exposure,
        'Documents for different parties share printed reference ' || number || '.',
        'Compare every linked original voucher and party identity. The amount is combined open exposure, not proven duplicate liability or fraud.', evidence
      FROM cross_party_refs
      UNION ALL
      SELECT 'NEG-' || id, 'Credit / negative balance', 'Review', party, party_id, id, 'Credit balance', -outstanding,
        'Allocations and signed adjustments exceed the original document amount.',
        'Confirm whether this is an authorized credit or a misallocation; retain it separately from positive overdue.', ARRAY[id]::text[]
      FROM docs WHERE outstanding < 0
      UNION ALL
      SELECT 'DATA-' || id, 'Incomplete balance', 'Review', party, party_id, id, 'Coverage incomplete', NULL,
        'Balance or due-date inputs are missing or inconsistent.', 'Correct the source evidence before relying on a financial total.', ARRAY[id]::text[]
      FROM docs WHERE outstanding IS NULL OR (outstanding > 0 AND due IS NULL)
      UNION ALL
      SELECT 'CASH-' || id, 'Incomplete cash allocation', 'Review', party_name, party_id, NULL, 'Coverage incomplete', NULL,
        'Cash header or allocations contain missing or invalid settlement inputs.', 'Inspect the cash header, allocation dates, amounts and linked parties.', ARRAY[id]::text[]
      FROM (SELECT * FROM ar_cash UNION ALL SELECT * FROM ap_cash) c WHERE unallocated IS NULL
      UNION ALL
      SELECT 'CHRONO-' || f.followup_id, 'Chronology', 'Info', c.customer_name, f.customer_id, f.invoice_id, 'Chronology anomaly', NULL,
        'Follow-up date precedes its invoice or the promised date precedes the follow-up.',
        'Review source dates. Exclude this record from automatic broken-promise escalation.', ARRAY[f.followup_id, f.invoice_id]::text[]
      FROM finance.collection_followups f JOIN finance.ar_invoices i ON i.invoice_id = f.invoice_id
      JOIN finance.customer_master c ON c.customer_id = f.customer_id
      WHERE f.followup_date <= $1::date AND (f.followup_date < i.invoice_date OR f.promise_to_pay_date < f.followup_date)
      UNION ALL
      SELECT 'CHRONO-' || d.dispute_id, 'Chronology', 'Info', coalesce(c.customer_name, v.vendor_name, d.party_id), d.party_id,
        coalesce(d.invoice_id, d.bill_id), 'Chronology anomaly', NULL, 'Dispute date precedes the original document date.',
        'Review source timestamps; this record cannot automatically reduce an actionable overdue portion.', ARRAY[d.dispute_id, coalesce(d.invoice_id, d.bill_id)]::text[]
      FROM finance.disputes d LEFT JOIN finance.ar_invoices i ON i.invoice_id = d.invoice_id
      LEFT JOIN finance.ap_invoices p ON p.bill_id = d.bill_id
      LEFT JOIN finance.customer_master c ON c.customer_id = d.party_id
      LEFT JOIN finance.vendor_master v ON v.vendor_id = d.party_id
      WHERE d.raised_date <= $1::date AND d.raised_date < coalesce(i.invoice_date, p.bill_date)
      UNION ALL
      SELECT 'CONTROL-' || h.hold_id, 'Incomplete payment control', 'Review', b.party, h.vendor_id, h.bill_id,
        'Control data incomplete', NULL, 'Hold dates, status or vendor link are incomplete or inconsistent.',
        'Verify the hold record before clearing this bill for payment review.', ARRAY[h.hold_id, h.bill_id]::text[]
      FROM finance.payment_holds h JOIN ap b ON b.id = h.bill_id
      WHERE (h.hold_date <= $1::date OR h.hold_date IS NULL) AND (h.vendor_id <> b.party_id OR h.hold_date IS NULL
        OR h.hold_status IS NULL OR h.hold_status NOT IN ('Active', 'Released') OR h.released_date < h.hold_date
        OR (h.hold_status = 'Released' AND h.released_date IS NULL)
        OR (h.hold_status = 'Active' AND h.released_date <= $1::date))
      UNION ALL
      SELECT 'CONTROL-' || d.dispute_id, 'Incomplete dispute', 'Review', b.party, d.party_id, b.id,
        'Control data incomplete', NULL, 'Dispute date, status, amount or party link is incomplete or inconsistent.',
        'Confirm the original dispute record before changing a collection or payment recommendation.', ARRAY[d.dispute_id, b.id]::text[]
      FROM finance.disputes d JOIN docs b ON b.id = coalesce(d.invoice_id, d.bill_id)
      WHERE (d.raised_date <= $1::date OR d.raised_date IS NULL) AND (d.party_id <> b.party_id OR d.raised_date IS NULL
        OR d.status IS NULL OR d.status NOT IN ('Open', 'Under Review', 'Resolved', 'Closed')
        OR d.disputed_amount_inr IS NULL OR d.disputed_amount_inr < 0)
      UNION ALL
      SELECT 'DUP-PAY-' || min(p.payment_id), 'Duplicate payment reference', 'Review', v.vendor_name, p.vendor_id, NULL,
        'Reference collision', CASE WHEN bool_or(p.payment_amount_inr IS NULL) THEN NULL ELSE sum(p.payment_amount_inr) END,
        'Several posted supplier payments share bank reference ' || p.bank_reference || '.',
        'Match the bank statement and voucher IDs before asserting duplication; bank statements are not supplied.', array_agg(p.payment_id ORDER BY p.payment_id)
      FROM finance.ap_payments p JOIN finance.vendor_master v ON v.vendor_id = p.vendor_id
      WHERE p.status = 'Posted' AND p.payment_date <= $1::date AND nullif(trim(p.bank_reference), '') IS NOT NULL
      GROUP BY p.vendor_id, v.vendor_name, p.bank_reference HAVING count(*) > 1
      UNION ALL
      SELECT 'DUP-REC-' || min(r.receipt_id), 'Duplicate receipt reference', 'Review', c.customer_name, r.customer_id, NULL,
        'Reference collision', CASE WHEN bool_or(r.receipt_amount_inr IS NULL) THEN NULL ELSE sum(r.receipt_amount_inr) END,
        'Several posted customer receipts share bank reference ' || r.bank_reference || '.',
        'Compare bank evidence and original receipt vouchers. A reference collision is a review flag, not proof of duplicate cash.', array_agg(r.receipt_id ORDER BY r.receipt_id)
      FROM finance.ar_receipts r JOIN finance.customer_master c ON c.customer_id = r.customer_id
      WHERE r.status = 'Posted' AND r.receipt_date <= $1::date AND nullif(trim(r.bank_reference), '') IS NOT NULL
      GROUP BY r.customer_id, c.customer_name, r.bank_reference HAVING count(*) > 1
      UNION ALL
      SELECT 'APPROVAL-' || p.payment_id, 'Unclear payment approval', 'Review', v.vendor_name, p.vendor_id, NULL,
        'Approval requires review', CASE WHEN p.payment_amount_inr >= 0 THEN p.payment_amount_inr ELSE NULL END,
        'A posted payment has missing or unrecognized approval information.',
        'Inspect the existing disbursement and approval record before taking any payment action.', ARRAY[p.payment_id]::text[]
      FROM finance.ap_payments p JOIN finance.vendor_master v ON v.vendor_id = p.vendor_id
      WHERE p.status = 'Posted' AND (p.payment_date <= $1::date OR p.payment_date IS NULL)
        AND (p.approval_status IS NULL OR p.approval_status NOT IN ('Approved', 'Pending'))
      UNION ALL
      SELECT 'CONTROL-' || f.followup_id, 'Incomplete follow-up', 'Review', c.customer_name, f.customer_id, f.invoice_id,
        'Follow-up data incomplete', NULL, 'A broken-promise source record lacks valid dates, amount or a matching customer.',
        'Confirm source chronology and amounts before escalating a collection commitment.', ARRAY[f.followup_id, f.invoice_id]::text[]
      FROM finance.collection_followups f JOIN finance.ar_invoices i ON i.invoice_id = f.invoice_id
      JOIN finance.customer_master c ON c.customer_id = f.customer_id
      WHERE f.followup_status = 'Promise Broken' AND (f.followup_date <= $1::date OR f.followup_date IS NULL)
        AND (f.followup_date IS NULL OR f.promise_to_pay_date IS NULL OR f.promised_amount_inr IS NULL
          OR f.promised_amount_inr < 0 OR f.customer_id <> i.customer_id)
      UNION ALL
      SELECT 'SOURCE-' || import_issue_id::text, 'Import issue', 'Review', source_filename, coalesce(source_id, ''), NULL, issue_code, NULL,
        reason, 'Inspect the preserved raw source record and correct ingestion before relying on complete totals.',
        ARRAY[coalesce(source_id, source_filename)]::text[]
      FROM finance.import_issues WHERE issue_code = 'rejected'
    )
    SELECT coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'severity', severity, 'party', party, 'partyId', party_id,
      'documentId', document_id, 'status', status, 'exposure', exposure::text, 'reason', reason, 'action', action, 'evidence', evidence)
      ORDER BY CASE severity WHEN 'High' THEN 0 WHEN 'Review' THEN 1 ELSE 2 END, exposure DESC NULLS LAST, id), '[]'::json) AS rows,
      (SELECT count(*)::integer FROM finance.import_issues WHERE issue_code = 'rejected') AS rejected
    FROM items
  `, [reportingDate]);
  const rows = result.rows[0].rows.map((row) => ({ ...row, exposure: exposureAmount(row.exposure) }));
  return { asOf: reportingDate, rows, total: rows.length, rejectedRows: result.rows[0].rejected };
}
