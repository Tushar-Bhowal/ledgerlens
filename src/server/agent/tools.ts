import "server-only";
import { findCustomers } from "@/server/finance/customer-lookup";
import { getShortPaymentCustomers } from "@/server/finance/short-payments";
import { getPeriodAnalysis } from "@/server/finance/analysis";
import { getCustomerActivity } from "@/server/finance/customer-activity";
import { getCustomerPriorities } from "@/server/finance/customer-priorities";
import { getOpportunities } from "@/server/finance/opportunities";
import { getExceptions } from "@/server/finance/exceptions";
import { formatLiveAmount } from "@/features/finance/live-analysis-format";
import { getDocumentEvidence, listDocuments } from "@/server/finance/documents";
import { getBalanceHistory } from "@/server/finance/history";
import { money } from "@/lib/demo-data";
import type { PreviewExample } from "@/features/assistant/examples";

function amountCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(2, "0")}`);
}

function decimalAmount(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function unavailable(id: string, answer: string): PreviewExample {
  return { id, topic: "Source coverage", question: "Review available source data", aliases: [], answer,
    limitation: "Missing financial inputs are not treated as zero.", nextStep: "Review source coverage and the affected records before making a decision.",
    evidence: [{ label: "Open source exceptions", caption: "Inspect import and source issues", href: "/exceptions" }] };
}

// Tool 1: Receivables Increasing
export async function toolReceivablesIncrease(month = 12): Promise<PreviewExample> {
  const [period, history] = await Promise.all([
    getPeriodAnalysis("ar", month),
    getBalanceHistory(),
  ]);

  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = labels[month - 1];
  const novMonth = month > 1 ? history.months[month - 2] : { receivables: period.opening };
  const decMonth = history.months[month - 1];

  if (novMonth?.receivables == null || decMonth?.receivables == null || !period.complete || history.rejectedRows > 0) {
    return unavailable("receivables", "Receivables movement cannot be established because source coverage is incomplete.");
  }
  const novClosing = Number(novMonth.receivables);
  const decClosing = Number(decMonth.receivables);
  const netIncrease = decimalAmount(amountCents(decMonth.receivables) - amountCents(novMonth.receivables));
  const cents = amountCents;
  if (period.posted === null || period.applied === null || period.adjustments === null ||
      cents(decMonth.receivables) - cents(novMonth.receivables) !== cents(period.posted) - cents(period.applied) + cents(period.adjustments)) {
    return unavailable("receivables", "The historical balances and period movement bridge do not reconcile. Review the source calculations before relying on a growth explanation.");
  }

  const topDrivers = period.contributors.slice(0, 5);
  const topBucket = [...period.ageingChanges].sort((a, b) => Number(b.change ?? 0) - Number(a.change ?? 0))[0];

  return {
    id: "receivables",
    topic: "Receivables",
    question: "Why are receivables increasing?",
    aliases: ["Receivables trend", "How have receivables changed?", "Show receivables trend", "Compare November and December receivables"],
    answer: `Receivables changed by ${formatLiveAmount(netIncrease)} during ${monthLabel} 2025. New postings of ${formatLiveAmount(period.posted)} were offset by ${formatLiveAmount(period.applied)} in allocated receipts and ${formatLiveAmount(period.adjustments)} in net adjustments.`,
    figure: [novMonth.receivables, decMonth.receivables].every((value) => amountCents(value) <= BigInt(Number.MAX_SAFE_INTEGER) && amountCents(value) >= BigInt(Number.MIN_SAFE_INTEGER)) ? {
      kind: "comparison",
      title: "Net receivables at month end",
      values: [
        { label: month > 1 ? `${labels[month - 2]} 2025` : "Dec 2024", amount: novClosing },
        { label: `${monthLabel} 2025`, amount: decClosing },
      ],
    } : undefined,
    facts: [
      { label: `${monthLabel} document-date billing`, value: formatLiveAmount(period.cohorts[month - 1]?.billing ?? null) },
      { label: `${monthLabel} cash received`, value: formatLiveAmount(period.cohorts[month - 1]?.cash ?? null) },
      { label: "Largest ageing-bucket increase", value: `${topBucket?.label ?? "Current"} · ${formatLiveAmount(topBucket?.change ?? null)}` },
    ],
    table: {
      title: `Largest customer contributors to ${monthLabel} growth`,
      columns: ["Customer", "Signed increase"],
      rows: topDrivers.map((row) => ({
        id: row.id,
        values: [row.name, formatLiveAmount(row.change)],
        href: `/receivables?customer=${encodeURIComponent(row.id)}`,
      })),
    },
    nextStep: `Review ${topDrivers[0]?.name ?? "top debtors"} and their overdue invoices. Open Period analysis to distinguish new postings, settlements and movements between ageing buckets.`,
    limitation: "Ageing exposure can increase when balances move into older buckets. Received cash and allocated cash are different flows. Figures originate from live database records; incomplete or unreconciled movements are withheld.",
    evidence: [
      { label: `Open ${monthLabel} period analysis`, caption: "Movements, due cohorts, customer drivers and source links", href: `/receivables?view=period&month=${month}` },
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
  if (!leadingCustomer) return unavailable("collections", "There are no overdue customers in the collection-priority results.");
  if (custResult.rejectedRows > 0 || oppResult.rejectedRows > 0 || rows.some((row) => row.actionable === null || row.disputed === null)) {
    return unavailable("collections", "Collection priorities have incomplete source coverage; affected amounts cannot be stated reliably.");
  }

  const rankedInvoices = rows.slice(0, 5).flatMap((customer) => oppResult.opportunities.filter((invoice) => invoice.partyId === customer.id));

  return {
    id: "collections",
    topic: "Collections",
    question: "Who needs collection attention today?",
    aliases: ["Collection priorities", "Who should I chase for payment?", "Show overdue invoice examples"],
    answer: `${leadingCustomer?.name ?? "Leading customer"} leads the live collection queue. Its actionable overdue balance is ${formatLiveAmount(leadingCustomer.actionable)}, after separating ${formatLiveAmount(leadingCustomer.disputed)} in unresolved disputed portions.`,
    facts: [
      { label: "Total actionable overdue", value: money(oppResult.totals.actionable) },
      { label: "Disputed overdue kept separate", value: money(oppResult.totals.disputed) },
      { label: "Leading customer's oldest due balance", value: `${leadingCustomer?.oldestDays ?? 0} days overdue` },
    ],
    table: {
      title: "Invoice actions for the five leading collection customers",
      columns: ["Customer / invoice", "Due date", "Collection portion", "Disputed portion", "Action"],
      rows: rankedInvoices.map((row) => ({
        id: row.id,
        values: [`${row.party} · ${row.id} (${row.number})`, row.due, money(row.actionable), money(row.disputed), row.step],
        href: `/receivables?invoice=${encodeURIComponent(row.id)}`,
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

export async function toolShortPayments(customerId?: string, month = 12): Promise<PreviewExample> {
  const result = await getShortPaymentCustomers(customerId, month);
  if (!result.complete) return unavailable("short-payments", "Under-settlement history is unavailable because balances, dates or source coverage are incomplete.");
  const leading = result.rows[0];
  if (!leading) return unavailable("short-payments", "No matching customer has a supported billing and collection history.");
  const history = result.history.filter((row) => row.id === leading.id);
  return {
    id: "short-payments", topic: "Short payments", question: "Who pays less than they are billed?", aliases: [],
    answer: `${leading.name} has ${formatLiveAmount(leading.shortfall)} in cumulative due-cohort shortfalls across ${leading.months} months, measured at each cohort's original month end. Overdue at month ${month} close is ${formatLiveAmount(leading.overdue)}; later collections explain why these are different measures.`,
    facts: [
      { label: `2025 billing through month ${month}`, value: formatLiveAmount(leading.billing) },
      { label: `2025 cash received through month ${month}`, value: formatLiveAmount(leading.cash) },
      { label: `Face value due through month ${month}`, value: formatLiveAmount(leading.due) },
      { label: "Cash applied to cohorts by their own closes", value: formatLiveAmount(leading.applied) },
      { label: `Net outstanding at month ${month} close`, value: formatLiveAmount(leading.closing) },
      { label: "One-month balance illustration", value: formatLiveAmount(leading.illustration) },
      { label: "Mean last-three-month net movement", value: formatLiveAmount(leading.monthlyMovement) },
    ],
    table: {
      title: `${leading.name}: period and cumulative shortfalls`, columns: ["Month", "Billing", "Cash received", "Due cohort face", "Applied by close", "Adjustments", "Shortfall", "Cumulative", "Overdue at close"],
      rows: history.map((row) => ({
        id: `${row.id}-${row.month}`, values: [`2025-${String(row.month).padStart(2, "0")}`, formatLiveAmount(row.billing), formatLiveAmount(row.cash), formatLiveAmount(row.due), formatLiveAmount(row.applied), formatLiveAmount(row.adjustments), formatLiveAmount(row.shortfall), formatLiveAmount(row.cumulativeShortfall), formatLiveAmount(row.overdue)],
        href: `/receivables?customer=${encodeURIComponent(row.id)}`,
      })),
    },
    limitation: "Cohorts include invoices recognized by their month end. Cumulative shortfalls are historical cohort observations, not today's collectible balance. Cash received is separate from invoice allocations. The next-month illustration is available after three complete months and uses their mean net movement, floored at zero; it is not a forecast or guaranteed collection. No cause such as unauthorized tax deduction is inferred.",
    nextStep: "Review repeated cohort gaps, the overdue trend and individual allocations with the customer owner before deciding the next collection action.",
    evidence: result.rows.slice(0, 5).map((row) => ({ label: `Open ${row.name} (${row.id})`, caption: `${formatLiveAmount(row.shortfall)} cumulative cohort shortfall; ${row.months} affected months`, href: `/receivables?customer=${encodeURIComponent(row.id)}` })),
  };
}

