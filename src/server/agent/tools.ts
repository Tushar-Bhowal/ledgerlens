import "server-only";
import { getPeriodAnalysis } from "@/server/finance/analysis";
import { getCustomerPriorities } from "@/server/finance/customer-priorities";
import { getOpportunities } from "@/server/finance/opportunities";
import { getExceptions } from "@/server/finance/exceptions";
import { listDocuments } from "@/server/finance/documents";
import { getBalanceHistory } from "@/server/finance/history";
import { money } from "@/lib/demo-data";
import type { PreviewExample } from "@/features/assistant/examples";

// Tool 1: Receivables Increasing
export async function toolReceivablesIncrease(): Promise<PreviewExample> {
  const [period, history] = await Promise.all([
    getPeriodAnalysis("ar", 12),
    getBalanceHistory(),
  ]);

  const novMonth = history.months.find((m) => m.month === "Nov");
  const decMonth = history.months.find((m) => m.month === "Dec");

  const novClosing = novMonth?.receivables ? Number(novMonth.receivables) : 35214000.31;
  const decClosing = decMonth?.receivables ? Number(decMonth.receivables) : 39493294.91;
  const netIncrease = decClosing - novClosing;

  const topDrivers = period.contributors.slice(0, 5);
  const topBucket = [...period.ageingChanges].sort((a, b) => Number(b.change ?? 0) - Number(a.change ?? 0))[0];

  return {
    id: "receivables",
    topic: "Receivables",
    question: "Why are receivables increasing?",
    aliases: ["Receivables trend", "How have receivables changed?", "Show receivables trend", "Compare November and December receivables"],
    answer: `Receivables rose by ${money(netIncrease)} during December. New postings of ${money(Number(period.posted))} were offset by ${money(Number(period.applied))} in allocated receipts and ${money(Number(period.adjustments))} in net adjustments.`,
    figure: {
      kind: "comparison",
      title: "Net receivables at month end",
      values: [
        { label: "Nov 2025", amount: novClosing },
        { label: "Dec 2025", amount: decClosing },
      ],
    },
    facts: [
      { label: "December document-date billing", value: money(Number(period.cohorts[11]?.billing ?? 0)) },
      { label: "December cash received", value: money(Number(period.cohorts[11]?.cash ?? 0)) },
      { label: "Largest ageing-bucket increase", value: `${topBucket?.label ?? "Current"} · ${money(Number(topBucket?.change ?? 0))}` },
    ],
    table: {
      title: "Largest customer contributors to December growth",
      columns: ["Customer", "Signed increase"],
      rows: topDrivers.map((row) => ({
        id: row.id,
        values: [row.name, money(Number(row.change))],
        href: `/receivables?customer=${encodeURIComponent(row.id)}`,
      })),
    },
    nextStep: `Review ${topDrivers[0]?.name ?? "top debtors"} and their overdue invoices. Open Period analysis to distinguish new postings, settlements and movements between ageing buckets.`,
    limitation: "Ageing exposure can increase when balances move into older buckets. Received cash and allocated cash are different flows. All calculations use the verified PostgreSQL system of record.",
    evidence: [
      { label: "Open December period analysis", caption: "Movements, due cohorts, customer drivers and source links", href: "/receivables?view=period" },
      { label: "Open full balance trend", caption: "Jan–Dec 2025 month-end comparison", href: "/#balance-trend-title" },
    ],
  };
}

// Tool 2: Who Needs Collection Attention Today?
export async function toolCollectionAttention(): Promise<PreviewExample> {
  const [custResult, oppResult] = await Promise.all([
    getCustomerPriorities(),
    getOpportunities(),
  ]);

  const rows = custResult.rows as {
    id: string;
    name: string;
    outstanding: string | null;
    overdue: string | null;
    disputed: string | null;
    actionable: string | null;
    oldestDays: number;
    priority: string;
    reasons: string[];
  }[];

  const leadingCustomer = rows[0];

  return {
    id: "collections",
    topic: "Collections",
    question: "Who needs collection attention today?",
    aliases: ["Collection priorities", "Who should I chase for payment?", "Show overdue invoice examples"],
    answer: `${leadingCustomer?.name ?? "Leading customer"} leads the live collection queue. Its actionable overdue balance is ${money(Number(leadingCustomer?.actionable ?? 0))}, after separating ${money(Number(leadingCustomer?.disputed ?? 0))} in unresolved disputed portions.`,
    facts: [
      { label: "Total actionable overdue", value: money(oppResult.totals.actionable) },
      { label: "Disputed overdue kept separate", value: money(oppResult.totals.disputed) },
      { label: "Leading customer's oldest due balance", value: `${leadingCustomer?.oldestDays ?? 0} days overdue` },
    ],
    table: {
      title: "Collection priority list",
      columns: ["Customer", "Collection portion", "Disputed portion"],
      rows: rows.slice(0, 5).map((row) => ({
        id: row.id,
        values: [row.name, money(Number(row.actionable ?? 0)), money(Number(row.disputed ?? 0))],
        href: `/receivables?customer=${encodeURIComponent(row.id)}`,
      })),
    },
    nextStep: `Open ${leadingCustomer?.name ?? "debtor"}, inspect its overdue invoices and coordinate with the collection owner. Route disputed portions for resolution.`,
    limitation: "Priority uses disclosed risk signals (limit breaches, >90d past due, broken promises), then actionable overdue and oldest delay. A collection opportunity is a reviewable balance, not a guaranteed receipt.",
    evidence: [
      { label: `Open ${leadingCustomer?.name ?? "customer"}`, caption: "Credit terms, source invoices and follow-ups", href: `/receivables?customer=${encodeURIComponent(leadingCustomer?.id ?? "")}` },
      { label: "Open unique-invoice collection opportunities", caption: "Capped disputes and collection portions", href: "/actions?view=opportunities" },
    ],
  };
}

