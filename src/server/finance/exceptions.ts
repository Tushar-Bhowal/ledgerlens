import "server-only";
import { getDatabasePool } from "@/server/db";
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

export async function getExceptions(): Promise<ExceptionsResult> {
  const pool = getDatabasePool();

  // Check rejected import records
  const rejResult = await pool.query<{ rejected: number }>(
    "SELECT count(*)::integer AS rejected FROM finance.import_issues WHERE issue_code = 'rejected'"
  );
  const rejectedRows = rejResult.rows[0]?.rejected ?? 0;

  const items: ExceptionItem[] = [];

  // 1. Credit Limit Breaches
  const creditLimitQuery = await pool.query<{
    customer_id: string;
    customer_name: string;
    credit_limit: number;
    outstanding: number;
    doc_id: string;
  }>(`
    WITH ${documentBalancesSql("ar")},
    cust_totals AS (
      SELECT party_id, party, SUM(outstanding) AS total_out, min(id) AS sample_doc
      FROM balances
      WHERE outstanding > 0
      GROUP BY party_id, party
    )
    SELECT c.party_id AS customer_id, c.party AS customer_name,
      m.credit_limit_inr::numeric AS credit_limit,
      c.total_out::numeric AS outstanding,
      c.sample_doc AS doc_id
    FROM cust_totals c
    JOIN finance.customer_master m ON m.customer_id = c.party_id
    WHERE m.credit_limit_inr > 0 AND c.total_out > m.credit_limit_inr
  `, [reportingDate]);

  for (const row of creditLimitQuery.rows) {
    items.push({
      id: `LIMIT-${row.customer_id}`,
      kind: "Credit limit",
      severity: "High",
      party: row.customer_name,
      partyId: row.customer_id,
      documentId: row.doc_id,
      status: "Needs review",
      exposure: Number(row.outstanding),
      reason: "Positive exposure exceeds the supplied current limit.",
      action: "Review credit exposure and prioritise overdue invoices.",
      evidence: [row.customer_id, row.doc_id],
    });
  }

  // 2. Disputes (Customer & Vendor)
  const disputesQuery = await pool.query<{
    dispute_id: string;
    party_type: string;
    party_id: string;
    party_name: string;
    invoice_id: string | null;
    bill_id: string | null;
    disputed_amount: number;
    status: string;
    reason: string;
  }>(`
    SELECT d.dispute_id, d.party_type, d.party_id,
      COALESCE(c.customer_name, v.vendor_name, d.party_id) AS party_name,
      d.invoice_id, d.bill_id,
      d.disputed_amount_inr::numeric AS disputed_amount,
      d.status, d.dispute_reason AS reason
    FROM finance.disputes d
    LEFT JOIN finance.customer_master c ON c.customer_id = d.party_id
    LEFT JOIN finance.vendor_master v ON v.vendor_id = d.party_id
    WHERE d.status IN ('Open', 'Under Review')
  `);

  for (const row of disputesQuery.rows) {
    const docId = row.invoice_id || row.bill_id || "";
    items.push({
      id: row.dispute_id,
      kind: "Dispute",
      severity: "High",
      party: row.party_name,
      partyId: row.party_id,
      documentId: docId,
      status: row.status,
      exposure: Number(row.disputed_amount),
      reason: row.reason || "Unresolved dispute on transaction.",
      action: "Investigate disputed line items and coordinate with the commercial team.",
      evidence: [row.dispute_id, docId].filter(Boolean),
    });
  }

  // 3. Active Payment Holds (AP)
  const holdsQuery = await pool.query<{
    hold_id: string;
    vendor_id: string;
    vendor_name: string;
    bill_id: string;
    reason: string;
    status: string;
    bill_amount: number;
  }>(`
    SELECT h.hold_id, h.vendor_id, v.vendor_name, h.bill_id,
      h.hold_reason AS reason, h.hold_status AS status,
      b.bill_amount_inr::numeric AS bill_amount
    FROM finance.payment_holds h
    JOIN finance.vendor_master v ON v.vendor_id = h.vendor_id
    JOIN finance.ap_invoices b ON b.bill_id = h.bill_id
    WHERE h.hold_status = 'Active' OR h.released_date IS NULL
  `);

  for (const row of holdsQuery.rows) {
    items.push({
      id: row.hold_id,
      kind: "Active hold",
      severity: "High",
      party: row.vendor_name,
      partyId: row.vendor_id,
      documentId: row.bill_id,
      status: "Active hold",
      exposure: Number(row.bill_amount),
      reason: row.reason || "Payment hold active on bill.",
      action: "Review hold documentation before scheduling payment.",
      evidence: [row.hold_id, row.bill_id],
    });
  }

  // 4. Broken Promises (AR)
  const brokenPromisesQuery = await pool.query<{
    followup_id: string;
    customer_id: string;
    customer_name: string;
    invoice_id: string;
    promised_amount: number;
    status: string;
    notes: string;
  }>(`
    SELECT f.followup_id, f.customer_id, c.customer_name, f.invoice_id,
      f.promised_amount_inr::numeric AS promised_amount,
      f.followup_status AS status, f.notes
    FROM finance.collection_followups f
    JOIN finance.customer_master c ON c.customer_id = f.customer_id
    WHERE f.followup_status = 'Promise Broken'
  `);

  for (const row of brokenPromisesQuery.rows) {
    items.push({
      id: row.followup_id,
      kind: "Broken promise",
      severity: "High",
      party: row.customer_name,
      partyId: row.customer_id,
      documentId: row.invoice_id,
      status: "Promise broken",
      exposure: Number(row.promised_amount),
      reason: row.notes || "Promised payment was not received by the agreed date.",
      action: "Escalate to account manager for formal payment reminder.",
      evidence: [row.followup_id, row.invoice_id],
    });
  }

  // 5. Posted Payments Pending Approval (AP)
  const pendingApprovalsQuery = await pool.query<{
    payment_id: string;
    vendor_id: string;
    vendor_name: string;
    amount: number;
  }>(`
    SELECT p.payment_id, p.vendor_id, v.vendor_name,
      p.payment_amount_inr::numeric AS amount
    FROM finance.ap_payments p
    JOIN finance.vendor_master v ON v.vendor_id = p.vendor_id
    WHERE p.status = 'Posted' AND p.approval_status = 'Pending'
  `);

  for (const row of pendingApprovalsQuery.rows) {
    items.push({
      id: row.payment_id,
      kind: "Posted payment pending approval",
      severity: "Review",
      party: row.vendor_name,
      partyId: row.vendor_id,
      status: "Pending approval",
      exposure: Number(row.amount),
      reason: "Disbursement has posted in ledger but awaits management sign-off.",
      action: "Review approval workflow and obtain designated authorization.",
      evidence: [row.payment_id],
    });
  }

  // 6. Unallocated Receipts (AR)
  const unallocatedReceiptsQuery = await pool.query<{
    receipt_id: string;
    customer_id: string;
    customer_name: string;
    unallocated: number;
  }>(`
    SELECT r.receipt_id, r.customer_id, c.customer_name,
      (r.receipt_amount_inr - COALESCE(SUM(a.allocated_amount_inr), 0))::numeric AS unallocated
    FROM finance.ar_receipts r
    JOIN finance.customer_master c ON c.customer_id = r.customer_id
    LEFT JOIN finance.ar_receipt_allocations a ON a.receipt_id = r.receipt_id AND a.status = 'Allocated'
    WHERE r.status = 'Posted'
    GROUP BY r.receipt_id, r.customer_id, c.customer_name, r.receipt_amount_inr
    HAVING (r.receipt_amount_inr - COALESCE(SUM(a.allocated_amount_inr), 0)) > 0
  `);

  for (const row of unallocatedReceiptsQuery.rows) {
    items.push({
      id: row.receipt_id,
      kind: "Unallocated receipt",
      severity: "Review",
      party: row.customer_name,
      partyId: row.customer_id,
      status: "Unallocated",
      exposure: Number(row.unallocated),
      reason: "Funds received in bank but not yet allocated to customer invoices.",
      action: "Match receipt to open customer invoices to prevent unnecessary collection outreach.",
      evidence: [row.receipt_id],
    });
  }

  // 7. Missing PO / GRN on AP Bills
  const missingRefsQuery = await pool.query<{
    bill_id: string;
    vendor_id: string;
    vendor_name: string;
    bill_amount: number;
    po_missing: boolean;
    grn_missing: boolean;
  }>(`
    SELECT b.bill_id, b.vendor_id, v.vendor_name,
      b.bill_amount_inr::numeric AS bill_amount,
      (b.purchase_order_id IS NULL OR b.purchase_order_id = '') AS po_missing,
      (b.grn_reference IS NULL OR b.grn_reference = '') AS grn_missing
    FROM finance.ap_invoices b
    JOIN finance.vendor_master v ON v.vendor_id = b.vendor_id
    WHERE b.status = 'Posted' AND (
      b.purchase_order_id IS NULL OR b.purchase_order_id = ''
      OR b.grn_reference IS NULL OR b.grn_reference = ''
    )
  `);

  for (const row of missingRefsQuery.rows) {
    if (row.po_missing) {
      items.push({
        id: `PO-${row.bill_id}`,
        kind: "Missing PO",
        severity: "Review",
        party: row.vendor_name,
        partyId: row.vendor_id,
        documentId: row.bill_id,
        status: "Missing purchase order",
        exposure: Number(row.bill_amount),
        reason: "Supplier bill has no recorded purchase order reference.",
        action: "Verify spend authorization before scheduling payment.",
        evidence: [row.bill_id],
      });
    }
    if (row.grn_missing) {
      items.push({
        id: `GRN-${row.bill_id}`,
        kind: "Missing GRN",
        severity: "Review",
        party: row.vendor_name,
        partyId: row.vendor_id,
        documentId: row.bill_id,
        status: "Missing GRN",
        exposure: Number(row.bill_amount),
        reason: "Supplier bill has no goods receipt note or service delivery confirmation.",
        action: "Confirm receipt of goods/services with warehouse or procurement.",
        evidence: [row.bill_id],
      });
    }
  }

  // 8. Stale Balances (> 90 days past due)
  const staleQuery = await pool.query<{
    id: string;
    party_id: string;
    party: string;
    outstanding: number;
    elapsed: number;
  }>(`
    WITH ${documentBalancesSql("ar")}
    SELECT id, party_id, party, outstanding::numeric,
      ($1::date - due)::integer AS elapsed
    FROM balances
    WHERE status = 'overdue' AND ($1::date - due) > 90 AND outstanding > 0
  `, [reportingDate]);

  for (const row of staleQuery.rows) {
    items.push({
      id: `STALE-${row.id}`,
      kind: "Stale balance",
      severity: "High",
      party: row.party,
      partyId: row.party_id,
      documentId: row.id,
      status: "Dormant / Stale",
      exposure: Number(row.outstanding),
      reason: `Invoice is ${row.elapsed} days past due with no settlement.`,
      action: "Review for formal legal notice or credit risk committee escalation.",
      evidence: [row.id],
    });
  }

  // 9. Chronology Warnings
  const chronologyQuery = await pool.query<{
    event_type: string;
    event_id: string;
    doc_id: string;
    party_name: string;
    party_id: string;
    doc_date: string;
    event_date: string;
  }>(`
    SELECT 'Dispute' AS event_type, d.dispute_id AS event_id, d.invoice_id AS doc_id,
      c.customer_name AS party_name, c.customer_id AS party_id,
      i.invoice_date::text AS doc_date, d.raised_date::text AS event_date
    FROM finance.disputes d
    JOIN finance.ar_invoices i ON i.invoice_id = d.invoice_id
    JOIN finance.customer_master c ON c.customer_id = d.party_id
    WHERE d.raised_date < i.invoice_date
    UNION ALL
    SELECT 'Followup' AS event_type, f.followup_id AS event_id, f.invoice_id AS doc_id,
      c.customer_name AS party_name, c.customer_id AS party_id,
      i.invoice_date::text AS doc_date, f.followup_date::text AS event_date
    FROM finance.collection_followups f
    JOIN finance.ar_invoices i ON i.invoice_id = f.invoice_id
    JOIN finance.customer_master c ON c.customer_id = f.customer_id
    WHERE f.followup_date < i.invoice_date
  `);

  for (const row of chronologyQuery.rows) {
    items.push({
      id: `CHRONO-${row.event_id}`,
      kind: "Chronology",
      severity: "Info",
      party: row.party_name,
      partyId: row.party_id,
      documentId: row.doc_id,
      status: "Chronology anomaly",
      exposure: null,
      reason: `${row.event_type} date (${row.event_date}) precedes document issue date (${row.doc_date}).`,
      action: "Review system audit log to confirm transaction timestamps.",
      evidence: [row.event_id, row.doc_id],
    });
  }

  // Sort: High severity first, then exposure descending
  items.sort((a, b) => {
    const sevOrder = { High: 0, Review: 1, Info: 2 };
    const sevDiff = sevOrder[a.severity] - sevOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.exposure ?? 0) - (a.exposure ?? 0);
  });

  return {
    asOf: reportingDate,
    rows: items,
    total: items.length,
    rejectedRows,
  };
}
