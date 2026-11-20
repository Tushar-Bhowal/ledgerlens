"use client";

import { LivePeriodAnalysis } from "./live-period-analysis";

export function PeriodAnalysis({ ledger }: { ledger: "ar" | "ap" }) {
  return <LivePeriodAnalysis ledger={ledger} />;
}
