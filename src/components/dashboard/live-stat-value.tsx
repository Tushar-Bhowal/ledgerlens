"use client";

import { Skeleton } from "@/components/ui/loading-skeletons";
import { useLiveSummary, type SummaryKey } from "./live-summary";

function formatRupees(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  return `${sign}₹${BigInt(whole).toLocaleString("en-IN")}.${fraction.padEnd(2, "0")}`;
}

function formatCrore(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  // One hundredth of a crore is one lakh rupees. Round only at the display boundary.
  const hundredths = (paise + 5_000_000n) / 10_000_000n;
  return `${sign}₹${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")} Cr`;
}

export function LiveStatValue({ stat, format }: { stat?: SummaryKey; format?: "crore" | "rupees" | "integer" | "percent" }) {
  const summary = useLiveSummary();
  if (!stat) return <span aria-label="Live value unavailable">—</span>;
  if (summary.status === "loading") return <><span className="sr-only" role="status">Loading financial summary</span><Skeleton className="skeleton-value" /></>;
  if (summary.status === "error") return <span title="Could not load the financial summary">Unavailable</span>;
  const value = summary.data[stat];
  if (value === null) return <span title="Source data needs review">Unavailable</span>;
  if (typeof value === "number") return new Intl.NumberFormat("en-IN").format(value);
  return (format === "crore" ? formatCrore(value) : formatRupees(value)) ?? "Unavailable";
}
