"use client";

import { LivePeriodAnalysis } from "./live-period-analysis";

export function PeriodAnalysis({ ledger, initialMonth = 12 }: { ledger: "ar" | "ap"; initialMonth?: number }) {
  return <LivePeriodAnalysis ledger={ledger} initialMonth={initialMonth} />;
}
