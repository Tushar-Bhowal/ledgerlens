export function formatLiveAmount(value: string | null) {
  if (value === null) return "Unavailable";
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return "Unavailable";
  const [, sign, whole, fraction = ""] = match;
  return `${sign}₹${BigInt(whole).toLocaleString("en-IN")}.${fraction.padEnd(2, "0")}`;
}

export function formatLiveDays(value: string | null) {
  if (value === null || !Number.isFinite(Number(value))) return "Unavailable";
  return `${Number(value).toFixed(1)} days`;
}

export function formatLivePercent(value: string | null) {
  if (value === null || !Number.isFinite(Number(value))) return "Unavailable";
  return new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 }).format(Number(value));
}
