"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/loading-skeletons";
import { money } from "@/lib/demo-data";
import type { ExceptionItem } from "@/server/finance/exceptions";

type ReviewState = { status: "loading" } | { status: "error" } | { status: "ready"; rows: ExceptionItem[] };

export function LiveReviewItems() {
  const [state, setState] = useState<ReviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finance/exceptions", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Review items unavailable");
        return response.json() as Promise<{ rows: ExceptionItem[] }>;
      })
      .then(({ rows }) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", rows: rows.filter((row) => /dispute|hold|incomplete payment control/i.test(row.kind)).slice(0, 3) });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [attempt]);

  if (state.status === "loading") return <div className="list-rows" aria-busy="true">{[0, 1, 2].map((id) => <div className="issue-row" key={id}><Skeleton className="skeleton-label" /></div>)}</div>;
  if (state.status === "error") return <p role="alert">Review items are unavailable. <button type="button" className="table-clear" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}>Try again</button></p>;
  if (!state.rows.length) return <p className="footnote">No active disputes or payment holds were flagged at the cutoff.</p>;
  return (
    <div className="list-rows">
      {state.rows.map((item) => (
        <Link href={`/exceptions?issue=${encodeURIComponent(item.id)}`} className="issue-row" key={item.id}>
          <span className="issue-icon"><ShieldAlert size={16} aria-hidden="true" /></span>
          <span className="issue-info"><strong>{item.party}</strong><small>{item.kind} · {item.id}</small></span>
          <span className="row-amount">{item.exposure === null ? "Undetermined" : money(item.exposure)}<small>{item.status}</small></span>
          <ChevronRight className="issue-chevron" size={16} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