// Tool 4: Why Is This Customer High Risk?
export async function toolCustomerRisk(customerId?: string): Promise<PreviewExample> {
  const matches = customerId ? await findCustomers(customerId) : [];
  if (customerId && matches.length !== 1) {
    return {
      id: "customer-risk", topic: "Customer risk", question: "Which customer should be reviewed?", aliases: [],
      answer: matches.length > 1
        ? `Several customers match: ${matches.map((customer) => `${customer.name} (${customer.id})`).join(", ")}. Please choose one.`
        : `No customer matches "${customerId}" in the customer master. Please check the name or ID.`,
      limitation: "Customer identity must match a source master record before risk data can be retrieved.",
      nextStep: "Choose the customer's exact name or ID from Receivables.",
      evidence: [{ label: "Open customers", caption: "Find a customer in the live records", href: "/receivables?view=customers" }],
    };
  }
  const custResult = await getCustomerPriorities(matches[0]?.id);
  if (custResult.rejectedRows > 0) return unavailable("customer-risk", "Rejected source records prevent a complete customer risk assessment.");
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

  const target = customerId ? rows.find((row) => row.id === matches[0].id) : rows[0];
  if (!target) {
    const customer = matches[0];
    return {
      id: "customer-risk", topic: "Customer risk", question: "Customer risk review", aliases: [],
      answer: customer
        ? `${customer.name} (${customer.id}) exists in the customer master but has no eligible active invoice balances in the reporting scope. That does not establish a complete risk assessment.`
        : "There are no customers in the overdue collection-priority results.",
      limitation: "The collection-priority list covers overdue customers, not every customer in the master.",
      nextStep: "Review the customer's invoices and payment evidence before making a credit decision.",
      evidence: [{ label: "Open customer invoices", caption: "Inspect live source documents", href: customer ? `/receivables?customer=${encodeURIComponent(customer.id)}` : "/receivables" }],
    };
  }

  const [docList, activity] = await Promise.all([
    listDocuments("ar", 1, 5, "", "overdue", target.id, "outstanding", "desc"),
    getCustomerActivity(target.id),
  ]);

  const limit = target.limit === null ? null : amountCents(target.limit);
  const utilization = target.outstanding !== null && limit !== null && limit > 0n
    ? (amountCents(target.outstanding) * 1000n + limit / 2n) / limit : null;

  return {
    id: "customer-risk",
    topic: "Customer risk",
    question: "Why is this customer high risk?",
    aliases: ["Explain customer risk", "Show a customer risk example"],
    answer: `${target.name} (${target.id}) is classified as ${target.priority} priority based on these database-verified signals: ${target.reasons.join(", ") || "No high-priority signals were established from the available invoice balances"}.`,
    facts: [
      { label: "Credit period", value: matches[0]?.creditPeriodDays == null ? "Unavailable" : `${matches[0].creditPeriodDays} days` },
      { label: "Payment terms", value: matches[0]?.paymentTerms ?? "Unavailable" },
      { label: "Positive outstanding", value: formatLiveAmount(target.outstanding) },
      { label: "Current credit limit", value: formatLiveAmount(target.limit) },
      { label: "Limit utilisation", value: utilization === null ? "Unavailable" : `${utilization / 10n}.${utilization % 10n}%` },
      { label: "Oldest past due", value: `${target.oldestDays} days` },
      { label: "Actual settlement days", value: target.paymentDays ? `${Number(target.paymentDays).toFixed(1)} days` : "Unavailable" },
      { label: "Actionable collection amount", value: formatLiveAmount(target.actionable) },
      { label: "Source receipts / disputes / follow-ups", value: ["Receipt", "Dispute", "Follow-up"].map((kind) => `${activity.events.filter((event) => event.kind === kind).length} ${kind.toLowerCase()} records`).join(" · ") },
      { label: "Activity needing chronology/source review", value: String(activity.events.filter((event) => event.warning).length) },
      ...activity.events.filter((event) => event.kind !== "Receipt").slice(0, 4).map((event) => ({ label: `${event.kind} ${event.id} · ${event.date ?? "Date unavailable"}`, value: `${event.status ?? "Unknown"} · ${event.detail ?? "No detail"}${event.warning ? ` · ${event.warning}` : ""} · ${event.sourceFilename} record ${event.sourceRecordNumber}` })),
    ],
    table: {
      title: `Leading overdue source invoices for ${target.name}`,
      columns: ["Invoice", "Due date", "Outstanding"],
      rows: docList.rows.filter((d) => Number(d.outstanding) > 0).slice(0, 5).map((row) => ({
        id: row.id,
        values: [row.number ?? row.id, row.due ?? "", formatLiveAmount(row.outstanding)],
        href: `/receivables?invoice=${encodeURIComponent(row.id)}`,
      })),
    },
    nextStep: "Review the profile's payment history, dated follow-ups and invoice disputes. Confirm conflicting master terms with the owner.",
    limitation: "This analysis is retrieved dynamically from the live database. Current limits cannot establish historical limit revisions. The source risk-segment label does not determine the displayed priority.",
    evidence: [
      { label: `Open ${target.name} risk profile`, caption: "Terms, source invoices, disputes and follow-up history", href: `/receivables?customer=${encodeURIComponent(target.id)}` },
    ],
  };
}

