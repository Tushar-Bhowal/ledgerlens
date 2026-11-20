import "server-only";
import { getDatabasePool } from "@/server/db";
import { documentBalancesSql, reportingDate } from "./documents";

export type OverdueOpportunity = {
  id: string;
  number: string;
  party: string;
  partyId: string;
  due: string;
  face: number;
  outstanding: number;
  overdue: number;
  disputed: number;
  actionable: number;
  step: string;
};

export type UnallocatedReceiptItem = {
  id: string;
  partyId: string;
  partyName: string;
  amount: number;
};

export type BillPaymentReview = {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
  due: string;
  outstanding: number;
  criticality: string;
  msme: boolean;
  termsDays: number | null;
  status: string;
  hasHold: boolean;
  hasDispute: boolean;
  eligible: boolean;
  priorityScore: number;
};

export type OpportunitiesResult = {
  asOf: string;
  totals: {
    actionable: number;
    disputed: number;
    overdue: number;
  };
  opportunities: OverdueOpportunity[];
  unallocated: UnallocatedReceiptItem[];
  paymentReview: BillPaymentReview[];
  rejectedRows: number;
};

export async function getOpportunities(): Promise<OpportunitiesResult> {
  const pool = getDatabasePool();

  // Check rejected import records
  const rejResult = await pool.query<{ rejected: number }>(
    "SELECT count(*)::integer AS rejected FROM finance.import_issues WHERE issue_code = 'rejected'"
  );
  const rejectedRows = rejResult.rows[0]?.rejected ?? 0;

  // 1. Fetch overdue AR invoices with disputes
  const arQuery = await pool.query<{
    id: string;
    number: string;
    party_id: string;
    party: string;
    due: string;
    face: number;
    outstanding: number;
    unresolved_dispute: number;
  }>(`
    WITH ${documentBalancesSql("ar")},
    dispute_sums AS (
      SELECT invoice_id,
        SUM(disputed_amount_inr) AS dispute_amount
      FROM finance.disputes
      WHERE party_type = 'Customer' AND status IN ('Open', 'Under Review')
      GROUP BY invoice_id
    )
    SELECT b.id, b.number, b.party_id, b.party, b.due::text AS due,
      b.face::numeric AS face, b.outstanding::numeric AS outstanding,
      COALESCE(d.dispute_amount, 0)::numeric AS unresolved_dispute
    FROM balances b
    LEFT JOIN dispute_sums d ON d.invoice_id = b.id
    WHERE b.status = 'overdue' AND b.outstanding > 0
  `, [reportingDate]);

  let totalActionable = 0;
  let totalDisputed = 0;
  let totalOverdue = 0;

  const opportunities: OverdueOpportunity[] = arQuery.rows.map((row) => {
    const outCents = Math.round(Number(row.outstanding) * 100);
    const dispCents = Math.round(Number(row.unresolved_dispute) * 100);
    const cappedDispCents = Math.min(outCents, dispCents);
    const actCents = outCents - cappedDispCents;

    totalOverdue += outCents;
    totalDisputed += cappedDispCents;
    totalActionable += actCents;

    const overdue = outCents / 100;
    const disputed = cappedDispCents / 100;
    const actionable = actCents / 100;

    return {
      id: row.id,
      number: row.number || row.id,
      party: row.party,
      partyId: row.party_id,
      due: row.due,
      face: Number(row.face),
      outstanding: Number(row.outstanding),
      overdue,
      disputed,
      actionable,
      step: disputed > 0
        ? "Resolve the dispute; follow up on the undisputed balance."
        : "Confirm allocations and agree a collection date.",
    };
  });

  // Sort by actionable descending
  opportunities.sort((a, b) => b.actionable - a.actionable || a.id.localeCompare(b.id));

  // 2. Fetch unallocated receipts
  const unallocQuery = await pool.query<{
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
    ORDER BY unallocated DESC
  `);

  const unallocated: UnallocatedReceiptItem[] = unallocQuery.rows.map((r) => ({
    id: r.receipt_id,
    partyId: r.customer_id,
    partyName: r.customer_name,
    amount: Number(r.unallocated),
  }));

  // 3. AP Payment Review Priorities
  const apQuery = await pool.query<{
    id: string;
    number: string;
    party_id: string;
    party: string;
    due: string;
    outstanding: number;
    criticality: string | null;
    terms_days: number | null;
    msme: boolean | null;
    has_hold: boolean;
    has_dispute: boolean;
  }>(`
    WITH ${documentBalancesSql("ap")},
    active_holds AS (
      SELECT bill_id FROM finance.payment_holds WHERE hold_status = 'Active' OR released_date IS NULL GROUP BY bill_id
    ),
    active_disputes AS (
      SELECT bill_id FROM finance.disputes WHERE party_type = 'Vendor' AND status IN ('Open', 'Under Review') GROUP BY bill_id
    )
    SELECT b.id, b.number, b.party_id, b.party, b.due::text AS due,
      b.outstanding::numeric AS outstanding,
      b.criticality, b.terms_days, b.msme,
      (h.bill_id IS NOT NULL) AS has_hold,
      (d.bill_id IS NOT NULL) AS has_dispute
    FROM balances b
    LEFT JOIN active_holds h ON h.bill_id = b.id
    LEFT JOIN active_disputes d ON d.bill_id = b.id
    WHERE b.outstanding > 0
  `, [reportingDate]);

  const paymentReview: BillPaymentReview[] = apQuery.rows.map((r) => {
    const isCritical = (r.criticality || "").toLowerCase() === "critical";
    const isMsme = Boolean(r.msme);
    const hasHold = Boolean(r.has_hold);
    const hasDispute = Boolean(r.has_dispute);
    const isEligible = !hasHold && !hasDispute;

    // Scoring: higher score = higher priority
    let score = 0;
    if (isEligible) score += 1000;
    if (isCritical) score += 500;
    if (isMsme) score += 300;
    // Overdue boost
    const daysOverdue = Math.floor((Date.parse(reportingDate) - Date.parse(r.due)) / 86_400_000);
    score += Math.max(0, daysOverdue);

    return {
      id: r.id,
      number: r.number || r.id,
      vendorId: r.party_id,
      vendorName: r.party,
      due: r.due,
      outstanding: Number(r.outstanding),
      criticality: r.criticality || "Standard",
      msme: isMsme,
      termsDays: r.terms_days,
      status: hasHold ? "On Hold" : hasDispute ? "In Dispute" : daysOverdue > 0 ? "Overdue" : "Current",
      hasHold,
      hasDispute,
      eligible: isEligible,
      priorityScore: score,
    };
  });

  paymentReview.sort((a, b) => b.priorityScore - a.priorityScore || a.due.localeCompare(b.due));

  return {
    asOf: reportingDate,
    totals: {
      actionable: totalActionable / 100,
      disputed: totalDisputed / 100,
      overdue: totalOverdue / 100,
    },
    opportunities,
    unallocated,
    paymentReview,
    rejectedRows,
  };
}
