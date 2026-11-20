"use client";

import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { DataTableSkeleton, Skeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { formatLiveAmount } from "./live-analysis-format";
import { LiveDocuments } from "./live-documents";

type Ageing = {
  asOf: string;
  buckets: { label: string; amount: string | null }[];
  total: string | null;
  unknownCount: number;
  rejectedRows: number;
};

type Result =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; data: Ageing };

export function LiveAgeing({ ledger }: { ledger: "ar" | "ap" }) {
  const [basis, setBasis] = useState<"due" | "date">("due");
  const [boundaries, setBoundaries] = useState([30, 60, 90]);
  const [draft, setDraft] = useState(["30", "60", "90"]);
  const [validation, setValidation] = useState("");
  const [result, setResult] = useState<Result>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ ledger, basis, boundaries: boundaries.join(",") });
    fetch(`/api/finance/ageing?${params}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Ageing unavailable");
        return response.json() as Promise<Ageing>;
      })
      .then((data) => setResult({ state: "ready", data }))
      .catch(() => { if (!controller.signal.aborted) setResult({ state: "error" }); });
    return () => controller.abort();
  }, [ledger, basis, boundaries, attempt]);

  function apply() {
    const values = draft.map(Number);
    if (values.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 3650)
      || values[0] >= values[1] || values[1] >= values[2]) {
      setValidation("Enter three increasing whole-day boundaries between 1 and 3650.");
      return;
    }
    setValidation("");
    if (values.some((value, index) => value !== boundaries[index])) {
      setResult({ state: "loading" });
      setBoundaries(values);
    }
  }

  const defaultLabels = [basis === "due" ? "Current" : "0 days", `1–${boundaries[0]} days`, `${boundaries[0] + 1}–${boundaries[1]} days`, `${boundaries[1] + 1}–${boundaries[2]} days`, `${boundaries[2] + 1}+ days`];
  const buckets = result.state === "ready" ? result.data.buckets : defaultLabels.map((label) => ({ label, amount: null }));
  const total = result.state === "ready" ? result.data.total : null;

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading"><div><h2>{ledger === "ar" ? "Receivable" : "Payable"} ageing</h2><p>Positive balances{result.state === "ready" && ` as of ${result.data.asOf}`}</p></div></header>
      <div className="finance-controls">
        <label>Ageing basis<select value={basis} onChange={(event) => { setResult({ state: "loading" }); setBasis(event.target.value as "due" | "date"); }}><option value="due">Due date</option><option value="date">Original document date</option></select></label>
        <form onSubmit={(event) => { event.preventDefault(); apply(); }} className="bucket-form">
          <fieldset><legend>Bucket end days</legend>{draft.map((value, index) => <input key={index} type="number" aria-label={`Bucket ${index + 1} end day`} value={value} min={1} max={3650} onChange={(event) => setDraft((previous) => previous.map((old, i) => i === index ? event.target.value : old))} />)}</fieldset>
          <button type="submit" className="table-tool-button">Apply</button>
        </form>
      </div>
      {validation && <p className="finance-validation" role="alert">{validation}</p>}
      {result.state === "loading" && <span className="sr-only" role="status">Loading ageing analysis…</span>}
      {result.state === "error" ? (
        <StateMessage compact icon={CircleAlert} title="Ageing unavailable" description="The ageing analysis could not be loaded.">
          <button type="button" className="table-tool-button" onClick={() => { setResult({ state: "loading" }); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
        </StateMessage>
      ) : (
        <div className="finance-bar-list" aria-busy={result.state === "loading"}>
          {buckets.map((bucket) => (
            <div key={bucket.label}>
              <span>{bucket.label}</span>
              <strong>{result.state === "loading" ? <Skeleton className="skeleton-label" /> : formatLiveAmount(bucket.amount)}</strong>
              <div className="finance-bar-track" aria-hidden="true"><span style={{ width: `${bucket.amount !== null && total !== null && Number(total) > 0 ? Number(bucket.amount) / Number(total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {result.state === "ready" && (result.data.unknownCount > 0 || result.data.rejectedRows > 0) && (
        <p className="finance-validation" role="status">Some source records need review. {result.data.unknownCount} document balances or dates are unavailable and {result.data.rejectedRows} records were rejected during import.</p>
      )}
      <h3>Source documents</h3>
      <p className="footnote">Open a document to review its balance and allocations. The list includes all statuses; it is not filtered to a specific ageing bucket.</p>
      {result.state === "loading" ? <DataTableSkeleton columns={7} rows={5} /> : <LiveDocuments ledger={ledger} />}
      <p className="footnote">Original document dates remain fixed after partial settlement. Due today counts as current. Unallocated cash is excluded from document settlement.</p>
    </section>
  );
}
