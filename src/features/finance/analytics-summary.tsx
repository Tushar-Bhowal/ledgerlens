"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { DataTableSkeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { StatCard } from "@/components/ui/stat-card";
import { days, percent } from "./preview-data";
import { formatLiveAmount } from "./live-analysis-format";
import type { MeasuresResult } from "@/server/finance/measures";

export function AnalyticsSummary({ ledger }: { ledger: "ar" | "ap" }) {
  const [liveData, setLiveData] = useState<MeasuresResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/finance/measures?ledger=${ledger}`, { signal: controller.signal, cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Measures unavailable");
        return res.json() as Promise<MeasuresResult>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setLiveData(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [ledger, attempt]);

  const metrics = {
    overduePercent: liveData?.overduePercent ?? null,
    proxyDays: liveData?.proxyDays ?? null,
    elapsedDays: liveData?.elapsedDays ?? null,
    patterns: liveData?.patterns ?? [],
  };
  const parties = liveData?.parties ?? [];
  const groups = liveData?.groups ?? [];

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading"><h2>{ledger === "ar" ? "Collection" : "Payment"} measures</h2></header>

      {loading && <DataTableSkeleton columns={3} rows={4} />}
      {error && !loading && (
        <StateMessage icon={CircleAlert} title="Measures unavailable" description="Failed to calculate measures from database.">
          <button type="button" className="table-tool-button" onClick={() => { setError(false); setLoading(true); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
        </StateMessage>
      )}

      {!loading && !error && (
        <>
          {liveData?.complete === false && <p className="finance-validation" role="status">Some source data is incomplete. Affected measures and concentration amounts remain unavailable.</p>}
          <div className="stat-strip">
            <StatCard label="Overdue share" value={metrics.overduePercent === null ? "Unavailable" : metrics.overduePercent / 100} format="percent" caption="Positive past-due / positive open" />
            <StatCard label={liveData?.proxyLabel ?? (ledger === "ar" ? "DSO estimate" : "Purchase-based DPO proxy")} value={days(metrics.proxyDays)} caption={liveData?.denominatorLabel ?? "2025 supplied ledger estimate"} />
            <StatCard label="Actual settlement days" value={days(metrics.elapsedDays)} caption="Amount-weighted elapsed days" />
          </div>
          <p className="footnote">2025 measures use mean daily balance ÷ net document-date billing × 365. Settlement days weight each allocated portion from the original document date. The AP proxy uses purchases because COGS is absent.</p>
          <div className="finance-two-column">
            <div>
              <h3>Largest party concentrations</h3>
              <ol className="concentration-list">
                {parties.map((item) => (
                  <li key={item.id}>
                    <div>
                      {ledger === "ar" ? <Link className="text-link" href={`/receivables?customer=${item.id}`}>{item.party}</Link> : item.party}
                      <strong>{percent(item.share)}</strong>
                    </div>
                    <span>{formatLiveAmount(item.amount)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3>Allocated cash against due date</h3>
              <dl className="detail-list">
                {metrics.patterns.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{formatLiveAmount(item.amount)}</dd>
                  </div>
                ))}
              </dl>
              <p className="footnote">Amounts apply only to settled portions. Open balances do not enter this distribution.</p>
            </div>
          </div>
          <h3>Group concentration</h3>
          <p className="footnote">Members of the same source group are combined. The denominator is all positive outstanding in this ledger.</p>
          <div className="group-concentration-list">
            {groups.map((group) => (
              <details key={group.name}>
                <summary><span>{group.name}</span><strong>{formatLiveAmount(group.amount)} · {percent(group.share)}</strong></summary>
                <ul>
                  {group.members.map((member) => (
                    <li key={member.id}>
                      <Link className="text-link" href={ledger === "ar" ? `/receivables?customer=${member.id}` : `/payables?vendor=${member.id}`}>{member.name}</Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
          <details className="coverage-details">
            <summary>Source coverage and unavailable metrics</summary>
            <p>Inventory, bank statements, GL and COGS are absent. Inventory days, full cash conversion cycle and bank/GL reconciliation are unavailable. Customer credit limits are current values, with no historical change register. This analysis gives no legal recovery conclusion.</p>
          </details>
        </>
      )}
    </section>
  );
}
