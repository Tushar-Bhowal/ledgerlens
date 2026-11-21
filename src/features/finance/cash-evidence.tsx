"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CashEvidence } from "@/server/finance/cash-evidence";
import { formatLiveAmount } from "./live-analysis-format";

export function CashEvidenceDetail({ cashId }: { cashId: string }) {
  const [result, setResult] = useState<CashEvidence | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/finance/cash/${encodeURIComponent(cashId)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Cash evidence unavailable"); return response.json() as Promise<CashEvidence>; })
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [cashId, attempt]);
  if (error) return <div role="status">Cash evidence could not load. <button type="button" className="text-link" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>Try again</button></div>;
  if (!result) return <p role="status">Loading {cashId} source evidence…</p>;
  return <section className="allocation">
    <h4>{result.id} · {result.reference ?? "Reference unavailable"}</h4>
    <dl className="detail-list">
      <div><dt>Party</dt><dd>{result.party} · {result.partyId}</dd></div>
      <div><dt>Source date / status</dt><dd>{result.date ?? "Unavailable"} · {result.status ?? "Unknown"}{result.date && result.date > result.asOf ? " · After reporting cutoff" : ""}</dd></div>
      <div><dt>Source cash amount</dt><dd>{formatLiveAmount(result.amount)}</dd></div>
      <div><dt>Payment method / bank reference</dt><dd>{result.method ?? "Unavailable"} · {result.bankReference ?? "Unavailable"}</dd></div>
      {result.ledger === "ap" && <div><dt>Payment approval</dt><dd>{result.approval ?? "Unknown"}</dd></div>}
      <div><dt>Source CSV</dt><dd>{result.sourceFilename} · record {result.sourceRecordNumber}</dd></div>
      <div><dt>Eligible allocated at {result.asOf}</dt><dd>{formatLiveAmount(result.applied)}</dd></div>
      <div><dt>Unallocated at {result.asOf}</dt><dd>{formatLiveAmount(result.unallocated)}</dd></div>
    </dl>
    {result.unallocated === null && <p className="footnote">Cutoff balances are unavailable for inactive, future, missing or inconsistent source inputs. Rejected import records: {result.rejectedRows}. Raw audit records remain visible below.</p>}
    <h4>Source allocation audit</h4>
    <p className="footnote">All recorded allocations are shown, including cancelled, reversed and future rows. This audit list is not an eligible settlement total; cutoff balances above apply the shared financial rules.</p>
    {result.allocations.length === 0 && <p>No source allocations recorded.</p>}
    {result.allocations.map((allocation) => <div className="allocation" key={allocation.id}>
      <strong>{allocation.id} · {formatLiveAmount(allocation.amount)}</strong>
      <p><Link className="text-link" href={result.ledger === "ar" ? `/receivables?invoice=${encodeURIComponent(allocation.documentId)}` : `/payables?bill=${encodeURIComponent(allocation.documentId)}`}>{allocation.documentId}</Link> · {allocation.date ?? "Date unavailable"} · {allocation.status ?? "Status unknown"}{allocation.date && allocation.date > result.asOf ? " · After reporting cutoff" : ""}</p>
      <small>{allocation.sourceFilename} · record {allocation.sourceRecordNumber}</small>
    </div>)}
  </section>;
}
