"use client";

import { ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { formatRupees } from "@/components/dashboard/live-history";
import { Skeleton } from "@/components/ui/loading-skeletons";

type Ageing = {
  asOf: string;
  buckets: { label: string; amount: string | null }[];
  total: string | null;
  unknownCount: number;
  rejectedRows: number;
};

function paise(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0")) : null;
}

function crore(value: bigint) {
  const hundredths = (value + 5_000_000n) / 10_000_000n;
  return `₹${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")} Cr`;
}

export function ReceivablesAgeing() {
  const [data, setData] = useState<Ageing | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finance/ageing?ledger=ar&basis=due&boundaries=30,60,90", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Ageing unavailable");
        return response.json() as Promise<Ageing>;
      })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setStatus("ready"); } })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [attempt]);

  const amounts = data?.buckets.map((bucket) => bucket.amount === null ? null : paise(bucket.amount)) ?? [];
  const valid = amounts.length === 5 && amounts.every((value) => value !== null) && data?.total !== null;
  const current = valid ? amounts[0]! : 0n;
  const early = valid ? amounts[1]! + amounts[2]! + amounts[3]! : 0n;
  const old = valid ? amounts[4]! : 0n;
  const total = current + early + old;
  const groups = [
    { id: "current", label: "Current", amount: current },
    { id: "overdue", label: "1–90 days overdue", amount: early },
    { id: "long-overdue", label: "91+ days overdue", amount: old },
  ];
  const columns = total > 0n ? groups.map((group) => `minmax(0, ${Number(group.amount * 1_000_000n / total) / 1_000_000}fr)`).join(" ") : "repeat(3, minmax(0, 1fr))";

  return (
    <section className="overview-section ageing-summary" aria-labelledby="ageing-title">
      <div className="overview-section-heading">
        <div><h2 id="ageing-title">Receivables by age</h2><p>Positive outstanding balances · By due date</p></div>
        <div className="ageing-total"><span>Total outstanding</span><strong>{valid ? crore(total) : "—"}</strong></div>
      </div>
      {status === "loading" ? (
        <><span className="sr-only" role="status">Loading receivables ageing</span><Skeleton className="skeleton-main-chart" /></>
      ) : status === "error" ? (
        <p className="footnote" role="alert">Ageing is unavailable. <button type="button" className="table-clear" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>Try again</button></p>
      ) : (
        <>
          {!valid && <p className="footnote" role="status">Ageing is unavailable because source records need review.</p>}
          {data && data.unknownCount > 0 && <p className="footnote">{data.unknownCount} documents have unavailable balances or dates.</p>}
          {data && data.rejectedRows > 0 && <p className="footnote">Some source records were rejected during import.</p>}
          <div className="ageing-distribution" style={{ "--ageing-columns": columns } as CSSProperties}>
            <dl className="ageing-groups">
              {groups.map((group) => <div className="ageing-group" data-ageing-group={group.id} key={group.id}>
                <dt><span className="ageing-swatch" aria-hidden="true" />{group.label}</dt>
                <dd className="ageing-amount">{valid ? crore(group.amount) : "—"}</dd>
                <dd className="ageing-share">{valid && total > 0n ? `${(Number(group.amount * 1000n / total) / 10).toFixed(1)}%` : "—"}<span className="sr-only"> of total outstanding</span></dd>
              </div>)}
            </dl>
            <div className="ageing-bar" data-empty={!valid || total === 0n || undefined} aria-hidden="true">{valid && total > 0n && groups.map((group) => <span key={group.id} data-ageing-group={group.id} />)}</div>
          </div>
          <details className="ageing-details">
            <summary>View all five ageing buckets <ChevronDown size={15} aria-hidden="true" /></summary>
            <dl>{data?.buckets.map((bucket) => <div key={bucket.label}><dt>{bucket.label}</dt><dd>{formatRupees(bucket.amount)}</dd></div>)}</dl>
          </details>
        </>
      )}
    </section>
  );
}
