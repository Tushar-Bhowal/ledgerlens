"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableSkeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { formatLiveAmount } from "./live-analysis-format";

type Amount = string | null;
type Movement = { opening: Amount; posted: Amount; applied: Amount; adjustments: Amount; closing: Amount };
type Cohort = { month: number | string; billing: Amount; cash: Amount; applied: Amount; face: Amount; settled: Amount; adjustments: Amount; unpaid: Amount; cumulativeShortfall: Amount };
type Period = Movement & {
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

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Result = { state: "loading" } | { state: "error" } | { state: "ready"; data: Period };

export function LivePeriodAnalysis({ ledger }: { ledger: "ar" | "ap" }) {
  const [month, setMonth] = useState(12);
  const [result, setResult] = useState<Result>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ ledger, month: String(month) });
    fetch(`/api/finance/analysis?${params}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Period analysis unavailable");
        return response.json() as Promise<Period>;
      })
      .then((data) => setResult({ state: "ready", data }))
      .catch(() => { if (!controller.signal.aborted) setResult({ state: "error" }); });
    return () => controller.abort();
  }, [ledger, month, attempt]);

  const row = result.state === "ready" ? result.data : null;
  const metrics = [
    { label: "Opening", amount: row?.opening ?? null },
    { label: "New postings", amount: row?.posted ?? null },
    { label: "Cash applied", amount: row?.applied ?? null },
    { label: "Adjustments", amount: row?.adjustments ?? null },
    { label: "Closing", amount: row?.closing ?? null },
  ];

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading">
        <div><h2>Period analysis</h2><p>Movements in the supplied 2025 ledger</p></div>
        <label className="preview-state-select">Period<select value={month} onChange={(event) => { setResult({ state: "loading" }); setMonth(Number(event.target.value)); }}>
          {months.map((name, index) => <option key={name} value={index + 1}>{name} 2025</option>)}
        </select></label>
      </header>
      {result.state === "loading" && <><span role="status" className="sr-only">Loading period analysis…</span><DataTableSkeleton columns={6} rows={5} /></>}
      {result.state === "error" && <StateMessage icon={CircleAlert} title="Period analysis unavailable" description="The ledger movements could not be loaded."><button type="button" className="table-tool-button" onClick={() => { setResult({ state: "loading" }); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Try again</button></StateMessage>}
      {row && (
        <>
          {(!row.complete || row.rejectedRows > 0) && <p className="finance-validation" role="status">Some source records need review. Affected figures are unavailable. Rejected import records: {row.rejectedRows}.</p>}
          <dl className="movement-strip">{metrics.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{formatLiveAmount(item.amount)}</dd></div>)}</dl>
          <h3>Billing, cash and due cohorts</h3>
            <DataTable label="Monthly billing and cash" rows={row.cohorts} getRowKey={(item) => String(item.month)} columns={[
              { id: "month", label: "Month", cell: (item) => typeof item.month === "number" ? `${months[item.month - 1]} 2025` : item.month },
              { id: "billing", label: "Document-date billing", align: "right", cell: (item) => formatLiveAmount(item.billing) },
              { id: "cash", label: "Cash received / paid", align: "right", cell: (item) => formatLiveAmount(item.cash) },
              { id: "applied", label: "All cash applied in month", align: "right", cell: (item) => formatLiveAmount(item.applied) },
              { id: "face", label: "Recognised due cohort face", align: "right", cell: (item) => formatLiveAmount(item.face) },
              { id: "settled", label: "Cohort cash applied by close", align: "right", cell: (item) => formatLiveAmount(item.settled) },
              { id: "adjustments", label: "Cohort signed adjustments", align: "right", cell: (item) => formatLiveAmount(item.adjustments) },
              { id: "unpaid", label: "Cohort unpaid at close", align: "right", cell: (item) => formatLiveAmount(item.unpaid) },
              { id: "cumulative", label: "Cumulative shortfall", align: "right", cell: (item) => formatLiveAmount(item.cumulativeShortfall) },
            ]} pageSize={6} />
            <p className="footnote">Cohort cash and adjustments include eligible events through that cohort&apos;s month end. Cumulative shortfalls may include amounts paid later.</p>
            <h3>Contributors to the selected month’s change</h3>
            <DataTable label="Balance movement contributors" rows={row.contributors} getRowKey={(item) => item.id} columns={[
              { id: "party", label: "Party", cell: (item) => <Link className="text-link" href={ledger === "ar" ? `/receivables?customer=${encodeURIComponent(item.id)}` : `/payables?vendor=${encodeURIComponent(item.id)}`}>{item.name}</Link> },
              { id: "change", label: "Signed change", align: "right", cell: (item) => formatLiveAmount(item.change) },
            ]} pageSize={5} />
            <h3>Where ageing exposure changed</h3>
            <DataTable label="Ageing bucket changes" rows={row.ageingChanges} getRowKey={(item) => item.label} columns={[
              { id: "bucket", label: "Due-date bucket", cell: (item) => item.label },
              { id: "opening", label: "Previous close", align: "right", cell: (item) => formatLiveAmount(item.opening) },
              { id: "closing", label: "Selected close", align: "right", cell: (item) => formatLiveAmount(item.closing) },
              { id: "change", label: "Signed change", align: "right", cell: (item) => formatLiveAmount(item.change) },
            ]} pageSize={false} />
            <p className="footnote">Balances can move into older buckets as time passes. Bucket growth alone cannot establish new billing or a missed payment.</p>
            <h3>One-month balance illustration</h3>
            {row.projection ? (
              <>
                <dl className="movement-strip">
                  <div><dt>Selected close</dt><dd>{formatLiveAmount(row.projection.closing)}</dd></div>
                  <div><dt>Mean net movement · {row.projection.start}–{row.projection.end}</dt><dd>{formatLiveAmount(row.projection.monthlyMovement)}</dd></div>
                  <div><dt>Following-month illustration</dt><dd>{formatLiveAmount(row.projection.illustration)}</dd></div>
                </dl>
                <p className="footnote">This illustration assumes the mean net movement of three completed months continues.</p>
              </>
            ) : <p className="footnote">Unavailable without three complete comparison months.</p>}
            <h3>Daily opening-to-closing movement</h3>
            <DataTable label="Daily movement" rows={row.daily} getRowKey={(item) => item.date} columns={[
              { id: "date", label: "Date", cell: (item) => item.date },
              { id: "opening", label: "Opening", align: "right", cell: (item) => formatLiveAmount(item.opening) },
              { id: "posted", label: "Postings", align: "right", cell: (item) => formatLiveAmount(item.posted) },
              { id: "applied", label: "Allocations", align: "right", cell: (item) => formatLiveAmount(item.applied) },
              { id: "adjustments", label: "Adjustments", align: "right", cell: (item) => formatLiveAmount(item.adjustments) },
              { id: "closing", label: "Closing", align: "right", cell: (item) => formatLiveAmount(item.closing) },
            ]} pageSize={7} />
          <p className="footnote">The period and cutoff are based on the supplied records. Earlier balances outside the source are unknown. Party links open current records; they do not preserve the selected month.</p>
        </>
      )}
    </section>
  );
}
