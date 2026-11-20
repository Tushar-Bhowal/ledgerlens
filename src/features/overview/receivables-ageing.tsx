"use client";

import { ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import { useStaticView } from "@/components/dashboard/view-mode";
import { CountUp } from "@/components/ui/count-up";
import { money, receivableAgeing, rupeesPerCrore } from "@/lib/demo-data";

const [current, early, middle, late, oldest] = receivableAgeing;

const groups = [
  { id: "current", label: "Current", amount: current.amount },
  { id: "overdue", label: "1–90 days overdue", amount: early.amount + middle.amount + late.amount },
  { id: "long-overdue", label: "91+ days overdue", amount: oldest.amount },
];

const total = groups.reduce((sum, group) => sum + group.amount, 0);
const columns = groups.map(({ amount }) => `minmax(0, ${amount / total}fr)`).join(" ");
export function ReceivablesAgeing() {
  const isStaticView = useStaticView();
  return (
    <section className="overview-section ageing-summary" aria-labelledby="ageing-title">
      <div className="overview-section-heading">
        <div>
          <h2 id="ageing-title">Receivables by age</h2>
          <p>Positive outstanding balances · By due date</p>
        </div>
        <div className="ageing-total">
          <span>Total outstanding</span>
          <strong>{isStaticView ? <CountUp value={total / rupeesPerCrore} format="crore" /> : "—"}</strong>
        </div>
      </div>
      <div className="ageing-distribution" style={{ "--ageing-columns": isStaticView ? columns : "repeat(3, minmax(0, 1fr))" } as CSSProperties}>
        <dl className="ageing-groups">
          {groups.map(({ id, label, amount }) => (
            <div className="ageing-group" data-ageing-group={id} key={id}>
              <dt><span className="ageing-swatch" aria-hidden="true" />{label}</dt>
              <dd className="ageing-amount">{isStaticView ? <CountUp value={amount / rupeesPerCrore} format="crore" /> : "—"}</dd>
              <dd className="ageing-share">{isStaticView ? <><CountUp value={amount / total} format="percent" /><span className="sr-only"> of total outstanding</span></> : "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="ageing-bar" data-empty={!isStaticView || undefined} aria-hidden="true">
          {isStaticView && groups.map(({ id }) => <span key={id} data-ageing-group={id} />)}
        </div>
      </div>
      <details className="ageing-details">
        <summary>View all five ageing buckets <ChevronDown size={15} aria-hidden="true" /></summary>
        <dl>
          {receivableAgeing.map(({ label, amount }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{isStaticView ? money(amount) : "—"}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
