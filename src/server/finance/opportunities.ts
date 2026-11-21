import "server-only";
import { getDatabasePool } from "@/server/db";
import { cashBalancesSql } from "./summary";
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

function numericAmount(value: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("Invalid monetary source value");
  const cents = BigInt(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(2, "0")}`);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("Monetary value exceeds the display contract's exact-cent range");
  }
  const amount = Number(cents) / 100;
  if (BigInt(Math.round(amount * 100)) !== cents) throw new Error("Monetary amount cannot preserve cents in the numeric display contract");
  return amount;
}

type OpportunitySource = { id: string; number: string | null; party_id: string; party: string; due: string; face: string; outstanding: string; disputed: string; actionable: string };
type PaymentSource = { id: string; number: string | null; party_id: string; party: string; due: string; outstanding: string; criticality: string | null; terms_days: number | null; msme: boolean | null; has_hold: boolean; has_dispute: boolean; days_overdue: number };

export async function getOpportunities(): Promise<OpportunitiesResult> {
  // All review queues come from one snapshot, so concurrent imports cannot mix different datasets.
  const result = await getDatabasePool().query<{
    ar: OpportunitySource[]; ap: PaymentSource[];
    cash: { id: string; party_id: string; party_name: string; unallocated: string }[];
    actionable: string; disputed: string; overdue: string;
    rejected: number; incomplete: boolean;
  }>(`
    WITH ar AS (
      WITH ${documentBalancesSql("ar")}, dispute_sums AS (
        SELECT d.invoice_id,
          sum(CASE WHEN d.party_id = i.customer_id AND d.status IN ('Open', 'Under Review')
            AND d.raised_date BETWEEN i.invoice_date AND $1::date AND d.disputed_amount_inr >= 0
            THEN d.disputed_amount_inr ELSE 0 END) AS amount,
          bool_or(d.party_id <> i.customer_id OR d.status IS NULL
            OR d.status NOT IN ('Open', 'Under Review', 'Resolved', 'Closed')
            OR (d.status IN ('Open', 'Under Review') AND (d.raised_date IS NULL OR i.invoice_date IS NULL
              OR d.disputed_amount_inr IS NULL OR d.disputed_amount_inr < 0))) AS incomplete
        FROM finance.disputes d JOIN finance.ar_invoices i ON i.invoice_id = d.invoice_id
        WHERE d.party_type = 'Customer' AND (d.raised_date <= $1::date OR d.raised_date IS NULL)
        GROUP BY d.invoice_id
      )
      SELECT b.*, least(greatest(b.outstanding, 0), coalesce(d.amount, 0)) AS disputed,
        greatest(b.outstanding, 0) - least(greatest(b.outstanding, 0), coalesce(d.amount, 0)) AS actionable,
        coalesce(d.incomplete, false) AS dispute_incomplete
      FROM balances b LEFT JOIN dispute_sums d ON d.invoice_id = b.id
    ), ap AS (
      WITH ${documentBalancesSql("ap")}, controls AS (
        SELECT b.id,
          EXISTS (SELECT 1 FROM finance.payment_holds h WHERE h.bill_id = b.id AND h.vendor_id = b.party_id
            AND h.hold_date <= $1::date AND (h.released_date > $1::date OR (h.released_date IS NULL AND h.hold_status = 'Active'))) AS has_hold,
          EXISTS (SELECT 1 FROM finance.disputes d WHERE d.bill_id = b.id AND d.party_type = 'Vendor' AND d.party_id = b.party_id
            AND d.status IN ('Open', 'Under Review') AND d.raised_date BETWEEN b.date AND $1::date) AS has_dispute,
          EXISTS (SELECT 1 FROM finance.payment_holds h WHERE h.bill_id = b.id AND (h.hold_date <= $1::date OR h.hold_date IS NULL)
            AND (h.vendor_id <> b.party_id OR h.hold_date IS NULL OR h.hold_status IS NULL
              OR h.hold_status NOT IN ('Active', 'Released') OR h.released_date < h.hold_date
              OR (h.hold_status = 'Released' AND h.released_date IS NULL)
              OR (h.hold_status = 'Active' AND h.released_date <= $1::date)))
          OR EXISTS (SELECT 1 FROM finance.disputes d WHERE d.bill_id = b.id AND d.party_type = 'Vendor'
            AND (d.raised_date <= $1::date OR d.raised_date IS NULL)
            AND (d.party_id <> b.party_id OR d.status IS NULL OR d.status NOT IN ('Open', 'Under Review', 'Resolved', 'Closed')
              OR (d.status IN ('Open', 'Under Review') AND (d.raised_date IS NULL OR b.date IS NULL)))) AS controls_incomplete
        FROM balances b
      )
      SELECT b.*, c.has_hold, c.has_dispute, c.controls_incomplete,
        ($1::date - b.due)::integer AS days_overdue
      FROM balances b JOIN controls c ON c.id = b.id
    ), cash AS (
      WITH ${cashBalancesSql("ar")} SELECT * FROM cash_balances
    ), coverage AS (
      SELECT count(*)::integer AS rejected FROM finance.import_issues WHERE issue_code = 'rejected'
    )
    SELECT coalesce((SELECT json_agg(json_build_object('id', id, 'number', number, 'party_id', party_id, 'party', party,
      'due', due::text, 'face', face::text, 'outstanding', outstanding::text, 'disputed', disputed::text, 'actionable', actionable::text)
      ORDER BY actionable DESC, id) FROM ar WHERE status = 'overdue' AND outstanding > 0), '[]'::json) AS ar,
      coalesce((SELECT json_agg(json_build_object('id', id, 'number', number, 'party_id', party_id, 'party', party,
        'due', due::text, 'outstanding', outstanding::text, 'criticality', criticality, 'terms_days', terms_days,
        'msme', msme, 'has_hold', has_hold, 'has_dispute', has_dispute, 'days_overdue', days_overdue))
        FROM ap WHERE outstanding > 0), '[]'::json) AS ap,
      coalesce((SELECT json_agg(json_build_object('id', id, 'party_id', party_id, 'party_name', party_name,
        'unallocated', unallocated::text) ORDER BY unallocated DESC, id) FROM cash WHERE unallocated > 0), '[]'::json) AS cash,
      coalesce((SELECT sum(actionable) FROM ar WHERE status = 'overdue'), 0)::text AS actionable,
      coalesce((SELECT sum(disputed) FROM ar WHERE status = 'overdue'), 0)::text AS disputed,
      coalesce((SELECT sum(outstanding) FROM ar WHERE status = 'overdue'), 0)::text AS overdue,
      coverage.rejected,
      EXISTS (SELECT 1 FROM ar WHERE outstanding IS NULL OR (outstanding > 0 AND due IS NULL) OR dispute_incomplete)
        OR EXISTS (SELECT 1 FROM ap WHERE outstanding IS NULL OR (outstanding > 0 AND (due IS NULL OR controls_incomplete)))
        OR EXISTS (SELECT 1 FROM cash WHERE unallocated IS NULL) AS incomplete
    FROM coverage
  `, [reportingDate]);
  const data = result.rows[0];
  // A partial queue must not be presented as a complete collection or payment recommendation.
  if (data.rejected > 0 || data.incomplete) throw new Error("Opportunity coverage is incomplete");
  const opportunities = data.ar.map((row): OverdueOpportunity => ({
    id: row.id, number: row.number || row.id, party: row.party, partyId: row.party_id, due: row.due,
    face: numericAmount(row.face), outstanding: numericAmount(row.outstanding), overdue: numericAmount(row.outstanding),
    disputed: numericAmount(row.disputed), actionable: numericAmount(row.actionable),
    step: numericAmount(row.disputed) > 0 ? "Resolve the dispute; follow up on the undisputed balance." : "Confirm allocations and agree a collection date.",
  }));
  const paymentReview = data.ap.map((row): BillPaymentReview => {
    const eligible = !row.has_hold && !row.has_dispute;
    const score = (eligible ? 1000 : 0) + (row.criticality?.toLowerCase() === "critical" ? 500 : 0)
      + (row.msme ? 300 : 0) + Math.max(0, row.days_overdue);
    return { id: row.id, number: row.number || row.id, vendorId: row.party_id, vendorName: row.party,
      due: row.due, outstanding: numericAmount(row.outstanding), criticality: row.criticality ?? "Unknown",
      msme: row.msme === true, termsDays: row.terms_days,
      status: row.has_hold ? "On Hold" : row.has_dispute ? "In Dispute" : row.days_overdue > 0 ? "Overdue" : "Current",
      hasHold: row.has_hold, hasDispute: row.has_dispute, eligible, priorityScore: score };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.priorityScore - a.priorityScore || a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
  return { asOf: reportingDate, opportunities, paymentReview,
    unallocated: data.cash.map((row) => ({ id: row.id, partyId: row.party_id, partyName: row.party_name, amount: numericAmount(row.unallocated) })),
    totals: { actionable: numericAmount(data.actionable), disputed: numericAmount(data.disputed), overdue: numericAmount(data.overdue) },
    rejectedRows: data.rejected };
}
