import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const CUTOFF = "2025-12-31";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, message: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${message}`);
  } else {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${message}`);
    process.exitCode = 1;
  }
}

function loadCsv(fileName: string): Record<string, string>[] {
  const filePath = path.join(process.cwd(), "DDL_Labs_WC_Starter_Data", fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Starter data file missing: ${fileName}`);
  }
  const content = readFileSync(filePath, "utf-8");
  return parse(content, { columns: true, skip_empty_lines: true, bom: true });
}

console.log("\x1b[1m\x1b[36m========================================================================\x1b[0m");
console.log("\x1b[1m\x1b[36m DDL Labs LedgerLens: Comprehensive Financial Verification Suite       \x1b[0m");
console.log("\x1b[1m\x1b[36m Cutoff: 2025-12-31 | Currency: INR | Assignment: DDL-FIN-001          \x1b[0m");
console.log("\x1b[1m\x1b[36m========================================================================\x1b[0m\n");

// 1. Ingestion Integrity
console.log("\x1b[1m[Test Group 1: Starter Data Ingestion Integrity]\x1b[0m");
const customers = loadCsv("customer_master.csv");
const vendors = loadCsv("vendor_master.csv");
const arInvoices = loadCsv("ar_invoices.csv");
const arReceipts = loadCsv("ar_receipts.csv");
const arAllocs = loadCsv("ar_receipt_allocations.csv");
const arAdjustments = loadCsv("ar_adjustments.csv");
const apInvoices = loadCsv("ap_invoices.csv");
const apPayments = loadCsv("ap_payments.csv");
const apAllocs = loadCsv("ap_payment_allocations.csv");
const apAdjustments = loadCsv("ap_adjustments.csv");
const disputes = loadCsv("disputes.csv");
const followups = loadCsv("collection_followups.csv");
const holds = loadCsv("payment_holds.csv");

assert(customers.length === 30, `Customer master contains exactly 30 records (found: ${customers.length})`);
assert(vendors.length === 12, `Vendor master contains exactly 12 records (found: ${vendors.length})`);
assert(arInvoices.length === 600, `AR Invoices contains exactly 600 records (found: ${arInvoices.length})`);
assert(apInvoices.length === 300, `AP Bills contains exactly 300 records (found: ${apInvoices.length})`);
assert(followups.length === 8, `Collection follow-ups contains exactly 8 records (found: ${followups.length})`);

// 2. Portfolio Balance Reconciliations
console.log("\n\x1b[1m[Test Group 2: Portfolio Balance Calculations (Cutoff 2025-12-31)]\x1b[0m");
const postedAr = arInvoices.filter((i) => i.status === "Posted" && i.posting_date <= CUTOFF);
assert(postedAr.length === 598, `Posted AR invoices as of cutoff equals 598 (found: ${postedAr.length})`);

const arInvoiceMap: Record<string, { face: number; paid: number; adj: number; cid: string; due: string; id: string }> = {};
for (const inv of postedAr) {
  arInvoiceMap[inv.invoice_id] = {
    id: inv.invoice_id,
    face: parseFloat(inv.invoice_amount_inr),
    paid: 0,
    adj: 0,
    cid: inv.customer_id,
    due: inv.due_date,
  };
}

for (const alloc of arAllocs) {
  if (alloc.status === "Allocated" && alloc.allocation_date <= CUTOFF && arInvoiceMap[alloc.invoice_id]) {
    arInvoiceMap[alloc.invoice_id].paid += parseFloat(alloc.allocated_amount_inr);
  }
}

for (const adj of arAdjustments) {
  if (adj.status === "Posted" && adj.adjustment_date <= CUTOFF && arInvoiceMap[adj.invoice_id]) {
    const amt = parseFloat(adj.amount_inr);
    arInvoiceMap[adj.invoice_id].adj += (adj.adjustment_type === "Credit Note" ? -amt : amt);
  }
}

let totalArOut = 0;
let totalOverdueAr = 0;
const customerOut: Record<string, number> = {};
for (const inv of Object.values(arInvoiceMap)) {
  const bal = Math.round((inv.face - inv.paid + inv.adj) * 100) / 100;
  if (bal > 0) {
    totalArOut += bal;
    customerOut[inv.cid] = (customerOut[inv.cid] || 0) + bal;
    if (inv.due < CUTOFF) {
      totalOverdueAr += bal;
    }
  }
}
totalArOut = Math.round(totalArOut * 100) / 100;
totalOverdueAr = Math.round(totalOverdueAr * 100) / 100;

assert(totalArOut === 39493294.91, `Net Open Receivables matches ₹3,94,93,294.91 (actual: ₹${totalArOut.toLocaleString("en-IN")})`);

const postedAp = apInvoices.filter((b) => b.status === "Posted" && b.posting_date <= CUTOFF);
const apBillMap: Record<string, { face: number; paid: number; adj: number; vid: string; due: string; id: string }> = {};
for (const b of postedAp) {
  apBillMap[b.bill_id] = {
    id: b.bill_id,
    face: parseFloat(b.bill_amount_inr),
    paid: 0,
    adj: 0,
    vid: b.vendor_id,
    due: b.due_date,
  };
}
for (const alloc of apAllocs) {
  if (alloc.status === "Allocated" && alloc.allocation_date <= CUTOFF && apBillMap[alloc.bill_id]) {
    apBillMap[alloc.bill_id].paid += parseFloat(alloc.allocated_amount_inr);
  }
}
for (const adj of apAdjustments) {
  if (adj.status === "Posted" && adj.adjustment_date <= CUTOFF && apBillMap[adj.bill_id]) {
    const amt = parseFloat(adj.amount_inr);
    apBillMap[adj.bill_id].adj += (adj.adjustment_type === "Credit Note" ? -amt : amt);
  }
}

let totalApOut = 0;
for (const b of Object.values(apBillMap)) {
  const bal = Math.round((b.face - b.paid + b.adj) * 100) / 100;
  if (bal > 0) totalApOut += bal;
}
totalApOut = Math.round(totalApOut * 100) / 100;

assert(totalApOut === 16542512.87, `Net Open Payables matches ₹1,65,42,512.87 (actual: ₹${totalApOut.toLocaleString("en-IN")})`);

const netTrade = Math.round((totalArOut - totalApOut) * 100) / 100;
assert(netTrade === 22950782.04, `Net Trade Working Capital matches ₹2,29,50,782.04 (actual: ₹${netTrade.toLocaleString("en-IN")})`);

// 3. Unallocated Suspense Cash
console.log("\n\x1b[1m[Test Group 3: Unallocated Suspense Cash Verification]\x1b[0m");
const receiptAllocSums: Record<string, number> = {};
for (const a of arAllocs) {
  if (a.status === "Allocated" && a.allocation_date <= CUTOFF) {
    receiptAllocSums[a.receipt_id] = (receiptAllocSums[a.receipt_id] || 0) + parseFloat(a.allocated_amount_inr);
  }
}
let unallocCount = 0;
let unallocSum = 0;
for (const r of arReceipts) {
  if (r.status === "Posted" && r.receipt_date <= CUTOFF) {
    const amt = parseFloat(r.receipt_amount_inr);
    const diff = Math.round((amt - (receiptAllocSums[r.receipt_id] || 0)) * 100) / 100;
    if (diff > 0.01) {
      unallocCount++;
      unallocSum += diff;
    }
  }
}
unallocSum = Math.round(unallocSum * 100) / 100;
assert(unallocCount === 3, `Exactly 3 receipts have unallocated balances (found: ${unallocCount})`);
assert(unallocSum === 85000.0, `Total unallocated suspense cash equals ₹85,000.00 (actual: ₹${unallocSum.toLocaleString("en-IN")})`);

// 4. Scenario 1: Receivables Increasing (Dec Ledger Bridge)
console.log("\n\x1b[1m[Test Group 4: Scenario 1 — December Ledger Movement Bridge]\x1b[0m");
const novPosted = postedAr.filter((i) => i.posting_date <= "2025-11-30").reduce((sum, i) => sum + parseFloat(i.invoice_amount_inr), 0);
const novAlloc = arAllocs.filter((a) => a.status === "Allocated" && a.allocation_date <= "2025-11-30").reduce((sum, a) => sum + parseFloat(a.allocated_amount_inr), 0);
const novAdj = arAdjustments.filter((a) => a.status === "Posted" && a.adjustment_date <= "2025-11-30").reduce((sum, a) => sum + (a.adjustment_type === "Credit Note" ? -parseFloat(a.amount_inr) : parseFloat(a.amount_inr)), 0);
const novClosing = Math.round((novPosted - novAlloc + novAdj) * 100) / 100;
assert(novClosing === 35214000.31, `November Closing AR matches ₹3,52,14,000.31 (actual: ₹${novClosing.toLocaleString("en-IN")})`);

const decNewPosted = postedAr.filter((i) => i.posting_date >= "2025-12-01" && i.posting_date <= "2025-12-31").reduce((sum, i) => sum + parseFloat(i.invoice_amount_inr), 0);
const decNewAlloc = arAllocs.filter((a) => a.status === "Allocated" && a.allocation_date >= "2025-12-01" && a.allocation_date <= "2025-12-31").reduce((sum, a) => sum + parseFloat(a.allocated_amount_inr), 0);
assert(Math.round(decNewPosted * 100) / 100 === 6369153.74, `December new posted billings equals ₹63,69,153.74`);
assert(Math.round(decNewAlloc * 100) / 100 === 2089859.14, `December cash applied equals ₹20,89,859.14`);
const netIncrease = Math.round((totalArOut - novClosing) * 100) / 100;
assert(netIncrease === 4279294.6, `Month-over-Month Net AR Expansion equals +₹42,79,294.60 (actual: ₹${netIncrease.toLocaleString("en-IN")})`);

// 5. Scenario 2: Collection Attention Ranking
console.log("\n\x1b[1m[Test Group 5: Scenario 2 — Collection Priorities & Capped Disputes]\x1b[0m");
assert(totalOverdueAr === 32571982.61, `Total Overdue Receivables equals ₹3,25,71,982.61 (actual: ₹${totalOverdueAr.toLocaleString("en-IN")})`);

const openCustomerDisputes = disputes.filter((d) => d.party_type === "Customer" && ["Open", "Under Review"].includes(d.status));
const totalDisputedAmt = openCustomerDisputes.reduce((sum, d) => sum + parseFloat(d.disputed_amount_inr), 0);
assert(Math.round(totalDisputedAmt * 100) / 100 === 92635.23, `Total Active Customer Disputes equals ₹92,635.23 across 3 tickets`);

const actionablePool = Math.round((totalOverdueAr - totalDisputedAmt) * 100) / 100;
assert(actionablePool === 32479347.38, `Net Actionable Collection Pool equals ₹3,24,79,347.38 (actual: ₹${actionablePool.toLocaleString("en-IN")})`);

// 6. Scenario 3: Underpaid Invoices (Partial Payments)
console.log("\n\x1b[1m[Test Group 6: Scenario 3 — Underpaid Invoices / Partial Payments]\x1b[0m");
const shortPaid = Object.values(arInvoiceMap).filter((i) => i.paid > 0 && i.paid < i.face);
assert(shortPaid.length === 257, `Identified exactly 257 short-paid invoices with uncollected residuals (found: ${shortPaid.length})`);
const sampleShort = arInvoiceMap["ARI00003"];
assert(sampleShort && Math.round((sampleShort.face - sampleShort.paid) * 100) / 100 === 67024.44, `Sample invoice ARI00003 residual shortfall is ₹67,024.44`);

// 7. Scenario 4: Customer Risk (C028 & C024)
console.log("\n\x1b[1m[Test Group 7: Scenario 4 — High-Risk Customer Profile C028]\x1b[0m");
const c028Master = customers.find((c) => c.customer_id === "C028")!;
const c028Limit = parseFloat(c028Master.credit_limit_inr);
const c028Out = Math.round((customerOut["C028"] || 0) * 100) / 100;
const c028Util = Math.round((c028Out / c028Limit) * 1000) / 10;
assert(c028Out === 2137172.84, `Customer C028 total outstanding is ₹21,37,172.84`);
assert(c028Util === 427.4, `Customer C028 credit utilisation is 427.4% (Severe breach above limit ₹5,00,000)`);

// 8. Scenario 5: Vendor Priorities (MSME & Critical)
console.log("\n\x1b[1m[Test Group 8: Scenario 5 — Vendor Payment Prioritisation]\x1b[0m");
const activeHolds = holds.filter((h) => h.hold_status === "Active");
assert(activeHolds.length === 3, `Exactly 3 supplier bills are ring-fenced on active payment holds (API00019, API00111, API00222)`);

const vendorMap = Object.fromEntries(vendors.map((v) => [v.vendor_id, v]));
const msmeBills = Object.values(apBillMap).filter((b) => vendorMap[b.vid]?.msme_flag?.toLowerCase() === "true");
assert(msmeBills.length === 74, `Identified 74 supplier bills carrying the source MSME flag`);

const pendingPayments = apPayments.filter((p) => p.status === "Posted" && p.approval_status === "Pending");
assert(pendingPayments.length === 51, `Identified 51 posted payment disbursements pending approval`);

// 9. Scenario 6: Financial Exceptions Audit
console.log("\n\x1b[1m[Test Group 9: Scenario 6 — Forensic Exceptions Audit]\x1b[0m");
const missingPoBills = postedAp.filter((b) => !b.purchase_order_id);
const missingGrnBills = postedAp.filter((b) => !b.grn_reference);
assert(missingPoBills.length === 33, `Identified 33 AP bills missing purchase order references`);
assert(missingGrnBills.length === 26, `Identified 26 AP bills missing goods receipt confirmations`);

console.log("\n\x1b[1m\x1b[32m========================================================================\x1b[0m");
console.log(`\x1b[1m\x1b[32m RESULTS: ${passedCount} / ${totalCount} Assertions Passed (${totalCount ? Math.round(passedCount / totalCount * 100) : 0}% passed)                     \x1b[0m`);
console.log(process.exitCode ? "CSV checks contain failures." : "CSV arithmetic checks passed. Run test:integration for live services and mocked-provider scenarios.");
console.log("\x1b[1m\x1b[32m========================================================================\x1b[0m\n");
