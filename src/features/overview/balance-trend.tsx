"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useStaticView } from "@/components/dashboard/view-mode";
import { CountUp } from "@/components/ui/count-up";
import { monthEndBalances, rupeesPerCrore } from "@/lib/demo-data";

const months = monthEndBalances.length;
const plotWidth = 640;
const plotHeight = 206;
const maxBalance = 4 * rupeesPerCrore;
const ticks = [4, 3, 2, 1, 0];

const x = (index: number) => (index + 0.5) * plotWidth / months;
const y = (amount: number) => (1 - amount / maxBalance) * plotHeight;

const lines = [
  { key: "receivables", label: "Receivables" },
  { key: "payables", label: "Payables" },
] as const;

const points = lines.map(({ key }) => monthEndBalances.map((balance, index) => `${x(index)},${y(balance[key])}`).join(" "));

export function BalanceTrend() {
  const isStaticView = useStaticView();
  const [month, setMonth] = useState(months - 1);
  const [hovered, setHovered] = useState<number | null>(null);
  const activeIndex = hovered ?? month;
  const active = monthEndBalances[activeIndex];

  return (
    <section className="overview-section balance-trend" aria-labelledby="balance-trend-title">
      <div className="overview-section-heading">
        <div>
          <h2 id="balance-trend-title">Open balances over time</h2>
          <p>{isStaticView ? "2025 month-end closes · INR crore" : "Month-end closes · INR crore"}</p>
        </div>
        <label className="select-box trend-period">
          <span className="sr-only">Inspect month-end balances</span>
          <select value={isStaticView ? month : ""} disabled={!isStaticView} onChange={(event) => { setHovered(null); setMonth(Number(event.target.value)); }}>
            {isStaticView ? monthEndBalances.map(({ month: label }, index) => <option key={label} value={index}>{label} 2025</option>) : <option value="">No periods</option>}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>

      <div className="trend-chart">
        <div className="trend-y-axis" aria-hidden="true">
          {isStaticView && ticks.map((tick) => <span key={tick}>{tick}</span>)}
        </div>
        <div className="trend-canvas" onPointerLeave={() => setHovered(null)}>
          <svg className="trend-svg" viewBox={`0 0 ${plotWidth} ${plotHeight}`} preserveAspectRatio="none" aria-hidden="true">
            {ticks.map((tick) => (
              <line key={tick} className="trend-gridline" x1="0" x2={plotWidth} y1={y(tick * rupeesPerCrore)} y2={y(tick * rupeesPerCrore)} vectorEffect="non-scaling-stroke" />
            ))}
            {isStaticView && (
              <>
                <g className="chart-entrance">
                  <polygon className="trend-fill" points={`${x(0)},${plotHeight} ${points[0]} ${x(months - 1)},${plotHeight}`} />
                  {lines.map(({ key }, index) => <polyline key={key} className={`trend-line trend-${key}`} points={points[index]} vectorEffect="non-scaling-stroke" />)}
                </g>
                <line className="trend-marker" x1={x(activeIndex)} x2={x(activeIndex)} y1="0" y2={plotHeight} vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>
          <div className="trend-targets" aria-hidden="true">
            {isStaticView && monthEndBalances.map(({ month: label }, index) => (
              <span key={label} onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(index); }} />
            ))}
          </div>
          {!isStaticView && <p className="trend-empty">No live balance history yet</p>}
        </div>
        <div className="trend-x-axis" aria-hidden="true">
          {isStaticView && monthEndBalances.map(({ month: label }, index) => (
            <span key={label} className={index % 3 === 0 || index === months - 1 ? "trend-key-month" : undefined}>{label}</span>
          ))}
        </div>
      </div>

      <div className="trend-readout">
        <strong className="trend-readout-date">{isStaticView ? `${active.month} 2025` : "Month-end balances"}</strong>
        {lines.map(({ key, label }) => (
          <div key={key}>
            <span className={`trend-swatch trend-${key}`} aria-hidden="true" />
            <span>{label}</span>
            <strong>{isStaticView ? <CountUp value={active[key]} format="rupees" initialOnly /> : "—"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