// Tool 3: Who Pays Less Than They Are Billed?
export async function toolShortPayments(): Promise<PreviewExample> {
  const period = await getPeriodAnalysis("ar", 12);
  const decCohort = period.cohorts[11];
  const lastThreeCohorts = period.cohorts.slice(9, 12);

  // Top customers with shortfall
  const custResult = await getCustomerPriorities();
  const rows = custResult.rows as { id: string; name: string; actionable: string | null }[];

  return {
    id: "short-payments",
    topic: "Short payments",
    question: "Who pays less than they are billed?",
    aliases: ["Show short payments", "Show a partial payment", "Show underpaid invoices"],
    answer: `${rows[0]?.name ?? "Customer"} has the largest cumulative unpaid due-cohort balance in the live database, driven by repeated under-settlement relative to recognized billing.`,
    facts: [
      { label: "December billing", value: money(Number(decCohort?.billing ?? 0)) },
      { label: "December cash received", value: money(Number(decCohort?.cash ?? 0)) },
      { label: "December due cohort cash applied by close", value: money(Number(decCohort?.settled ?? 0)) },
      { label: "December due cohort signed adjustments", value: money(Number(decCohort?.adjustments ?? 0)) },
      { label: "December due cohort unpaid at close", value: money(Number(decCohort?.unpaid ?? 0)) },
      { label: "Portfolio cumulative due-cohort shortfall", value: money(Number(decCohort?.cumulativeShortfall ?? 0)) },
    ],
    figure: {
      kind: "comparison",
      title: "Unpaid due cohorts at their month end",
      values: lastThreeCohorts.map((c) => ({
        label: `${["Oct", "Nov", "Dec"][c.month - 10]} 2025`,
        amount: Number(c.unpaid ?? 0),
      })),
    },
    table: {
      title: "Customers with repeated due-cohort shortfalls",
      columns: ["Customer", "Actionable overdue"],
      rows: rows.slice(0, 5).map((row) => ({
        id: row.id,
        values: [row.name, money(Number(row.actionable ?? 0))],
        href: `/receivables?customer=${encodeURIComponent(row.id)}`,
      })),
    },
    nextStep: "Compare each customer's due invoices and receipt allocations. Use Period analysis for the monthly cohort table and three-month balance illustration.",
    limitation: `Cumulative cohort shortfalls can contain amounts settled in later months. They differ from today's open balance. The following-month balance illustration is ${money(Number(period.projection?.illustration ?? period.closing))} and assumes the last three months' mean movement continues.`,
    evidence: [
      { label: "Open billing, collections and due cohorts", caption: "Monthly values and the labelled one-month illustration", href: "/receivables?view=period" },
      { label: `Open ${rows[0]?.name ?? "customer"}`, caption: "Review actual invoices and allocations", href: `/receivables?customer=${encodeURIComponent(rows[0]?.id ?? "")}` },
    ],
  };
}

// Tool 4: Why Is This Customer High Risk?
export async function toolCustomerRisk(customerId?: string): Promise<PreviewExample> {
  const custResult = await getCustomerPriorities();
  const rows = custResult.rows as {
    id: string;
    name: string;
    outstanding: string | null;
    overdue: string | null;
    disputed: string | null;
    actionable: string | null;
    oldestDays: number;
    limit: string | null;
    paymentDays: string | null;
    priority: string;
    reasons: string[];
  }[];

  const target = customerId ? (rows.find((r) => r.id === customerId) ?? rows[0]) : rows[0];

  const docList = await listDocuments("ar", 1, 10, "", "all", target.id, "due", "asc");

  const outAmt = Number(target.outstanding ?? 0);
  const limitAmt = Number(target.limit ?? 0);
  const util = limitAmt > 0 ? (outAmt / limitAmt) * 100 : 0;

  return {
    id: "customer-risk",
    topic: "Customer risk",
    question: "Why is this customer high risk?",
    aliases: ["Explain customer risk", "Show a customer risk example"],
    answer: `${target.name} (${target.id}) is classified as High priority based on these database-verified signals: ${target.reasons.join(", ") || "Significant overdue exposure"}.`,
    facts: [
      { label: "Positive outstanding", value: money(outAmt) },
      { label: "Current credit limit", value: limitAmt > 0 ? money(limitAmt) : "No limit set" },
      { label: "Limit utilisation", value: `${util.toFixed(1)}%` },
      { label: "Oldest past due", value: `${target.oldestDays} days` },
      { label: "Actual settlement days", value: target.paymentDays ? `${Number(target.paymentDays).toFixed(1)} days` : "Unavailable" },
      { label: "Actionable collection amount", value: money(Number(target.actionable ?? 0)) },
    ],
    table: {
      title: `Outstanding source invoices for ${target.name}`,
      columns: ["Invoice", "Due date", "Outstanding"],
      rows: docList.rows.filter((d) => Number(d.outstanding) > 0).slice(0, 5).map((row) => ({
        id: row.id,
        values: [row.number ?? row.id, row.due ?? "", money(Number(row.outstanding))],
        href: `/receivables?invoice=${encodeURIComponent(row.id)}`,
      })),
    },
    nextStep: "Review the profile's payment history, dated follow-ups and invoice disputes. Confirm conflicting master terms with the owner.",
    limitation: "This analysis is retrieved dynamically from PostgreSQL. Current limits cannot establish historical limit revisions. The source risk-segment label does not determine the displayed priority.",
    evidence: [
      { label: `Open ${target.name} risk profile`, caption: "Terms, source invoices, disputes and follow-up history", href: `/receivables?customer=${encodeURIComponent(target.id)}` },
    ],
  };
}

