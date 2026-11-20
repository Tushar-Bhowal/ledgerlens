import { money } from "@/lib/demo-data";
import { financePreview, percent } from "@/features/finance/preview-data";
import { ageingMovement, collectionPriorities, documentBalanceAt, dueCohort, opportunityTotals, projectionIllustration, totalAmount } from "@/features/finance/preview-selectors";

export const followUp = "Show the source evidence";

type Fact = { label: string; value: string };
type Evidence = { label: string; caption: string; href: string };
type Figure = {
  kind: "comparison" | "allocation";
  title: string;
  values: readonly { label: string; amount: number }[];
};

export type PreviewExample = {
  id: string;
  topic: string;
  question: string;
  aliases: readonly string[];
  answer: string;
  facts?: readonly Fact[];
  figure?: Figure;
  table?: { title: string; columns: readonly string[]; rows: readonly { id: string; values: readonly string[]; href: string }[] };
  nextStep: string;
  limitation: string;
  evidence: readonly Evidence[];
};

const december = financePreview.periods.ar[11];
const decemberCohort = dueCohort("ar", 11);
const november = financePreview.periods.ar[10];
const bucketChanges = ageingMovement("ar", 11).sort((a, b) => b.change - a.change);
const customerDrivers = financePreview.customers.map((customer) => {
  const rows = financePreview.invoices.filter((invoice) => invoice.partyId === customer.id);
  const opening = totalAmount(rows.map((invoice) => documentBalanceAt(invoice, november.end)));
  const closing = totalAmount(rows.map((invoice) => documentBalanceAt(invoice, december.end)));
  return { ...customer, change: totalAmount([closing, -opening]) };
}).sort((a, b) => b.change - a.change);
const leadingCustomer = collectionPriorities[0];
const customerDocuments = financePreview.invoices.filter((invoice) => invoice.partyId === leadingCustomer.id);
const unresolved = customerDocuments.flatMap((invoice) => invoice.disputes).filter((dispute) => ["Open", "Under Review"].includes(dispute.status));
const lastThree = financePreview.periods.ar.slice(-3);
const illustration = projectionIllustration("ar", 11);
const shortfallCustomers = financePreview.customers.map((customer) => {
  const invoices = financePreview.invoices.filter((row) => row.partyId === customer.id);
  const cohorts = financePreview.periods.ar.map((period) => totalAmount(invoices
    .filter((invoice) => invoice.due >= period.start && invoice.due <= period.end)
    .map((invoice) => Math.max(0, documentBalanceAt(invoice, period.end)))));
  return { ...customer, periodsWithShortfall: cohorts.filter((amount) => amount > 0).length, shortfall: totalAmount(cohorts) };
}).filter((row) => row.periodsWithShortfall > 1).sort((a, b) => b.shortfall - a.shortfall);
const unpaidBills = financePreview.bills.filter((row) => row.outstanding > 0);
const eligibleBills = unpaidBills.filter((row) => row.eligibility === "Eligible for review");
const blockedBills = unpaidBills.filter((row) => row.eligibility === "Review");
const referenceCollision = financePreview.issues.find((issue) => issue.id === "REF-BILL-00021");
const referenceDocuments = financePreview.bills.filter((bill) => referenceCollision?.evidence.includes(bill.id));

