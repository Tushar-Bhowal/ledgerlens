"use client";

import { LiveAgeing } from "./live-ageing";

export function AgeingAnalysis({ ledger }: { ledger: "ar" | "ap" }) {
  return <LiveAgeing ledger={ledger} />;
}