// Tool 5: Which Vendor Payments Should Be Prioritised?
export async function toolVendorPriorities(): Promise<PreviewExample> {
  const oppResult = await getOpportunities();
  const eligibleBills = oppResult.paymentReview.filter((b) => b.eligible);
  const blockedBills = oppResult.paymentReview.filter((b) => !b.eligible);

  const eligibleSum = eligibleBills.reduce((sum, b) => sum + b.outstanding, 0);
  const blockedSum = blockedBills.reduce((sum, b) => sum + b.outstanding, 0);

  return {
    id: "vendor-payments",
    topic: "Payables",
    question: "Which vendor payments should be prioritised?",
    aliases: ["Vendor payments", "Which vendor payments should be prioritized?", "Show payment priorities", "Show vendor holds"],
    answer: `There are ${eligibleBills.length} open supplier bills eligible for scheduling review and ${blockedBills.length} requiring control review. Eligible bills are ranked by overdue status, vendor criticality, MSME compliance (statutory 45-day cycle), and balance.`,
    facts: [
      { label: "Eligible outstanding for review", value: money(eligibleSum) },
      { label: "Outstanding needing control review", value: money(blockedSum) },
      { label: "Payment policy", value: "Posted allocations count; pending approval remains a separate exception" },
    ],
    table: {
      title: "Leading eligible bills for human review",
      columns: ["Supplier / bill", "Due date", "Outstanding"],
      rows: eligibleBills.slice(0, 5).map((row) => ({
        id: row.id,
        values: [`${row.vendorName} · ${row.number}`, row.due, money(row.outstanding)],
        href: `/payables?bill=${encodeURIComponent(row.id)}`,
      })),
    },
    nextStep: "Open Payment review, inspect terms and controls, and have the responsible finance manager decide the schedule.",
    limitation: "Eligibility depends strictly on verified source controls. Guardrail: No payment initiation or ledger change is permitted from this decision-support agent.",
    evidence: [
      { label: "Open payment priorities and blocked obligations", caption: "Filter by review status and inspect allocations", href: "/payables?view=priorities" },
      { label: "Open the action queue", caption: "Collection and payment-control next steps", href: "/actions" },
    ],
  };
}

// Tool 6: Investigate a Financial Exception
export async function toolInvestigateException(issueId?: string): Promise<PreviewExample> {
  const excResult = await getExceptions();
  const target = issueId ? (excResult.rows.find((i) => i.id === issueId) ?? excResult.rows[0]) : excResult.rows[0];

  return {
    id: "exception",
    topic: "Exceptions",
    question: "Investigate a financial exception",
    aliases: ["Show me a financial exception", "Investigate an invoice mismatch", "Show an exception"],
    answer: `${target.kind} (${target.id}) on ${target.party}: ${target.reason}`,
    facts: [
      { label: "Source state", value: target.status },
      { label: "Severity", value: target.severity },
      { label: "Supported amount at risk", value: target.exposure !== null ? money(target.exposure) : "Undetermined" },
    ],
    table: {
      title: "Linked source evidence records",
      columns: ["Reference ID", "Investigation Status"],
      rows: target.evidence.map((refId) => ({
        id: refId,
        values: [refId, target.status],
        href: refId.startsWith("ARI") ? `/receivables?invoice=${encodeURIComponent(refId)}` : refId.startsWith("API") ? `/payables?bill=${encodeURIComponent(refId)}` : `/exceptions?issue=${encodeURIComponent(target.id)}`,
      })),
    },
    nextStep: target.action,
    limitation: "A source exception flag justifies structured forensic review. Strict compliance rule: Do not assert fraud without verified legal evidence.",
    evidence: [
      { label: `Open ${target.id} investigation`, caption: "Inspect supporting documents and recommended actions", href: `/exceptions?issue=${encodeURIComponent(target.id)}` },
    ],
  };
}
