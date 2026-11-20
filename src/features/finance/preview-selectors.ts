import { financePreview, type FinanceDocument } from "./preview-data";

export const asOf = financePreview.asOf;
export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (amount: number) => amount / 100;

export function totalAmount(values: readonly number[]) {
  return fromCents(values.reduce((sum, value) => sum + toCents(value), 0));
}

export function documentBalanceAt(document: FinanceDocument, date: string) {
  if (document.posted > date) return 0;
  const allocated = document.allocations.filter((item) => item.date <= date).reduce((sum, item) => sum + toCents(item.amount), 0);
  const adjusted = document.adjustments.filter((item) => item.date <= date).reduce((sum, item) => sum + toCents(item.amount), 0);
  return fromCents(toCents(document.face) - allocated + adjusted);
}

export function collectionExposure(document: FinanceDocument) {
  const open = Math.max(0, toCents(document.outstanding));
  const overdue = document.due < asOf ? open : 0;
  const unresolved = document.disputes
    .filter((item) => ["Open", "Under Review"].includes(item.status) && item.date >= document.date && item.date <= asOf)
    .reduce((sum, item) => sum + Math.max(0, toCents(item.amount)), 0);
  const disputed = Math.min(overdue, unresolved);
  return { overdue: fromCents(overdue), disputed: fromCents(disputed), actionable: fromCents(overdue - disputed) };
}

export const collectionPriorities = financePreview.customers
  .map((customer) => {
    const documents = financePreview.invoices.filter((row) => row.partyId === customer.id);
    const exposure = documents.map(collectionExposure);
    return {
      ...customer,
      overdue: totalAmount(exposure.map((row) => row.overdue)),
      disputed: totalAmount(exposure.map((row) => row.disputed)),
      actionable: totalAmount(exposure.map((row) => row.actionable)),
    };
  })
  .filter((row) => row.overdue > 0)
  .sort((a, b) => Number(b.risk === "High") - Number(a.risk === "High") || b.actionable - a.actionable || b.oldest - a.oldest || a.id.localeCompare(b.id));

export function concentrations(ledger: "ar" | "ap") {
  const documents = ledger === "ar" ? financePreview.invoices : financePreview.bills;
  const groups = new Map<string, { name: string; amount: number; members: Map<string, { id: string; name: string }> }>();
  for (const row of documents) {
    if (row.outstanding <= 0) continue;
    const name = ledger === "ar"
      ? financePreview.customers.find((item) => item.id === row.partyId)?.group
      : financePreview.vendors.find((item) => item.vendor_id === row.partyId)?.vendor_group;
    const group = groups.get(name ?? "Group unavailable") ?? { name: name ?? "Group unavailable", amount: 0, members: new Map() };
    group.amount += toCents(row.outstanding);
    group.members.set(row.partyId, { id: row.partyId, name: row.party });
    groups.set(group.name, group);
  }
  const total = totalAmount(documents.map((row) => Math.max(0, row.outstanding)));
  return [...groups.values()].map((group) => ({
    name: group.name,
    amount: fromCents(group.amount),
    share: total > 0 ? fromCents(group.amount) / total : null,
    members: [...group.members.values()],
  })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

export function previousDay(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function dueCohort(ledger: "ar" | "ap", month: number) {
  const period = financePreview.periods[ledger][month];
  const documents = (ledger === "ar" ? financePreview.invoices : financePreview.bills)
    .filter((row) => row.due >= period.start && row.due <= period.end && row.posted <= period.end);
  return {
    face: totalAmount(documents.map((row) => row.face)),
    applied: totalAmount(documents.flatMap((row) => row.allocations.filter((item) => item.date <= period.end).map((item) => item.amount))),
    adjustments: totalAmount(documents.flatMap((row) => row.adjustments.filter((item) => item.date <= period.end).map((item) => item.amount))),
    unpaid: totalAmount(documents.map((row) => Math.max(0, documentBalanceAt(row, period.end)))),
  };
}

const bucketLabels = ["Current", "1–30 days", "31–60 days", "61–90 days", "91+ days"];

function dueBucket(due: string, at: string) {
  const days = Math.floor((Date.parse(at) - Date.parse(due)) / 86_400_000);
  if (days <= 0) return 0;
  if (days <= 30) return 1;
  if (days <= 60) return 2;
  if (days <= 90) return 3;
  return 4;
}

export function ageingMovement(ledger: "ar" | "ap", month: number) {
  const period = financePreview.periods[ledger][month];
  const start = previousDay(period.start);
  const groups = bucketLabels.map((label) => ({ label, opening: 0, closing: 0 }));
  const documents = ledger === "ar" ? financePreview.invoices : financePreview.bills;
  for (const document of documents) {
    groups[dueBucket(document.due, start)].opening += Math.max(0, toCents(documentBalanceAt(document, start)));
    groups[dueBucket(document.due, period.end)].closing += Math.max(0, toCents(documentBalanceAt(document, period.end)));
  }
  return groups.map((group) => ({
    label: group.label,
    opening: fromCents(group.opening),
    closing: fromCents(group.closing),
    change: fromCents(group.closing - group.opening),
  }));
}

export function projectionIllustration(ledger: "ar" | "ap", month: number) {
  if (month < 2) return null;
  const periods = financePreview.periods[ledger].slice(month - 2, month + 1);
  const movement = totalAmount(periods.map((period) => totalAmount([period.closing, -period.opening]))) / periods.length;
  return {
    start: periods[0].month,
    end: periods[2].month,
    closing: periods[2].closing,
    monthlyMovement: fromCents(Math.round(movement * 100)),
    illustration: totalAmount([periods[2].closing, fromCents(Math.round(movement * 100))]),
  };
}

export const overdueDocuments = financePreview.invoices
  .map((document) => ({ ...document, ...collectionExposure(document) }))
  .filter((row) => row.overdue > 0);

export const opportunityTotals = {
  actionable: totalAmount(overdueDocuments.map((row) => row.actionable)),
  disputed: totalAmount(overdueDocuments.map((row) => row.disputed)),
  overdue: totalAmount(overdueDocuments.map((row) => row.overdue)),
};