export const examples: readonly PreviewExample[] = [
  {
    id: "receivables",
    topic: "Receivables",
    question: "Why are receivables increasing?",
    aliases: ["Receivables trend", "How have receivables changed?", "Show receivables trend", "Compare November and December receivables"],
    answer: `Receivables rose by ${money(totalAmount([december.closing, -december.opening]))} during December. New postings of ${money(december.posted)} were offset by ${money(december.applied)} in allocated receipts and ${money(december.adjustments)} in net adjustments.`,
    figure: { kind: "comparison", title: "Net receivables at month end", values: [
      { label: "Nov 2025", amount: november.closing },
      { label: "Dec 2025", amount: december.closing },
    ] },
    facts: [
      { label: "December document-date billing", value: money(december.billed) },
      { label: "December cash received", value: money(december.cash) },
      { label: "Largest ageing-bucket increase", value: `${bucketChanges[0].label} · ${money(bucketChanges[0].change)}` },
    ],
    table: { title: "Largest customer contributors to December growth", columns: ["Customer", "Signed increase"], rows: customerDrivers.slice(0, 5).map((row) => ({
      id: row.id, values: [row.name, money(row.change)], href: `/receivables?customer=${row.id}`,
    })) },
    nextStep: `Review ${customerDrivers[0].name} and its overdue invoices. Open Period analysis to distinguish new postings, settlements and movements between ageing buckets.`,
    limitation: "Ageing exposure can increase when balances move into older buckets. Received cash and allocated cash are different flows. The chart covers the supplied records.",
    evidence: [
      { label: "Open December period analysis", caption: "Movements, due cohorts, customer drivers and source links", href: "/receivables?view=period" },
      { label: "Open full balance trend", caption: "Jan–Dec 2025 month-end comparison", href: "/#balance-trend-title" },
    ],
  },
  {
    id: "collections",
    topic: "Collections",
    question: "Who needs collection attention today?",
    aliases: ["Collection priorities", "Who should I chase for payment?", "Show overdue invoice examples"],
    answer: `${leadingCustomer.name} leads the prepared collection queue. Its actionable overdue balance is ${money(leadingCustomer.actionable)}, after separating ${money(leadingCustomer.disputed)} in unresolved disputed portions.`,
    facts: [
      { label: "Total actionable overdue", value: money(opportunityTotals.actionable) },
      { label: "Disputed overdue kept separate", value: money(opportunityTotals.disputed) },
      { label: "Leading customer's oldest due balance", value: `${leadingCustomer.oldest} days overdue` },
    ],
    table: { title: "Collection priority list", columns: ["Customer", "Collection portion", "Disputed portion"], rows: collectionPriorities.slice(0, 5).map((row) => ({
      id: row.id, values: [row.name, money(row.actionable), money(row.disputed)], href: `/receivables?customer=${row.id}`,
    })) },
    nextStep: `Open ${leadingCustomer.name}, inspect its overdue invoices and coordinate with the collection owner. Route disputed portions for resolution.`,
    limitation: "Priority uses disclosed risk signals, then actionable overdue and oldest delay. A collection opportunity is a reviewable balance, not a guaranteed receipt.",
    evidence: [
      { label: `Open ${leadingCustomer.name}`, caption: "Credit terms, source invoices and follow-ups", href: `/receivables?customer=${leadingCustomer.id}` },
      { label: "Open unique-invoice collection opportunities", caption: "Capped disputes and collection portions", href: "/actions?view=opportunities" },
    ],
  },
  {
    id: "short-payments",
    topic: "Short payments",
    question: "Who pays less than they are billed?",
    aliases: ["Show short payments", "Show a partial payment", "Show underpaid invoices"],
    answer: `${shortfallCustomers[0].name} has the largest cumulative unpaid due-cohort balance in the prepared view, at ${money(shortfallCustomers[0].shortfall)} across ${shortfallCustomers[0].periodsWithShortfall} monthly cohorts with shortfall.`,
    facts: [
      { label: "December billing", value: money(december.billed) },
      { label: "December cash received", value: money(december.cash) },
      { label: "December due cohort cash applied by close", value: money(decemberCohort.applied) },
      { label: "December due cohort signed adjustments", value: money(decemberCohort.adjustments) },
      { label: "December due cohort unpaid at close", value: money(decemberCohort.unpaid) },
      { label: "Portfolio cumulative due-cohort shortfall", value: money(december.cumulativeShortfall) },
    ],
    figure: { kind: "comparison", title: "Unpaid due cohorts at their month end", values: lastThree.map((row) => ({ label: `${row.month} 2025`, amount: row.unpaidDue })) },
    table: { title: "Customers with repeated due-cohort shortfalls", columns: ["Customer", "Cohorts with shortfall", "Cumulative shortfall"], rows: shortfallCustomers.slice(0, 5).map((row) => ({
      id: row.id, values: [row.name, String(row.periodsWithShortfall), money(row.shortfall)], href: `/receivables?customer=${row.id}`,
    })) },
    nextStep: "Compare each customer’s due invoices and receipt allocations. Use Period analysis for the monthly cohort table and three-month balance illustration.",
    limitation: `Cumulative cohort shortfalls can contain amounts settled in later months. They differ from today's open balance. The following-month balance illustration is ${money(illustration?.illustration ?? december.closing)} and assumes the last three months' mean movement continues.`,
    evidence: [
      { label: "Open billing, collections and due cohorts", caption: "Monthly values and the labelled one-month illustration", href: "/receivables?view=period" },
      { label: `Open ${shortfallCustomers[0].name}`, caption: "Review actual invoices and allocations", href: `/receivables?customer=${shortfallCustomers[0].id}` },
    ],
  },
  {
    id: "customer-risk",
    topic: "Customer risk",
    question: "Why is this customer high risk?",
    aliases: ["Explain customer risk", "Show a customer risk example"],
    answer: `For the prepared example, ${leadingCustomer.name} is High priority because of these observed signals: ${leadingCustomer.reasons.join(", ")}.`,
    facts: [
      { label: "Positive outstanding", value: money(leadingCustomer.outstanding) },
      { label: "Current credit limit", value: money(leadingCustomer.limit) },
      { label: "Limit utilisation", value: percent(leadingCustomer.utilisation) },
      { label: "Source credit days / payment terms", value: `${leadingCustomer.termsDays} days / ${leadingCustomer.terms}` },
      { label: "Actual settlement days", value: leadingCustomer.paymentDays === null ? "Unavailable" : leadingCustomer.paymentDays.toFixed(1) },
      { label: "Linked unresolved disputes", value: String(unresolved.length) },
    ],
    table: { title: "Outstanding source invoices for this customer", columns: ["Invoice", "Due date", "Outstanding"], rows: customerDocuments.filter((row) => row.outstanding > 0).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5).map((row) => ({
      id: row.id, values: [row.number, row.due, money(row.outstanding)], href: `/receivables?invoice=${row.id}`,
    })) },
    nextStep: "Review the profile’s payment history, dated follow-ups and invoice disputes. Confirm conflicting master terms with the owner.",
    limitation: "This scripted example identifies its customer explicitly. Current limits cannot establish historical credit changes. The source risk-segment label does not determine the displayed priority.",
    evidence: [{ label: `Open the ${leadingCustomer.name} risk profile`, caption: "Terms, source invoices, disputes and follow-up history", href: `/receivables?customer=${leadingCustomer.id}` }],
  },
  {
    id: "vendor-payments",
    topic: "Payables",
    question: "Which vendor payments should be prioritised?",
    aliases: ["Vendor payments", "Which vendor payments should be prioritized?", "Show payment priorities", "Show vendor holds"],
    answer: `There are ${eligibleBills.length} open bills eligible for scheduling review and ${blockedBills.length} requiring control review. Eligible bills are ordered by overdue status, vendor criticality, due date and remaining balance.`,
    facts: [
      { label: "Eligible outstanding for review", value: money(totalAmount(eligibleBills.map((row) => row.outstanding))) },
      { label: "Outstanding needing control review", value: money(totalAmount(blockedBills.map((row) => row.outstanding))) },
      { label: "Payment policy", value: "Posted allocations count; pending approval remains a separate exception" },
    ],
    table: { title: "Leading eligible bills for human review", columns: ["Supplier / bill", "Due date", "Outstanding"], rows: eligibleBills.slice(0, 5).map((row) => ({
      id: row.id, values: [`${row.party} · ${row.number}`, row.due, money(row.outstanding)], href: `/payables?bill=${row.id}`,
    })) },
    nextStep: "Open Payment review, inspect terms and controls, and have the responsible person decide the schedule.",
    limitation: "Eligibility depends only on the supplied fields. No payment can be initiated or approved from this application.",
    evidence: [
      { label: "Open payment priorities and blocked obligations", caption: "Filter by review status and inspect allocations", href: "/payables?view=priorities" },
      { label: "Open the action queue", caption: "Collection and payment-control next steps", href: "/actions" },
    ],
  },
  {
    id: "exception",
    topic: "Exceptions",
    question: "Investigate a financial exception",
    aliases: ["Show me a financial exception", "Investigate an invoice mismatch", "Show an exception"],
    answer: "BILL-00021 appears on two supplier documents. Their parties, dates and amounts differ, so the shared reference needs investigation before anyone classifies it as duplicate liability.",
    facts: [
      { label: "Distinct source documents", value: String(referenceDocuments.length) },
      { label: "Gross face value of matched documents", value: money(totalAmount(referenceDocuments.map((row) => row.face))) },
      { label: "Potential excess liability", value: "Undetermined" },
    ],
    table: { title: "Compare the matching printed references", columns: ["Supplier / source", "Document date", "Face amount"], rows: referenceDocuments.map((row) => ({
      id: row.id, values: [`${row.party} · ${row.id}`, row.date, money(row.face)], href: `/payables?bill=${row.id}`,
    })) },
    nextStep: "Open both bills, compare purchase orders, goods receipts, allocations and supporting documents, and confirm the reference with the owners.",
    limitation: "Gross matched value is not confirmed duplicate exposure. Repeated text alone cannot establish fraud, a loss or an overpayment.",
    evidence: [{ label: "Open the reference-collision investigation", caption: "Both records and the recommended investigation", href: "/exceptions?issue=REF-BILL-00021" }],
  },
];
