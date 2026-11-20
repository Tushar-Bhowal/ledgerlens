"use client";

import Link from "next/link";
import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { money } from "@/lib/demo-data";
import { ageingMovement, dueCohort, projectionIllustration } from "./preview-selectors";
import { financePreview } from "./preview-data";

export function PeriodAnalysis({ ledger }: { ledger: "ar" | "ap" }) {
  const periods = financePreview.periods[ledger];
  const [month, setMonth] = useState(11);
  const row = periods[month];
  const projection = projectionIllustration(ledger, month);
  const cohorts = periods.map((period, index) => ({ ...period, cohort: dueCohort(ledger, index) }));
  const metrics = [
    { label: "Opening", amount: row.opening },
    { label: "New postings", amount: row.posted },
    { label: "Cash applied", amount: -row.applied },
    { label: "Adjustments", amount: row.adjustments },
    { label: "Closing", amount: row.closing },
  ];
  const documents = ledger === "ar" ? financePreview.invoices : financePreview.bills;
  const contributors = documents.reduce<Record<string, { id: string; name: string; change: number }>>((result, document) => {
    const entry = result[document.partyId] ?? { id: document.partyId, name: document.party, change: 0 };
    if (document.posted >= row.start && document.posted <= row.end) entry.change += document.face;
    for (const allocation of document.allocations) if (allocation.date >= row.start && allocation.date <= row.end) entry.change -= allocation.amount;
    for (const adjustment of document.adjustments) if (adjustment.date >= row.start && adjustment.date <= row.end) entry.change += adjustment.amount;
    result[document.partyId] = entry;
    return result;
  }, {});
  const daily: { date: string; opening: number; posted: number; applied: number; adjustments: number; closing: number }[] = [];
  for (let day = 1; day <= Number(row.end.slice(-2)); day++) {
    const at = `${row.start.slice(0, 8)}${String(day).padStart(2, "0")}`;
    const prior = day === 1 ? row.opening : daily[day - 2].closing;
    const posted = documents.filter((item) => item.posted === at).reduce((sum, item) => sum + item.face, 0);
    const applied = documents.flatMap((item) => item.allocations).filter((item) => item.date === at).reduce((sum, item) => sum + item.amount, 0);
    const adjustments = documents.flatMap((item) => item.adjustments).filter((item) => item.date === at).reduce((sum, item) => sum + item.amount, 0);
    daily.push({ date: at, opening: prior, posted, applied, adjustments, closing: prior + posted - applied + adjustments });
  }

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading"><div><h2>Period analysis</h2><p>Movements in the supplied 2025 ledger</p></div><label className="preview-state-select">Period<select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{periods.map((item, index) => <option key={item.month} value={index}>{item.month} 2025</option>)}</select></label></header>
      <dl className="movement-strip">{metrics.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{money(item.amount)}</dd></div>)}</dl>
      <h3>Billing, cash and due cohorts</h3>
      <DataTable label="Monthly billing and cash" rows={cohorts} getRowKey={(item) => item.month} columns={[
        { id: "month", label: "Month", cell: (item) => `${item.month} 2025` },
        { id: "billing", label: "Document-date billing", align: "right", cell: (item) => money(item.billed) },
        { id: "cash", label: "Cash received / paid", align: "right", cell: (item) => money(item.cash) },
        { id: "applied", label: "All cash applied in month", align: "right", cell: (item) => money(item.applied) },
        { id: "due", label: "Recognised due cohort face", align: "right", cell: (item) => money(item.cohort.face) },
        { id: "cohort-applied", label: "Cohort cash applied by close", align: "right", cell: (item) => money(item.cohort.applied) },
        { id: "cohort-adjustments", label: "Cohort signed adjustments", align: "right", cell: (item) => money(item.cohort.adjustments) },
        { id: "unpaid", label: "Cohort unpaid at close", align: "right", cell: (item) => money(item.cohort.unpaid) },
        { id: "cumulative", label: "Cumulative shortfall", align: "right", cell: (item) => money(item.cumulativeShortfall) },
      ]} pageSize={6} />
      <p className="footnote">A due cohort contains documents due in that month and posted by its close. Its cash and signed adjustments include qualifying events through that close, including earlier settlements. Unpaid sums positive remaining balances per document. All cash applied in the month has a different scope. Cumulative shortfall sums distinct cohorts measured at their month end and may include balances settled later.</p>
      <h3>Contributors to the selected month’s change</h3>
      <DataTable label="Balance movement contributors" rows={Object.values(contributors).filter((item) => Math.abs(item.change) > 0.005)} getRowKey={(item) => item.id}
        defaultSort={{ columnId: "change", direction: "descending" }} columns={[
          { id: "party", label: "Party", cell: (item) => ledger === "ar" ? <Link className="text-link" href={`/receivables?customer=${item.id}`}>{item.name}</Link> : <Link className="text-link" href={`/payables?vendor=${item.id}`}>{item.name}</Link> },
          { id: "change", label: "Signed change", align: "right", compare: (a, b) => a.change - b.change, cell: (item) => money(item.change) },
        ]} pageSize={5} />
      <h3>Where ageing exposure changed</h3>
      <DataTable label="Ageing bucket changes" rows={ageingMovement(ledger, month)} getRowKey={(item) => item.label} columns={[
        { id: "bucket", label: "Due-date bucket", cell: (item) => item.label },
        { id: "opening", label: "Previous close", align: "right", cell: (item) => money(item.opening) },
        { id: "closing", label: "Selected close", align: "right", cell: (item) => money(item.closing) },
        { id: "change", label: "Signed change", align: "right", cell: (item) => money(item.change) },
      ]} pageSize={false} />
      <p className="footnote">Positive open balances can move into older buckets just because time passes. Bucket growth alone cannot establish new billing or a missed payment.</p>
      <h3>One-month balance illustration</h3>
      {projection ? (
        <>
          <dl className="movement-strip">
            <div><dt>Selected close</dt><dd>{money(projection.closing)}</dd></div>
            <div><dt>Mean net movement · {projection.start}–{projection.end}</dt><dd>{money(projection.monthlyMovement)}</dd></div>
            <div><dt>Following-month illustration</dt><dd>{money(projection.illustration)}</dd></div>
          </dl>
          <p className="footnote">Illustration = selected close + mean net balance movement over the last three completed months. It assumes similar billing, allocation and adjustment behavior. It is not a forecast or promised collection.</p>
        </>
      ) : <p className="footnote">Unavailable for this period. Select March or later to supply three completed comparison months.</p>}
      <h3>Daily opening-to-closing movement</h3>
      <DataTable label="Daily movement" rows={daily} getRowKey={(item) => item.date} columns={[
        { id: "date", label: "Date", cell: (item) => item.date },
        { id: "opening", label: "Opening", align: "right", cell: (item) => money(item.opening) },
        { id: "posted", label: "Postings", align: "right", cell: (item) => money(item.posted) },
        { id: "applied", label: "Allocations", align: "right", cell: (item) => money(item.applied) },
        { id: "adjustments", label: "Adjustments", align: "right", cell: (item) => money(item.adjustments) },
        { id: "closing", label: "Closing", align: "right", cell: (item) => money(item.closing) },
      ]} pageSize={7} />
      <p className="footnote">Posting date governs ledger recognition. The source pack defines the reporting boundary. Earlier balances outside the supplied records are unknown. The illustration above states its assumptions; unavailable source fields stay unavailable.</p>
    </section>
  );
}
