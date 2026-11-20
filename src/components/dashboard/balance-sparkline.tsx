"use client";

import { inCrore, monthEndBalances, rupeesPerCrore } from "@/lib/demo-data";
import { useStaticView } from "./view-mode";

const series = {
  receivables: { label: "Receivables", values: monthEndBalances.map((month) => month.receivables) },
  payables: { label: "Payables", values: monthEndBalances.map((month) => month.payables) },
  net: { label: "Net trade balance", values: monthEndBalances.map((month) => month.receivables - month.payables) },
};

export function BalanceSparkline({ balance }: { balance: keyof typeof series }) {
  const isStaticView = useStaticView();
  const { label, values } = series[balance];
  const width = 160;
  const baseline = 32;
  const ceiling = 4 * rupeesPerCrore;
  const points = values.map((amount, index) => {
    const x = index * width / (values.length - 1);
    const y = baseline - amount / ceiling * (baseline - 2);
    return `${x},${y}`;
  }).join(" ");
  const start = inCrore(values[0] / rupeesPerCrore);
  const end = inCrore(values[values.length - 1] / rupeesPerCrore);

  return (
    <div className="balance-sparkline">
      <svg viewBox={`0 0 ${width} 34`} preserveAspectRatio="none" role="img" aria-label={isStaticView ? `${label} at month-end, January to December 2025. January: ${start}. December: ${end}.` : `No live ${label.toLowerCase()} trend`}>
        <line className="sparkline-baseline" x1="0" x2={width} y1={baseline} y2={baseline} vectorEffect="non-scaling-stroke" />
        {isStaticView && <g className="chart-entrance">
          <polygon className="sparkline-fill" points={`0,${baseline} ${points} ${width},${baseline}`} />
          <polyline className="sparkline-line" points={points} vectorEffect="non-scaling-stroke" />
        </g>}
      </svg>
      <span aria-hidden="true">{isStaticView ? "Jan–Dec 2025" : "No trend data"}</span>
    </div>
  );
}
