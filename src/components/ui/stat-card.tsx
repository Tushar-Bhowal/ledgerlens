import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CountUp, type CountFormat } from "./count-up";

type StatCardProps = {
  label: string;
  value: ReactNode;
  format?: CountFormat;
  caption?: string;
  icon?: LucideIcon;
  attention?: boolean;
  chart?: ReactNode;
};

export function StatCard({ label, value, format, caption, icon: Icon, attention = false, chart }: StatCardProps) {
  return (
    <article className="stat-card" data-attention={attention || undefined}>
      <div className="stat-card-heading">
        <span>{label}</span>
        {Icon && <Icon size={15} aria-hidden="true" />}
      </div>
      <strong className="stat-value">{typeof value === "number" ? <CountUp value={value} format={format} /> : value}</strong>
      {caption && <p className="stat-caption">{caption}</p>}
      {chart && <div className="stat-chart">{chart}</div>}
    </article>
  );
}
