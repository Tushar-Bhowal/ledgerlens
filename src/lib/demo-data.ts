export const reportingDate = "2025-12-31";
export const rupeesPerCrore = 10_000_000;
const yearEnd = { receivables: 39_493_294.91, payables: 16_542_512.87 };

export const snapshot = {
  receivablesCrore: yearEnd.receivables / rupeesPerCrore,
  payablesCrore: yearEnd.payables / rupeesPerCrore,
  netTradeBalanceCrore: (yearEnd.receivables - yearEnd.payables) / rupeesPerCrore,
  unallocatedReceipts: 85_000,
  unallocatedReceiptCount: 3,
} as const;

export const monthEndBalances = [
  { month: "Jan", receivables: 4_363_093.63, payables: 1_703_215.90 },
  { month: "Feb", receivables: 10_210_458.66, payables: 3_372_004.26 },
  { month: "Mar", receivables: 15_188_997.45, payables: 3_821_511.51 },
  { month: "Apr", receivables: 18_501_300.63, payables: 4_602_782.26 },
  { month: "May", receivables: 20_744_865.63, payables: 6_751_296.57 },
  { month: "Jun", receivables: 22_743_444.61, payables: 7_492_906.01 },
  { month: "Jul", receivables: 24_461_452.25, payables: 8_528_855.31 },
  { month: "Aug", receivables: 27_611_510.30, payables: 10_200_372.09 },
  { month: "Sep", receivables: 29_018_537.92, payables: 12_119_392.19 },
  { month: "Oct", receivables: 33_438_482.55, payables: 12_777_467.37 },
  { month: "Nov", receivables: 35_214_000.31, payables: 14_299_635.34 },
  { month: "Dec", ...yearEnd },
] as const;

export const receivableAgeing = [
  { label: "Current", amount: 6_921_312.30 },
  { label: "1–30 days", amount: 4_489_549.02 },
  { label: "31–60 days", amount: 4_408_058.50 },
  { label: "61–90 days", amount: 1_692_021.84 },
  { label: "91+ days", amount: 21_982_353.25 },
] as const;

export function inCrore(amount: number) {
  return `₹${amount.toFixed(2)} Cr`;
}

export const invoices = [
  { id: "ARI00001", number: "INV-00001", party: "Customer 22 Pvt Ltd", date: "2025-02-28", due: "2025-03-30", billed: 128437.08, paid: 128437.08, references: ["ARR00001 · ₹88,272.19", "ARR00002 · ₹40,164.89"] },
  { id: "ARI00002", number: "INV-00002", party: "Customer 11 Pvt Ltd", date: "2025-02-27", due: "2025-04-28", billed: 90551.70, paid: 90551.70, references: ["ARR00003 · ₹63,901.97", "ARR00004 · ₹26,649.73"] },
  { id: "ARI00003", number: "INV-00003", party: "Customer 17 Pvt Ltd", date: "2025-04-02", due: "2025-04-17", billed: 100244.43, paid: 33219.99, references: ["ARR00005 · ₹33,219.99"] },
  { id: "ARI00004", number: "INV-00004", party: "Customer 21 Pvt Ltd", date: "2025-09-17", due: "2025-10-02", billed: 116653.17, paid: 116653.17, references: ["ARR00006 · ₹87,744.88", "ARR00007 · ₹28,908.29"] },
  { id: "ARI00005", number: "INV-00005", party: "Customer 25 Pvt Ltd", date: "2025-09-29", due: "2025-10-29", billed: 166795.95, paid: 69117.99, references: ["ARR00008 · ₹69,117.99"] },
  { id: "ARI00021", number: "INV-00021", party: "Customer 06 Pvt Ltd", date: "2025-07-14", due: "2025-08-13", billed: 18349.17, paid: 18349.17, references: ["ARR00016 · ₹10,768.66", "ARR00017 · ₹7,580.51"] },
  { id: "ARI00116", number: "INV-00116", party: "Customer 09 Pvt Ltd", date: "2025-11-17", due: "2026-01-01", billed: 113545.91, paid: 0, references: [] },
  { id: "ARI00375", number: "INV-00375", party: "Customer 21 Pvt Ltd", date: "2025-12-14", due: "2025-12-29", billed: 87206.49, paid: 0, references: [] },
  { id: "ARI00471", number: "INV-00471", party: "Customer 17 Pvt Ltd", date: "2025-12-14", due: "2025-12-29", billed: 150059.31, paid: 0, references: [] },
  { id: "ARI00547", number: "INV-00547", party: "Customer 11 Pvt Ltd", date: "2025-11-02", due: "2026-01-01", billed: 53481.27, paid: 0, references: [] },
];

export const bills = [
  { id: "API00001", number: "BILL-00001", party: "Vendor 09 Industries", due: "2025-12-22", amount: 62641.86, reference: "PO-00001 · GRN-00001" },
  { id: "API00002", number: "BILL-00002", party: "Vendor 02 Industries", due: "2025-12-24", amount: 78451.54, reference: "PO-00002 · GRN-00002" },
  { id: "API00003", number: "BILL-00003", party: "Vendor 05 Industries", due: "2025-09-11", amount: 83339.04, reference: "PO missing · GRN-00003" },
  { id: "API00004", number: "BILL-00004", party: "Vendor 12 Industries", due: "2025-12-21", amount: 144536.72, reference: "PO-00004 · GRN-00004" },
  { id: "API00005", number: "BILL-00005", party: "Vendor 10 Industries", due: "2025-08-08", amount: 96599.40, reference: "PO-00005 · GRN missing" },
];

export const exceptions = [
  { id: "DSP0001", issue: "Open customer dispute", party: "Customer 07 Pvt Ltd", reference: "ARI00031", amount: 15240.62, detail: "Short supply" },
  { id: "DSP0004", issue: "Open customer dispute", party: "Customer 23 Pvt Ltd", reference: "ARI00401", amount: 16648.97, detail: "Service issue" },
  { id: "DSP0006", issue: "Supplier dispute and hold", party: "Vendor 08 Industries", reference: "API00019", amount: 15844.81, detail: "PO / invoice rate mismatch" },
  { id: "DSP0007", issue: "Supplier dispute and hold", party: "Vendor 05 Industries", reference: "API00111", amount: 10113.74, detail: "PO / invoice rate mismatch" },
  { id: "DSP0008", issue: "Supplier dispute and hold", party: "Vendor 04 Industries", reference: "API00222", amount: 5744.26, detail: "PO / invoice rate mismatch" },
];

export const paymentHolds = [
  { id: "HLD0001", billId: "API00019", date: "2025-11-20", reason: "Missing GRN", status: "Active" },
  { id: "HLD0002", billId: "API00111", date: "2025-11-20", reason: "Invoice dispute", status: "Active" },
  { id: "HLD0003", billId: "API00222", date: "2025-11-20", reason: "Rate mismatch", status: "Active" },
] as const;

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export const money = (amount: number) => rupees.format(amount);
