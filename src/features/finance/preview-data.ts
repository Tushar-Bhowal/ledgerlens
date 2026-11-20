import data from "@/lib/finance-preview.json";

export type FinanceDocument = {
  id: string;
  number: string;
  partyId: string;
  party: string;
  date: string;
  posted: string;
  due: string;
  face: number;
  paid: number;
  adjustment: number;
  outstanding: number;
  po: string;
  grn: string;
  allocations: { id: string; cashId: string; date: string; amount: number; approval: string; reference: string }[];
  adjustments: { id: string; date: string; type: string; amount: number }[];
  disputes: { id: string; date: string; reason: string; amount: number; status: string }[];
  holds: { id: string; date: string; reason: string; status: string; released: string }[];
  followups: { id: string; date: string; promise: string; amount: number; status: string; owner: string; chronologyValid: boolean }[];
};

type Bill = FinanceDocument & { criticality: string; termsDays: number; msme: boolean; controls: string[]; eligibility: string };
export const financePreview: Omit<typeof data, "invoices" | "bills"> & { invoices: FinanceDocument[]; bills: Bill[] } = data;
export type Customer = (typeof data.customers)[number];
export type Investigation = (typeof data.issues)[number];
export const percent = (value: number | null) => value === null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 }).format(value);
export function days(value: number | null) {
  return value === null ? "Unavailable" : `${value.toFixed(1)} days`;
}
