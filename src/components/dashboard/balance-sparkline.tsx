"use client";

import { useLiveHistory } from "./live-history";

const series = {
  receivables: { label: "Receivables" },
  payables: { label: "Payables" },
  net: { label: "Net trade balance" },
};

export function BalanceSparkline({ balance }: { balance: keyof typeof series }) {
  const { state } = useLiveHistory();
  const { label } = series[balance];
  return <LiveSparkline balance={balance} label={label} state={state} />;
}

function LiveSparkline({ balance, label, state }: { balance: keyof typeof series; label: string; state: ReturnType<typeof useLiveHistory>["state"] }) {
  const rows = state.status === "ready" ? state.data.months : [];
  const values = rows.map((row) => {
    if (balance === "receivables") return row.receivables === null ? null : Number(row.receivables);
    if (balance === "payables") return row.payables === null ? null : Number(row.payables);
    return row.receivables === null || row.payables === null ? null : Number(row.receivables) - Number(row.payables);
  });
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = Math.min(0, ...available);
  const max = Math.max(0, ...available, min + 1);
  const x = (index: number) => index * 160 / Math.max(1, rows.length - 1);
  const y = (value: number) => 32 - ((value - min) / (max - min)) * 28;
  const message = state.status === "loading" ? "Loading trend" : state.status === "error" ? "Trend unavailable" : available.length ? "2025 month-end trend" : "No trend data";
  const pts = values.map((val, idx) => {
    const py = val !== null && Number.isFinite(val) ? y(val) : 32;
    return `${x(idx)},${py}`;
  }).join(" ");

  return (
    <div className="balance-sparkline">
      <svg viewBox="0 0 160 34" preserveAspectRatio="none" role="img" aria-label={`${label}: ${message}`}>
        <line className="sparkline-baseline" x1="0" x2="160" y1={32} y2={32} vectorEffect="non-scaling-stroke" />
        {available.length > 1 && (
          <g className="chart-entrance">
            <polygon className="sparkline-fill" points={`0,32 ${pts} 160,32`} />
            <polyline className="sparkline-line" points={pts} vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      <span aria-hidden="true">{message}</span>
    </div>
  );
}
