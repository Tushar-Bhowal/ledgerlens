import Link from "next/link";
import { StaticPreview } from "@/components/dashboard/view-mode";
import { StatCard } from "@/components/ui/stat-card";
import { days, financePreview, percent } from "./preview-data";
import { concentrations } from "./preview-selectors";
import { money } from "@/lib/demo-data";

export function AnalyticsSummary({ ledger }: { ledger: "ar" | "ap" }) {
  const metrics = financePreview.metrics[ledger];
  const documents = ledger === "ar" ? financePreview.invoices : financePreview.bills;
  const total = metrics.positive;
  const parties = Object.values(documents.reduce<Record<string, { id: string; party: string; amount: number }>>((result, row) => {
    const item = result[row.partyId] ?? { id: row.partyId, party: row.party, amount: 0 };
    item.amount += Math.max(0, row.outstanding);
    result[row.partyId] = item;
    return result;
  }, {})).sort((a, b) => b.amount - a.amount).slice(0, 5);

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading"><h2>{ledger === "ar" ? "Collection" : "Payment"} measures</h2></header>
      <div className="stat-strip">
        <StatCard label="Overdue share" value={metrics.overduePercent ?? "Unavailable"} format="percent" caption="Positive past-due / positive open" />
        <StatCard label={ledger === "ar" ? "DSO estimate" : "Purchase-based DPO proxy"} value={days(metrics.proxyDays)} caption="2025 supplied ledger estimate" />
        <StatCard label="Actual settlement days" value={days(metrics.elapsedDays)} caption="Amount-weighted elapsed days" />
      </div>
      <StaticPreview><p className="footnote">2025 measures use mean daily balance ÷ net document-date billing × 365. Settlement days weight each allocated portion from the original document date. The AP proxy uses purchases because COGS is absent.</p></StaticPreview>
      <div className="finance-two-column">
        <div><h3>Largest party concentrations</h3><StaticPreview fallback={<p className="footnote">No live party balances yet.</p>}><ol className="concentration-list">{parties.map((item) => <li key={item.id}><div>{ledger === "ar" ? <Link className="text-link" href={`/receivables?customer=${item.id}`}>{item.party}</Link> : item.party}<strong>{percent(item.amount / total)}</strong></div><span>{money(item.amount)}</span></li>)}</ol></StaticPreview></div>
        <div><h3>Allocated cash against due date</h3><dl className="detail-list">{metrics.patterns.map((item) => <div key={item.label}><dt>{item.label}</dt><dd><StaticPreview fallback="—">{money(item.amount)}</StaticPreview></dd></div>)}</dl><p className="footnote">Amounts apply only to settled portions. Open balances do not enter this distribution.</p></div>
      </div>
      <h3>Group concentration</h3>
      <p className="footnote">Members of the same source group are combined. The denominator is all positive outstanding in this ledger.</p>
      <div className="group-concentration-list">
        <StaticPreview fallback={<p className="footnote">No live group balances yet.</p>}>{concentrations(ledger).map((group) => (
          <details key={group.name}>
            <summary><span>{group.name}</span><strong>{money(group.amount)} · {percent(group.share)}</strong></summary>
            <ul>{group.members.map((member) => <li key={member.id}><Link className="text-link" href={ledger === "ar" ? `/receivables?customer=${member.id}` : `/payables?vendor=${member.id}`}>{member.name}</Link></li>)}</ul>
          </details>
        ))}</StaticPreview>
      </div>
      <details className="coverage-details"><summary>Source coverage and unavailable metrics</summary><p><StaticPreview fallback="Live source coverage will be available once financial data is connected.">Inventory, bank statements, GL and COGS are absent. Inventory days, full cash conversion cycle and bank/GL reconciliation are unavailable. Customer credit limits are current values, with no historical change register. This preview gives no legal recovery conclusion.</StaticPreview></p></details>
    </section>
  );
}
