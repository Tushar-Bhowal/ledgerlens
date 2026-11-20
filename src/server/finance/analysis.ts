import "server-only";
import { getDatabasePool } from "@/server/db";
import { reportingDate, type Ledger } from "./documents";

type Amount = string | null;
type Movement = { opening: Amount; posted: Amount; applied: Amount; adjustments: Amount; closing: Amount };
type Cohort = {
  month: number;
  billing: Amount;
  cash: Amount;
  applied: Amount;
  face: Amount;
  settled: Amount;
  adjustments: Amount;
  unpaid: Amount;
  cumulativeShortfall: Amount;
};

export type PeriodAnalysisResult = Movement & {
  asOf: string;
  month: number;
  daily: (Movement & { date: string })[];
  cohorts: Cohort[];
  contributors: { id: string; name: string; change: Amount }[];
  ageingChanges: { label: string; opening: Amount; closing: Amount; change: Amount }[];
  projection: { closing: Amount; monthlyMovement: Amount; illustration: Amount; start: string; end: string } | null;
  rejectedRows: number;
  complete: boolean;
};

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatAmount(val: number | null | undefined): Amount {
  if (val === null || val === undefined || Number.isNaN(val)) return null;
  return (Math.round(val * 100) / 100).toFixed(2);
}

export async function getPeriodAnalysis(ledger: Ledger, selectedMonth: number): Promise<PeriodAnalysisResult> {
  const pool = getDatabasePool();
  const ar = ledger === "ar";
  const idCol = ar ? "invoice_id" : "bill_id";
  const partyCol = ar ? "customer_id" : "vendor_id";
  const headerTable = ar ? "ar_invoices" : "ap_invoices";
  const masterTable = ar ? "customer_master" : "vendor_master";
  const partyNameCol = ar ? "customer_name" : "vendor_name";
  const dateCol = ar ? "invoice_date" : "bill_date";
  const amountCol = ar ? "invoice_amount_inr" : "bill_amount_inr";
  const allocTable = ar ? "ar_receipt_allocations" : "ap_payment_allocations";
  const cashTable = ar ? "ar_receipts" : "ap_payments";
  const cashDateCol = ar ? "receipt_date" : "payment_date";
  const cashAmountCol = ar ? "receipt_amount_inr" : "payment_amount_inr";
  const adjTable = ar ? "ar_adjustments" : "ap_adjustments";

  // Check rejected import records
  const rejResult = await pool.query<{ rejected: number }>(
    "SELECT count(*)::integer AS rejected FROM finance.import_issues WHERE issue_code = 'rejected'"
  );
  const rejectedRows = rejResult.rows[0]?.rejected ?? 0;

  // 1. Fetch all documents for this ledger
  const docsQuery = await pool.query<{
    id: string;
    party_id: string;
    party_name: string;
    doc_date: string;
    posting_date: string;
    due_date: string;
    face: number;
  }>(`
    SELECT d.${idCol} AS id, d.${partyCol} AS party_id, m.${partyNameCol} AS party_name,
      d.${dateCol}::text AS doc_date, d.posting_date::text AS posting_date, d.due_date::text AS due_date,
      d.${amountCol}::numeric AS face
    FROM finance.${headerTable} d
    JOIN finance.${masterTable} m ON m.${partyCol} = d.${partyCol}
    WHERE d.status = 'Posted'
  `);

  // 2. Fetch all eligible allocations
  const allocsQuery = await pool.query<{
    doc_id: string;
    party_id: string;
    alloc_date: string;
    amount: number;
  }>(`
    SELECT a.${idCol} AS doc_id, c.${partyCol} AS party_id,
      a.allocation_date::text AS alloc_date, a.allocated_amount_inr::numeric AS amount
    FROM finance.${allocTable} a
    JOIN finance.${cashTable} c ON c.${ar ? "receipt_id" : "payment_id"} = a.${ar ? "receipt_id" : "payment_id"}
    WHERE a.status = 'Allocated' AND c.status = 'Posted'
  `);

  // 3. Fetch all eligible adjustments
  const adjsQuery = await pool.query<{
    doc_id: string;
    party_id: string;
    adj_date: string;
    amount: number;
  }>(`
    SELECT a.${idCol} AS doc_id, a.${partyCol} AS party_id,
      a.adjustment_date::text AS adj_date,
      (CASE a.adjustment_type WHEN 'Credit Note' THEN -a.amount_inr WHEN 'Debit Note' THEN a.amount_inr ELSE 0 END)::numeric AS amount
    FROM finance.${adjTable} a
    WHERE a.status = 'Posted'
  `);

  // 4. Fetch raw cash vouchers by month
  const cashQuery = await pool.query<{
    month: number;
    cash_total: number;
  }>(`
    SELECT EXTRACT(MONTH FROM ${cashDateCol})::integer AS month,
      SUM(${cashAmountCol})::numeric AS cash_total
    FROM finance.${cashTable}
    WHERE status = 'Posted' AND EXTRACT(YEAR FROM ${cashDateCol}) = 2025
    GROUP BY EXTRACT(MONTH FROM ${cashDateCol})
  `);
  const cashByMonth = new Map<number, number>();
  for (const row of cashQuery.rows) {
    cashByMonth.set(row.month, Number(row.cash_total));
  }

  const docs = docsQuery.rows.map((r) => ({
    id: r.id,
    partyId: r.party_id,
    partyName: r.party_name,
    docDate: r.doc_date,
    postingDate: r.posting_date,
    dueDate: r.due_date,
    face: Number(r.face),
  }));

  const allocs = allocsQuery.rows.map((r) => ({
    docId: r.doc_id,
    partyId: r.party_id,
    date: r.alloc_date,
    amount: Number(r.amount),
  }));

  const adjs = adjsQuery.rows.map((r) => ({
    docId: r.doc_id,
    partyId: r.party_id,
    date: r.adj_date,
    amount: Number(r.amount),
  }));

  // Helper to calculate document balance at a specific date
  function docBalanceAt(doc: typeof docs[0], atDate: string): number {
    if (doc.postingDate > atDate) return 0;
    const docAllocs = allocs.filter((a) => a.docId === doc.id && a.date <= atDate);
    const docAdjs = adjs.filter((j) => j.docId === doc.id && j.date <= atDate);
    const allocated = docAllocs.reduce((sum, a) => sum + Math.round(a.amount * 100), 0);
    const adjusted = docAdjs.reduce((sum, j) => sum + Math.round(j.amount * 100), 0);
    return (Math.round(doc.face * 100) - allocated + adjusted) / 100;
  }

  // Calculate 12 monthly periods for 2025
  type MonthSummary = {
    month: number;
    start: string;
    end: string;
    opening: number;
    posted: number;
    applied: number;
    adjustments: number;
    closing: number;
    billing: number;
    cash: number;
  };

  const monthSummaries: MonthSummary[] = [];
  let rollingBalance = 0;

  for (let m = 1; m <= 12; m++) {
    const lastDay = new Date(2025, m, 0).getDate();
    const start = `2025-${String(m).padStart(2, "0")}-01`;
    const end = `2025-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const postedDocs = docs.filter((d) => d.postingDate >= start && d.postingDate <= end);
    const posted = postedDocs.reduce((sum, d) => sum + Math.round(d.face * 100), 0) / 100;

    const monthAllocs = allocs.filter((a) => a.date >= start && a.date <= end);
    const applied = monthAllocs.reduce((sum, a) => sum + Math.round(a.amount * 100), 0) / 100;

    const monthAdjs = adjs.filter((j) => j.date >= start && j.date <= end);
    const adjustments = monthAdjs.reduce((sum, j) => sum + Math.round(j.amount * 100), 0) / 100;

    const opening = rollingBalance;
    const closing = (Math.round(opening * 100) + Math.round(posted * 100) - Math.round(applied * 100) + Math.round(adjustments * 100)) / 100;
    rollingBalance = closing;

    const billedDocs = docs.filter((d) => d.docDate >= start && d.docDate <= end);
    const billing = billedDocs.reduce((sum, d) => sum + Math.round(d.face * 100), 0) / 100;
    const cash = cashByMonth.get(m) ?? 0;

    monthSummaries.push({ month: m, start, end, opening, posted, applied, adjustments, closing, billing, cash });
  }

  // Calculate due cohorts for all 12 months
  let runningCumulativeShortfall = 0;
  const cohorts: Cohort[] = monthSummaries.map((ms) => {
    // Due cohort: documents due in this month that were posted on or before end
    const cohortDocs = docs.filter((d) => d.dueDate >= ms.start && d.dueDate <= ms.end && d.postingDate <= ms.end);
    const face = cohortDocs.reduce((sum, d) => sum + Math.round(d.face * 100), 0) / 100;

    const cohortDocIds = new Set(cohortDocs.map((d) => d.id));
    const cohortAllocs = allocs.filter((a) => cohortDocIds.has(a.docId) && a.date <= ms.end);
    const settled = cohortAllocs.reduce((sum, a) => sum + Math.round(a.amount * 100), 0) / 100;

    const cohortAdjs = adjs.filter((j) => cohortDocIds.has(j.docId) && j.date <= ms.end);
    const adjustments = cohortAdjs.reduce((sum, j) => sum + Math.round(j.amount * 100), 0) / 100;

    const unpaid = cohortDocs.reduce((sum, d) => {
      const bal = docBalanceAt(d, ms.end);
      return sum + (bal > 0 ? Math.round(bal * 100) : 0);
    }, 0) / 100;

    runningCumulativeShortfall = (Math.round(runningCumulativeShortfall * 100) + Math.round(unpaid * 100)) / 100;

    return {
      month: ms.month,
      billing: formatAmount(ms.billing),
      cash: formatAmount(ms.cash),
      applied: formatAmount(ms.applied),
      face: formatAmount(face),
      settled: formatAmount(settled),
      adjustments: formatAmount(adjustments),
      unpaid: formatAmount(unpaid),
      cumulativeShortfall: formatAmount(runningCumulativeShortfall),
    };
  });

  // Selected month data
  const targetMonth = Math.min(Math.max(selectedMonth, 1), 12);
  const selectedSummary = monthSummaries[targetMonth - 1];

  // Daily movement in selected month
  const daily: PeriodAnalysisResult["daily"] = [];
  const daysInSelectedMonth = new Date(2025, targetMonth, 0).getDate();
  let dayRollingBalance = selectedSummary.opening;

  for (let d = 1; d <= daysInSelectedMonth; d++) {
    const at = `2025-${String(targetMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayDocs = docs.filter((item) => item.postingDate === at);
    const dayPosted = dayDocs.reduce((sum, item) => sum + Math.round(item.face * 100), 0) / 100;

    const dayAllocs = allocs.filter((item) => item.date === at);
    const dayApplied = dayAllocs.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;

    const dayAdjs = adjs.filter((item) => item.date === at);
    const dayAdjustments = dayAdjs.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;

    const dayOpening = dayRollingBalance;
    const dayClosing = (Math.round(dayOpening * 100) + Math.round(dayPosted * 100) - Math.round(dayApplied * 100) + Math.round(dayAdjustments * 100)) / 100;
    dayRollingBalance = dayClosing;

    daily.push({
      date: at,
      opening: formatAmount(dayOpening),
      posted: formatAmount(dayPosted),
      applied: formatAmount(dayApplied),
      adjustments: formatAmount(dayAdjustments),
      closing: formatAmount(dayClosing),
    });
  }

  // Contributors for the selected month
  const partyMap = new Map<string, { id: string; name: string; change: number }>();
  for (const d of docs) {
    if (!partyMap.has(d.partyId)) {
      partyMap.set(d.partyId, { id: d.partyId, name: d.partyName, change: 0 });
    }
    if (d.postingDate >= selectedSummary.start && d.postingDate <= selectedSummary.end) {
      const entry = partyMap.get(d.partyId)!;
      entry.change = (Math.round(entry.change * 100) + Math.round(d.face * 100)) / 100;
    }
  }
  for (const a of allocs) {
    if (a.date >= selectedSummary.start && a.date <= selectedSummary.end && partyMap.has(a.partyId)) {
      const entry = partyMap.get(a.partyId)!;
      entry.change = (Math.round(entry.change * 100) - Math.round(a.amount * 100)) / 100;
    }
  }
  for (const j of adjs) {
    if (j.date >= selectedSummary.start && j.date <= selectedSummary.end && partyMap.has(j.partyId)) {
      const entry = partyMap.get(j.partyId)!;
      entry.change = (Math.round(entry.change * 100) + Math.round(j.amount * 100)) / 100;
    }
  }
  const contributors = [...partyMap.values()]
    .filter((p) => p.change !== 0)
    .sort((a, b) => b.change - a.change)
    .map((p) => ({ id: p.id, name: p.name, change: formatAmount(p.change) }));

  // Ageing changes in selected month (opening vs closing)
  const bucketLabels = ["Current", "1–30 days", "31–60 days", "61–90 days", "91+ days"];
  function getDueBucket(due: string, at: string): number {
    const elapsed = Math.floor((Date.parse(at) - Date.parse(due)) / 86_400_000);
    if (elapsed <= 0) return 0;
    if (elapsed <= 30) return 1;
    if (elapsed <= 60) return 2;
    if (elapsed <= 90) return 3;
    return 4;
  }

  // Prior day before month start
  const priorDate = new Date(`${selectedSummary.start}T00:00:00Z`);
  priorDate.setUTCDate(priorDate.getUTCDate() - 1);
  const priorDateStr = priorDate.toISOString().slice(0, 10);

  const bucketOpening = [0, 0, 0, 0, 0];
  const bucketClosing = [0, 0, 0, 0, 0];

  for (const d of docs) {
    const openBal = docBalanceAt(d, priorDateStr);
    if (openBal > 0) {
      bucketOpening[getDueBucket(d.dueDate, priorDateStr)] += Math.round(openBal * 100);
    }
    const closeBal = docBalanceAt(d, selectedSummary.end);
    if (closeBal > 0) {
      bucketClosing[getDueBucket(d.dueDate, selectedSummary.end)] += Math.round(closeBal * 100);
    }
  }

  const ageingChanges = bucketLabels.map((label, idx) => {
    const op = bucketOpening[idx] / 100;
    const cl = bucketClosing[idx] / 100;
    return {
      label,
      opening: formatAmount(op),
      closing: formatAmount(cl),
      change: formatAmount(cl - op),
    };
  });

  // Projection illustration: 3-month mean net movement added to closing
  let projection: PeriodAnalysisResult["projection"] = null;
  if (targetMonth >= 3) {
    const pWindow = monthSummaries.slice(targetMonth - 3, targetMonth);
    const sumMovement = pWindow.reduce((sum, m) => sum + (Math.round(m.closing * 100) - Math.round(m.opening * 100)), 0);
    const avgMovement = Math.round(sumMovement / 3) / 100;
    const projIllustration = (Math.round(selectedSummary.closing * 100) + Math.round(avgMovement * 100)) / 100;
    projection = {
      start: monthNames[pWindow[0].month - 1],
      end: monthNames[pWindow[2].month - 1],
      closing: formatAmount(selectedSummary.closing),
      monthlyMovement: formatAmount(avgMovement),
      illustration: formatAmount(projIllustration),
    };
  }

  return {
    asOf: reportingDate,
    month: targetMonth,
    opening: formatAmount(selectedSummary.opening),
    posted: formatAmount(selectedSummary.posted),
    applied: formatAmount(selectedSummary.applied),
    adjustments: formatAmount(selectedSummary.adjustments),
    closing: formatAmount(selectedSummary.closing),
    daily,
    cohorts,
    contributors,
    ageingChanges,
    projection,
    rejectedRows,
    complete: rejectedRows === 0,
  };
}