// Tool 5: Which Vendor Payments Should Be Prioritised?
export async function toolVendorPriorities(): Promise<PreviewExample> {
  const oppResult = await getOpportunities();
  if (oppResult.rejectedRows > 0) return unavailable("vendor-payments", "Payment priorities have rejected source records and cannot be presented as complete.");
  const eligibleBills = oppResult.paymentReview.filter((b) => b.eligible);
  const blockedBills = oppResult.paymentReview.filter((b) => !b.eligible);

  const eligibleSum = eligibleBills.reduce((sum, b) => sum + amountCents(b.outstanding.toFixed(2)), 0n);
  const blockedSum = blockedBills.reduce((sum, b) => sum + amountCents(b.outstanding.toFixed(2)), 0n);

  return {
    id: "vendor-payments",
    topic: "Payables",
    question: "Which vendor payments should be prioritised?",
    aliases: ["Vendor payments", "Which vendor payments should be prioritized?", "Show payment priorities", "Show vendor holds"],
    answer: `There are ${eligibleBills.length} open supplier bills eligible for scheduling review and ${blockedBills.length} requiring control review. Eligible bills are ranked by a score for vendor criticality, the source MSME flag and days overdue, then due date and bill ID.`,
    facts: [
      { label: "Eligible outstanding for review", value: formatLiveAmount(decimalAmount(eligibleSum)) },
      { label: "Outstanding needing control review", value: formatLiveAmount(decimalAmount(blockedSum)) },
      { label: "Related posted payments requiring approval review", value: [...new Set(blockedBills.flatMap((bill) => bill.approvalWarnings.map((payment) => payment.id)))].join(", ") || "None" },
      { label: "Payment policy", value: "Posted allocations count; related payments without approved status require control review" },
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
    limitation: "Eligibility depends on verified source controls, including related posted-payment approval warnings; bill-level approval was not supplied. Guardrail: No payment initiation or ledger change is permitted from this decision-support agent.",
    evidence: [
      { label: "Open payment priorities and blocked obligations", caption: "Filter by review status and inspect allocations", href: "/payables?view=priorities" },
      { label: "Open the action queue", caption: "Collection and payment-control next steps", href: "/actions" },
    ],
  };
}

// Tool 6: Investigate a Financial Exception
export async function toolInvestigateException(issueId?: string, exceptionCategory?: "duplicates"): Promise<PreviewExample> {
  const excResult = await getExceptions();
  if (!issueId) {
    const candidates = exceptionCategory === "duplicates"
      ? excResult.rows.filter((issue) => /duplicate|reference collision/i.test(issue.kind))
      : excResult.rows;
    return {
      id: "exception", topic: "Exceptions", question: "Choose a financial exception", aliases: [],
      answer: candidates.length
        ? `${candidates.length} ${exceptionCategory === "duplicates" ? "duplicate or reference-collision review leads" : "financial exceptions"} match. Choose a specific issue to inspect its supporting records.`
        : "No matching exception exists in the current reporting scope.",
      facts: [{ label: "Matching issues", value: String(candidates.length) }],
      table: {
        title: "Choose an issue to investigate", columns: ["Issue", "Type", "Affected party"],
        rows: candidates.slice(0, 10).map((issue) => ({ id: issue.id, values: [issue.id, issue.kind, issue.party], href: `/exceptions?issue=${encodeURIComponent(issue.id)}` })),
      },
      nextStep: "Ask to investigate one of the listed issue IDs, or open its evidence drawer.",
      limitation: "A reference collision is an investigation lead, not proof of duplicate liability or fraud. Issue exposures can overlap.",
      evidence: [{ label: "Open exception register", caption: "Inspect an exact issue and its source records", href: "/exceptions" }],
    };
  }
  const matches = issueId ? excResult.rows.filter((issue) => issue.id.toUpperCase() === issueId.toUpperCase() || issue.evidence.some((reference) => reference.toUpperCase() === issueId.toUpperCase())) : [];
  if (issueId && matches.length !== 1 || !issueId && excResult.rows.length === 0) {
    return {
      id: "exception", topic: "Exceptions", question: "Exception investigation", aliases: [],
      answer: matches.length > 1 ? `Several issues reference ${issueId}: ${matches.map((issue) => issue.id).join(", ")}. Choose an issue to investigate.` : "No matching exception exists in the current reporting scope.",
      nextStep: "Choose a specific issue from the exceptions register.",
      limitation: "A missing or ambiguous reference cannot be replaced with another issue.",
      evidence: [{ label: "Open exceptions", caption: "Select the exact investigation", href: "/exceptions" }],
    };
  }
  const target = issueId ? matches[0] : excResult.rows[0];

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


export async function toolDocumentEvidence(documentId: string): Promise<PreviewExample> {
  const id = documentId.toUpperCase();
  const ledger = id.startsWith("ARI") ? "ar" : "ap";
  const row = await getDocumentEvidence(ledger, id);
  const href = ledger === "ar" ? `/receivables?invoice=${encodeURIComponent(id)}` : `/payables?bill=${encodeURIComponent(id)}`;
  return {
    id: "document-evidence", topic: "Document evidence", question: `Explain ${id}`, aliases: [],
    answer: row ? `${row.party} · ${row.number ?? row.id}: outstanding ${formatLiveAmount(row.outstanding)}. The balance is original amount less eligible cash allocations plus signed adjustments.` : `${id} was not found in the source document records.`,
    facts: row ? [
      { label: "Source status", value: row.sourceStatus ?? "Unavailable" },
      { label: "Original amount", value: formatLiveAmount(row.face) },
      { label: "Allocated cash", value: formatLiveAmount(row.paid) },
      { label: "Signed adjustments", value: formatLiveAmount(row.adjustment) },
      { label: "Outstanding", value: formatLiveAmount(row.outstanding) },
      { label: "Source location", value: `${row.sourceFilename}, data record ${row.sourceRecordNumber}` },
      { label: "Source allocation records", value: String(row.allocations.length) },
      { label: "Source adjustment records", value: String(row.adjustments.length) },
    ] : undefined,
    nextStep: "Open the source document to inspect allocation IDs, cash references and adjustments.",
    limitation: "Active balances and eligible events use the 31 December 2025 cutoff. Cancelled, reversed and future-posted source documents remain inspectable but have no active balance calculated here. An unavailable balance means the source cannot support a reliable amount; no missing amount is assumed to be zero.",
    evidence: [{ label: `Open ${id} evidence`, caption: "Original document, allocations, adjustments and CSV references", href }],
  };
}
