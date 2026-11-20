"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/loading-skeletons";
import { formatRupees, useLiveHistory } from "@/components/dashboard/live-history";
import { rupeesPerCrore } from "@/lib/demo-data";

const plotWidth = 640;
const plotHeight = 206;

const lines = [
  { key: "receivables", label: "Receivables" },
  { key: "payables", label: "Payables" },
] as const;

export function BalanceTrend() {
  const { state, retry } = useLiveHistory();
  const [month, setMonth] = useState(11);
  const [hovered, setHovered] = useState<number | null>(null);
  const data = state.status === "ready" ? state.data.months : [];
  const selected = Math.min(hovered ?? month, Math.max(0, data.length - 1));
  const active = data[selected];
  const available = data.flatMap((row) => [row.receivables, row.payables])
    .filter((amount): amount is string => amount !== null && Number.isFinite(Number(amount)))
    .map(Number);
  // Include zero in the scale while allowing negative balances to remain visible.
  const minimum = Math.min(0, ...available);
  const maximum = Math.max(0, ...available, minimum + 1);
  const tickValues = Array.from({ length: 5 }, (_, index) => maximum - index * (maximum - minimum) / 4);
  const positionX = (index: number) => (index + 0.5) * plotWidth / Math.max(data.length, 1);
  const positionY = (amount: number) => (maximum - amount) / (maximum - minimum) * plotHeight;

  return (
    <section className="overview-section balance-trend" aria-labelledby="balance-trend-title">
      <div className="overview-section-heading">
        <div><h2 id="balance-trend-title">Open balances over time</h2><p>2025 month-end closes · INR crore</p></div>
        <label className="select-box trend-period">
          <span className="sr-only">Inspect month-end balances</span>
          <select value={data.length ? Math.min(month, data.length - 1) : ""} disabled={!data.length} onChange={(event) => { setHovered(null); setMonth(Number(event.target.value)); }}>
            {data.length ? data.map((row, index) => <option key={row.date} value={index}>{row.month} 2025</option>) : <option value="">No periods</option>}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>
      {state.status === "loading" ? (
        <><span className="sr-only" role="status">Loading balance history</span><Skeleton className="skeleton-main-chart" /></>
      ) : state.status === "error" ? (
        <div className="trend-chart"><p role="alert">Balance history is unavailable. <button type="button" className="table-clear" onClick={retry}>Try again</button></p></div>
      ) : !data.length || !available.length ? (
        <div className="trend-chart"><p role="status">Balance history is unavailable.</p></div>
      ) : (
        <>
          {state.data.rejectedRows > 0 && <p className="finance-validation" role="status">Some source records were rejected. Balance history may be incomplete.</p>}
          <div className="trend-chart">
            <div className="trend-y-axis" aria-hidden="true">{tickValues.map((tick, index) => <span key={index}>{(tick / rupeesPerCrore).toFixed(2)}</span>)}</div>
            <div className="trend-canvas" onPointerLeave={() => setHovered(null)}>
              <svg className="trend-svg" viewBox={`0 0 ${plotWidth} ${plotHeight}`} preserveAspectRatio="none" aria-hidden="true">
                {tickValues.map((tick, index) => <line key={index} className="trend-gridline" x1="0" x2={plotWidth} y1={positionY(tick)} y2={positionY(tick)} vectorEffect="non-scaling-stroke" />)}
                {lines.flatMap(({ key }) => data.slice(1).map((row, index) => {
                  const start = data[index][key];
                  const end = row[key];
                  if (start === null || end === null || !Number.isFinite(Number(start)) || !Number.isFinite(Number(end))) return null;
                  return <line key={`${key}-${row.date}`} className={`trend-line trend-${key}`} x1={positionX(index)} y1={positionY(Number(start))} x2={positionX(index + 1)} y2={positionY(Number(end))} vectorEffect="non-scaling-stroke" />;
                }))}
                <line className="trend-marker" x1={positionX(selected)} x2={positionX(selected)} y1="0" y2={plotHeight} vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="trend-targets" aria-hidden="true">{data.map((row, index) => <span key={row.date} onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(index); }} />)}</div>
            </div>
            <div className="trend-x-axis" aria-hidden="true">{data.map((row, index) => <span key={row.date} className={index % 3 === 0 || index === data.length - 1 ? "trend-key-month" : undefined}>{row.month}</span>)}</div>
          </div>
        </>
      )}
      <div className="trend-readout">
        <strong className="trend-readout-date">{active ? `${active.month} 2025` : "Month-end balances"}</strong>
        {lines.map(({ key, label }) => <div key={key}><span className={`trend-swatch trend-${key}`} aria-hidden="true" /><span>{label}</span><strong>{formatRupees(active?.[key] ?? null)}</strong></div>)}
      </div>
      {data.some((row) => row.receivables === null || row.payables === null) && <p className="footnote">Some periods are unavailable because their source data needs review. Gaps are left in the chart.</p>}
    </section>
  );
}
