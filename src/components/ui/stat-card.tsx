import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CountUp, type CountFormat } from "./count-up";
import { LiveStatValue } from "@/components/dashboard/live-stat-value";
import type { SummaryKey } from "@/components/dashboard/live-summary";

type StatCardProps = {
  label: string;
  value: ReactNode;
  format?: CountFormat;
  caption?: ReactNode;
  icon?: LucideIcon;
  attention?: boolean;
  chart?: ReactNode;
  liveKey?: SummaryKey;
};

export function StatCard({ label, value, format, caption, icon: Icon, attention = false, chart, liveKey }: StatCardProps) {
  return (
    <article className="stat-card" data-attention={attention || undefined}>
      <div className="stat-card-heading">
        <span>{label}</span>
        {Icon && <Icon size={15} aria-hidden="true" />}
      </div>
      <strong className="stat-value">
        {liveKey ? <LiveStatValue stat={liveKey} format={format} /> : typeof value === "number" ? <CountUp value={value} format={format} /> : value}
      </strong>
      {caption && <p className="stat-caption">{caption}</p>}
      {chart && <div className="stat-chart">{chart}</div>}
    </article>
  );
}
