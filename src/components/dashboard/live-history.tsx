"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type HistoryMonth = {
  month: string;
  date: string;
  receivables: string | null;
  payables: string | null;
};

type History = { asOf: string; months: HistoryMonth[]; rejectedRows: number };
type HistoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: History };

const HistoryContext = createContext<{ state: HistoryState; retry: () => void }>({
  state: { status: "loading" },
  retry: () => {},
});

export function LiveHistoryProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    fetch("/api/finance/history", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("History unavailable");
        return response.json() as Promise<History>;
      })
      .then((data) => setState({ status: "ready", data }))
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [active, attempt]);

  return (
    <HistoryContext value={{ state, retry: () => { setState({ status: "loading" }); setAttempt((value) => value + 1); } }}>
      {children}
    </HistoryContext>
  );
}

export function useLiveHistory() {
  return useContext(HistoryContext);
}

export function formatRupees(value: string | null) {
  if (value === null) return "Unavailable";
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return "Unavailable";
  const [, sign, whole, fraction = ""] = match;
  return `${sign}₹${BigInt(whole).toLocaleString("en-IN")}.${fraction.padEnd(2, "0")}`;
}
