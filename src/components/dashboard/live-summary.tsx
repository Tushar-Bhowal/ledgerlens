"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type SummaryKey = "receivables" | "payables" | "netTradeBalance" | "unallocatedReceipts" | "invoiceCount" | "billCount" | "pendingApprovals" | "unallocatedReceiptCount";
type Summary = Record<SummaryKey, string | number | null> & { rejectedRows: number };
type SummaryState = { status: "loading" } | { status: "error" } | { status: "ready"; data: Summary };

const SummaryContext = createContext<SummaryState>({ status: "loading" });

export function LiveSummaryProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const [state, setState] = useState<SummaryState>({ status: "loading" });

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    fetch("/api/finance/summary", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Summary unavailable");
        return response.json() as Promise<Summary>;
      })
      .then((data) => { if (!controller.signal.aborted) setState({ status: "ready", data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [active]);

  return <SummaryContext value={state}>{children}</SummaryContext>;
}

export function useLiveSummary() {
  return useContext(SummaryContext);
}
