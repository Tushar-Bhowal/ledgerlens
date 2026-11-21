import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

async function main() {
const verificationUrl = process.env.VERIFICATION_DATABASE_URL;
if (!verificationUrl) throw new Error("Set VERIFICATION_DATABASE_URL to an isolated local verification database.");
const target = new URL(verificationUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !target.pathname.startsWith("/ledgerlens_")) {
  throw new Error("Verification refuses remote or non-ledgerlens_ databases.");
}
process.env.DATABASE_URL = verificationUrl;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
const { getDatabasePool } = await import("../src/server/db");
const { getFinanceSummary } = await import("../src/server/finance/summary");
const { getCashEvidence } = await import("../src/server/finance/cash-evidence");
const { GET: getCashRoute } = await import("../src/app/api/finance/cash/[id]/route");
const { listDocuments, getDocumentEvidence } = await import("../src/server/finance/documents");
const { getBalanceHistory, getAgeing } = await import("../src/server/finance/history");
const { getPeriodAnalysis } = await import("../src/server/finance/analysis");
const { getMeasures } = await import("../src/server/finance/measures");
const { getShortPaymentCustomers } = await import("../src/server/finance/short-payments");
const { getCustomerPriorities } = await import("../src/server/finance/customer-priorities");
const { getCustomerActivity } = await import("../src/server/finance/customer-activity");
const { getStoredAiConfig } = await import("../src/lib/ai-client-config");
const { getExceptions } = await import("../src/server/finance/exceptions");
const { getOpportunities } = await import("../src/server/finance/opportunities");
const { processAgentMessage } = await import("../src/server/agent/chat");
const { reserveChatRequest, releaseChatRequest } = await import("../src/server/agent/request-limits");
const { POST } = await import("../src/app/api/assistant/chat/route");
const { NextRequest } = await import("next/server");
const pool = getDatabasePool();
const cents = (value: string | number) => {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(`${whole}${fraction.padEnd(2, "0")}`);
};
const csv = (name: string): Record<string, string>[] => parse(readFileSync(`DDL_Labs_WC_Starter_Data/${name}.csv`, "utf8"), { columns: true, bom: true });
const invoices = csv("ar_invoices");
const receipts = csv("ar_receipts");
const allocations = csv("ar_receipt_allocations");
const adjustments = csv("ar_adjustments");
const receiptById = new Map(receipts.map((row) => [row.receipt_id, row]));

// This oracle reads original CSV rows and uses integer cents, independently of the SQL implementation.
function arAt(cutoff: string, customerId?: string) {
  return invoices.filter((row) => row.status === "Posted" && row.posting_date <= cutoff && (!customerId || row.customer_id === customerId)).map((row) => {
    const paid = allocations.filter((a) => a.invoice_id === row.invoice_id && a.status === "Allocated" && a.allocation_date <= cutoff && receiptById.get(a.receipt_id)?.status === "Posted" && receiptById.get(a.receipt_id)!.receipt_date <= cutoff).reduce((total, a) => total + cents(a.allocated_amount_inr), 0n);
    const adjustment = adjustments.filter((a) => a.invoice_id === row.invoice_id && a.status === "Posted" && a.adjustment_date <= cutoff).reduce((total, a) => total + (a.adjustment_type === "Credit Note" ? -1n : 1n) * cents(a.amount_inr), 0n);
    return { ...row, paid, adjustment, outstanding: cents(row.invoice_amount_inr) - paid + adjustment };
  });
}
let passed = 0;
let failed = 0;
async function check(name: string, work: () => Promise<void>) {
  try { await work(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`, error); }
}
async function fixture(sql: string, work: () => Promise<void>) {
  const client = await pool.connect();
  const original = pool.query;
  await client.query("BEGIN");
  // Pin service reads to this transaction, so every adversarial fixture rolls back even after a failed assertion.
  Object.defineProperty(pool, "query", { value: client.query.bind(client), writable: true });
  try { await client.query(sql); await work(); }
  finally { Object.defineProperty(pool, "query", { value: original, writable: true }); await client.query("ROLLBACK"); client.release(); }
}

try {
  await check("source import contains 2452 records and two warnings", async () => {
    const issues = await pool.query("SELECT count(*)::int n FROM finance.import_issues WHERE issue_code = 'chronology_warning'");
    assert.equal(issues.rows[0].n, 2);
    let total = 0;
    for (const table of ["customer_master", "vendor_master", "ar_invoices", "ar_receipts", "ar_receipt_allocations", "ar_adjustments", "ap_invoices", "ap_payments", "ap_payment_allocations", "ap_adjustments", "disputes", "collection_followups", "payment_holds", "business_calendar"]) {
      const count = await pool.query(`SELECT count(*)::integer AS n FROM finance.${table}`);
      assert.equal(count.rows[0].n, csv(table).length);
      total += count.rows[0].n;
    }
    assert.equal(total, 2452);
  });
  await check("portfolio totals reconcile to independent integer-cent CSV oracle", async () => {
    const summary = await getFinanceSummary();
    const expected = arAt("2025-12-31").reduce((total, row) => total + row.outstanding, 0n);
    assert.equal(cents(summary.receivables!), expected);
    const payments = new Map(csv("ap_payments").map((row) => [row.payment_id, row]));
    const apAllocs = csv("ap_payment_allocations");
    const apAdjustments = csv("ap_adjustments");
    const apExpected = csv("ap_invoices").filter((row) => row.status === "Posted" && row.posting_date <= "2025-12-31").reduce((sum, row) => {
      const paid = apAllocs.filter((a) => a.bill_id === row.bill_id && a.status === "Allocated" && a.allocation_date <= "2025-12-31" && payments.get(a.payment_id)?.status === "Posted" && payments.get(a.payment_id)!.payment_date <= "2025-12-31").reduce((total, a) => total + cents(a.allocated_amount_inr), 0n);
      const adjustment = apAdjustments.filter((a) => a.bill_id === row.bill_id && a.status === "Posted" && a.adjustment_date <= "2025-12-31").reduce((total, a) => total + (a.adjustment_type === "Credit Note" ? -1n : 1n) * cents(a.amount_inr), 0n);
      return sum + cents(row.bill_amount_inr) - paid + adjustment;
    }, 0n);
    assert.equal(cents(summary.payables!), apExpected);
    assert.equal(cents(summary.receivables!) - cents(summary.payables!), cents(summary.netTradeBalance!));
    assert.equal(summary.unallocatedReceiptCount, 3);
    assert.equal(summary.unallocatedReceipts, "85000.00");
  });
  await check("all 12 AR history points reconcile independently", async () => {
    const history = await getBalanceHistory();
    for (const month of history.months) assert.equal(cents(month.receivables!), arAt(month.date).reduce((total, row) => total + row.outstanding, 0n));
  });
  for (const ledger of ["ar", "ap"] as const) {
    await check(`${ledger}: every monthly and daily bridge reconciles to history`, async () => {
      const history = await getBalanceHistory();
      for (let month = 1; month <= 12; month++) {
        const period = await getPeriodAnalysis(ledger, month);
        assert.equal(period.complete, true);
        assert.equal(cents(period.opening!) + cents(period.posted!) - cents(period.applied!) + cents(period.adjustments!), cents(period.closing!));
        assert.equal(cents(period.closing!), cents(ledger === "ar" ? history.months[month - 1].receivables! : history.months[month - 1].payables!));
        for (const day of period.daily) assert.equal(cents(day.opening!) + cents(day.posted!) - cents(day.applied!) + cents(day.adjustments!), cents(day.closing!));
      }
    });
    await check(`${ledger}: configurable ageing bases and measures preserve supported scope`, async () => {
      for (const basis of ["date", "due", "posted", "last"] as const) {
        const ageing = await getAgeing(ledger, basis, [15, 45, 120]);
        assert.equal(ageing.buckets.reduce((total, row) => total + cents(row.amount!), 0n), cents(ageing.total!));
      }
      const measures = await getMeasures(ledger);
      assert.equal(measures.complete, true);
      assert.equal(measures.standardDays, null);
      assert.ok(measures.proxyLabel && measures.denominatorLabel);
      assert.ok(Number(measures.averageDailyBalance) > 0);
    });
  }
  await check("actual daily average agrees with independent 365-day AR oracle", async () => {
    let sum = 0n;
    for (let day = 0; day < 365; day++) {
      const date = new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10);
      sum += arAt(date).reduce((total, row) => total + (row.outstanding > 0n ? row.outstanding : 0n), 0n);
    }
    const measures = await getMeasures("ar");
    assert.equal(cents(measures.averageDailyBalance!), (sum + 182n) / 365n);
  });
  await check("customer history has exact period/cumulative shortfalls and current overdue", async () => {
    const result = await getShortPaymentCustomers("C030");
    assert.equal(result.complete, true);
    assert.equal(result.history.length, 12);
    let cumulative = 0n;
    for (const row of result.history) {
      const end = new Date(Date.UTC(2025, row.month, 0)).toISOString().slice(0, 10);
      const start = `2025-${String(row.month).padStart(2, "0")}-01`;
      const oracle = arAt(end, "C030");
      const shortfall = oracle.filter((doc) => doc.due_date >= start && doc.due_date <= end).reduce((total, doc) => total + (doc.outstanding > 0n ? doc.outstanding : 0n), 0n);
      cumulative += shortfall;
      assert.equal(cents(row.shortfall), shortfall);
      assert.equal(cents(row.cumulativeShortfall), cumulative);
      assert.equal(cents(row.overdue), oracle.filter((doc) => doc.due_date < end).reduce((total, doc) => total + (doc.outstanding > 0n ? doc.outstanding : 0n), 0n));
    }
    assert.equal(cents(result.rows[0].shortfall), cumulative);
    assert.notEqual(result.rows[0].shortfall, result.rows[0].overdue);
  });
  await check("cutoff controls, dispute caps and cash residuals reconcile", async () => {
    const [summary, opportunities, exceptions] = await Promise.all([getFinanceSummary(), getOpportunities(), getExceptions()]);
    assert.equal(cents(opportunities.totals.actionable) + cents(opportunities.totals.disputed), cents(opportunities.totals.overdue));
    for (const row of opportunities.opportunities) assert.ok(row.disputed >= 0 && row.disputed <= row.overdue);
    assert.equal(opportunities.unallocated.length, summary.unallocatedReceiptCount);
    assert.equal(opportunities.unallocated.reduce((sum, row) => sum + cents(row.amount), 0n), cents(summary.unallocatedReceipts!));
    assert.ok(!exceptions.rows.some((row) => row.id === "FUP0003" && row.kind === "Broken promise"));
    assert.ok(exceptions.rows.some((row) => row.id === "CHRONO-FUP0003"));
  });
  await check("invoice evidence arithmetic and source locations", async () => {
    const document = await getDocumentEvidence("ar", "ARI00003");
    assert.ok(document);
    assert.equal(cents(document.face!) - cents(document.paid!) + cents(document.adjustment!), cents(document.outstanding!));
    assert.equal(document.sourceFilename, "ar_invoices.csv");
    assert.ok(document.sourceRecordNumber > 0 && document.allocations.length > 0);
    const listed = await listDocuments("ar", 1, 10, "ARI00003", "all", "", "number", "asc");
    assert.equal(listed.rows[0].outstanding, document.outstanding);
  });
  await check("cash evidence exposes original header and allocation sources with canonical residuals", async () => {
    const receipt = await getCashEvidence("arr00396");
    assert.ok(receipt); assert.equal(receipt.id, "ARR00396"); assert.equal(receipt.ledger, "ar");
    const source = receipts.find((row) => row.receipt_id === receipt.id)!;
    assert.equal(receipt.reference, source.receipt_reference); assert.equal(receipt.partyId, source.customer_id);
    assert.equal(receipt.date, source.receipt_date); assert.equal(cents(receipt.amount!), cents(source.receipt_amount_inr));
    assert.equal(receipt.method, source.payment_mode); assert.equal(receipt.bankReference, source.bank_reference);
    assert.equal(receipt.status, "Posted"); assert.equal(receipt.sourceFilename, "ar_receipts.csv");
    assert.equal(receipt.sourceRecordNumber, receipts.indexOf(source) + 1);
    assert.equal(cents(receipt.applied!), 0n); assert.equal(cents(receipt.unallocated!), 2500000n);
    assert.deepEqual(receipt.allocations, []);
    const payment = await getCashEvidence("APP00001");
    assert.ok(payment); assert.equal(payment.ledger, "ap"); assert.equal(payment.approval, "Pending");
    assert.equal(payment.status, "Posted"); assert.equal(payment.reference, "PAY-00001");
    assert.equal(payment.bankReference, "PBK-00001"); assert.equal(payment.method, "RTGS");
    assert.equal(payment.sourceFilename, "ap_payments.csv"); assert.equal(payment.sourceRecordNumber, 1);
    assert.equal(cents(payment.amount!), 2828653n); assert.equal(cents(payment.applied!), 2828653n);
    assert.equal(cents(payment.unallocated!), 0n);
    assert.deepEqual(payment.allocations, [{ id: "APAL00001", documentId: "API00007", date: "2025-09-08", amount: "28286.53", status: "Allocated", sourceFilename: "ap_payment_allocations.csv", sourceRecordNumber: 1 }]);
  });
  await check("raw cash allocation audit remains separate from cutoff and source coverage amounts", async () => {
    await fixture(`INSERT INTO finance.ar_receipt_allocations (allocation_id,receipt_id,invoice_id,allocation_date,allocated_amount_inr,status,source_filename,source_record_number)
      SELECT 'ARAL99998','ARR00396',invoice_id,'2025-12-01',100,'Cancelled','verification',99998 FROM finance.ar_invoices WHERE customer_id='C003' ORDER BY invoice_id LIMIT 1;
      INSERT INTO finance.ar_receipt_allocations (allocation_id,receipt_id,invoice_id,allocation_date,allocated_amount_inr,status,source_filename,source_record_number)
      SELECT 'ARAL99999','ARR00396',invoice_id,'2026-01-01',100,'Allocated','verification',99999 FROM finance.ar_invoices WHERE customer_id='C003' ORDER BY invoice_id LIMIT 1`, async () => {
      const evidence = (await getCashEvidence("ARR00396"))!;
      assert.deepEqual(evidence.allocations.map((row) => row.id), ["ARAL99998", "ARAL99999"]);
      assert.equal(evidence.allocations[0].status, "Cancelled"); assert.equal(evidence.allocations[1].date, "2026-01-01");
      assert.equal(cents(evidence.applied!), 0n); assert.equal(cents(evidence.unallocated!), 2500000n);
    });
    for (const change of ["receipt_amount_inr=NULL", "status='Cancelled'", "receipt_date='2026-01-01'"]) {
      await fixture(`UPDATE finance.ar_receipts SET ${change} WHERE receipt_id='ARR00396'`, async () => {
        const evidence = (await getCashEvidence("ARR00396"))!;
        assert.equal(evidence.id, "ARR00396"); assert.equal(evidence.applied, null); assert.equal(evidence.unallocated, null);
      });
    }
    await fixture(`INSERT INTO finance.import_issues (source_filename,source_record_number,issue_code,reason,raw_record) VALUES ('verification',99999,'rejected','Verification coverage','{}')`, async () => {
      const evidence = (await getCashEvidence("APP00001"))!;
      assert.ok(evidence.rejectedRows > 0); assert.equal(evidence.applied, null); assert.equal(evidence.unallocated, null);
      assert.equal(evidence.allocations[0].id, "APAL00001"); assert.equal(evidence.amount, "28286.53");
    });
  });
  await check("cash evidence HTTP boundary validates IDs and distinguishes missing records", async () => {
    for (const [id, expected] of [["ARR00396", 200], ["APP00001", 200], ["ARR99999", 404], ["ARI00003", 400], ["../ARR00396", 400], ["APP00001' OR 1=1", 400]] as const) {
      const response = await getCashRoute(new Request("http://localhost/api/finance/cash/record"), { params: Promise.resolve({ id }) });
      assert.equal(response.status, expected, id); assert.equal(response.headers.get("Cache-Control"), "no-store");
      if (expected === 200) assert.equal((await response.json()).id, id);
    }
  });
  await check("missing amounts propagate instead of becoming zero", async () => fixture("UPDATE finance.ar_invoices SET invoice_amount_inr=NULL WHERE invoice_id='ARI00003'", async () => {
    assert.equal((await getFinanceSummary()).receivables, null);
    assert.equal((await getPeriodAnalysis("ar", 12)).complete, false);
    assert.equal((await getMeasures("ar")).complete, false);
    assert.equal((await getShortPaymentCustomers()).complete, false);
    await assert.rejects(getOpportunities());
  }));
  await check("pre-year opening balance is preserved", async () => fixture(`INSERT INTO finance.ar_invoices
    (invoice_id,invoice_number,customer_id,invoice_date,posting_date,due_date,invoice_amount_inr,currency,status,source_filename,source_record_number)
    VALUES ('ARI99997','TEST-OPEN','C030','2024-12-01','2024-12-01','2024-12-31',1000,'INR','Posted','verification',99997)`, async () => {
    assert.equal(cents((await getPeriodAnalysis("ar", 1)).opening!), 100000n);
  }));
  await check("large monetary values retain cents beyond JS safe integer range", async () => fixture(`INSERT INTO finance.ar_invoices
    (invoice_id,invoice_number,customer_id,invoice_date,posting_date,due_date,invoice_amount_inr,currency,status,source_filename,source_record_number)
    VALUES ('ARI99998','TEST-EXACT','C030','2025-12-01','2025-12-01','2025-12-15',9007199254740993.01,'INR','Posted','verification',99998)`, async () => {
    const expected = 3949329491n + 900719925474099301n;
    assert.equal(cents((await getFinanceSummary()).receivables!), expected);
    assert.equal(cents((await getPeriodAnalysis("ar", 12)).closing!), expected);
    assert.equal(cents((await getMeasures("ar")).totalPositive!), expected);
  }));
  await check("late postings retain original-date billing consistently", async () => fixture(`INSERT INTO finance.ar_invoices
    (invoice_id,invoice_number,customer_id,invoice_date,posting_date,due_date,invoice_amount_inr,currency,status,source_filename,source_record_number)
    VALUES ('ARI99996','TEST-LATE','C030','2025-01-20','2025-02-01','2025-03-01',1000,'INR','Posted','verification',99996)`, async () => {
    const shortfall = await getShortPaymentCustomers();
    const period = await getPeriodAnalysis("ar", 12);
    const januaryBilling = shortfall.history.filter((row) => row.month === 1).reduce((sum, row) => sum + cents(row.billing), 0n);
    assert.equal(januaryBilling, cents(period.cohorts[0].billing!));
  }));
  await check("future invalid cash does not invalidate a historical snapshot", async () => fixture(`INSERT INTO finance.ar_receipts
    (receipt_id,customer_id,receipt_date,receipt_amount_inr,status,source_filename,source_record_number)
    VALUES ('ARR99999','C030','2026-01-01',NULL,NULL,'verification',99999)`, async () => {
    assert.equal((await getPeriodAnalysis("ar", 12)).complete, true);
    assert.equal((await getShortPaymentCustomers()).complete, true);
    assert.equal((await getFinanceSummary()).unallocatedReceipts, "85000.00");
    assert.equal((await getOpportunities()).unallocated.length, 3);
  }));
  await check("customer names, current-only and master-only profiles never substitute another customer", async () => {
    const named = await processAgentMessage("Why is Customer 30 Pvt Ltd high risk?", undefined, { providerPriority: "system" });
    assert.equal(named.kind, "answer");
    if (named.kind === "answer") {
      assert.ok(named.example.answer.includes("C030"));
      const evidence = await processAgentMessage("Show the source evidence", named.context, { providerPriority: "system" });
      assert.equal(evidence.kind, "answer");
      if (evidence.kind === "answer") assert.deepEqual(evidence.example.evidence, named.example.evidence);
      const another = await processAgentMessage("What about C024?", named.context, { providerPriority: "system" });
      assert.equal(another.kind, "answer");
      if (another.kind === "answer") assert.ok(another.example.answer.includes("C024"));
    }
    const unknown = await processAgentMessage("Why is C999 high risk?", undefined, { providerPriority: "system" });
    assert.equal(unknown.kind, "answer");
    if (unknown.kind === "answer") assert.ok(unknown.example.answer.includes("No customer matches"));
    await fixture(`INSERT INTO finance.customer_master (customer_id,customer_name,source_filename,source_record_number) VALUES ('C999','Verification Customer','verification',99999)`, async () => {
      const rows = (await getCustomerPriorities("C999")).rows as { id: string; outstanding: string }[];
      assert.equal(rows[0].id, "C999"); assert.equal(rows[0].outstanding, "0");
    });
  });
  await check("duplicate requests filter review leads and preserve exact cross-party evidence", async () => {
    const exceptions = await getExceptions();
    for (const [ledger, reference, table, idKey, numberKey] of [["AR", "INV-00017", "ar_invoices", "invoice_id", "invoice_number"], ["AP", "BILL-00021", "ap_invoices", "bill_id", "bill_number"]]) {
      const expected = csv(table).filter((row) => row[numberKey] === reference).map((row) => row[idKey]).sort();
      const lead = exceptions.rows.find((row) => row.id.startsWith(`CROSS-${ledger}-`) && expected.every((id) => row.evidence.includes(id)));
      assert.ok(lead, reference); assert.deepEqual([...lead.evidence].sort(), expected);
      const exact = await processAgentMessage(`Investigate ${lead.id}`, undefined, { providerPriority: "system" });
      assert.equal(exact.kind, "answer");
      if (exact.kind === "answer") assert.equal(exact.context?.issueId, lead.id);
    }
    const duplicate = await processAgentMessage("Investigate duplicate invoices", undefined, { providerPriority: "system" });
    assert.equal(duplicate.kind, "answer");
    if (duplicate.kind === "answer") {
      assert.equal(duplicate.context?.exceptionCategory, "duplicates");
      assert.ok(duplicate.example.table?.rows.length);
      for (const row of duplicate.example.table!.rows) assert.match(String(row.values[1]), /duplicate|reference collision/i);
      const followup = await processAgentMessage("Show the evidence", duplicate.context, { providerPriority: "system" });
      assert.equal(followup.kind, "answer");
      if (followup.kind === "answer") assert.deepEqual(followup.example.table, duplicate.example.table);
    }
  });
  await check("collection reply returns ranked invoice actions with exact capped portions", async () => {
    const priorities = (await getCustomerPriorities()).rows as { id: string }[];
    const opportunities = (await getOpportunities()).opportunities;
    const expected = priorities.slice(0, 5).flatMap((customer) => opportunities.filter((invoice) => invoice.partyId === customer.id));
    const reply = await processAgentMessage("Who needs collection attention today?", undefined, { providerPriority: "system" });
    assert.equal(reply.kind, "answer");
    if (reply.kind === "answer") {
      assert.deepEqual(reply.example.table?.rows.map((row) => row.id), expected.map((row) => row.id));
      for (const row of reply.example.table!.rows) {
        const source = expected.find((invoice) => invoice.id === row.id)!;
        assert.equal(new URL(row.href!, "http://localhost").searchParams.get("invoice"), source.id);
        assert.ok(String(row.values[2]).includes(new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(source.actionable)));
        assert.equal(row.values[4], source.step);
        assert.equal(cents(source.actionable) + cents(source.disputed), cents(source.outstanding));
      }
    }
  });
  await check("customer activity retains source history and chronology without future leakage", async () => {
    for (const id of ["C007", "C011", "C024"]) {
      const activity = await getCustomerActivity(id);
      const expectedIds = [...csv("disputes").filter((r) => r.party_type === "Customer" && r.party_id === id && (!r.raised_date || r.raised_date <= "2025-12-31")).map((r) => r.dispute_id), ...csv("collection_followups").filter((r) => r.customer_id === id && (!r.followup_date || r.followup_date <= "2025-12-31")).map((r) => r.followup_id), ...receipts.filter((r) => r.customer_id === id && (!r.receipt_date || r.receipt_date <= "2025-12-31")).map((r) => r.receipt_id)].sort();
      assert.deepEqual(activity.events.map((event) => event.id).sort(), expectedIds);
      for (const event of activity.events) {
        assert.ok(event.sourceRecordNumber > 0 && event.sourceFilename.endsWith(".csv"));
        for (const allocation of event.allocations) assert.ok(allocation.sourceRecordNumber > 0 && (!allocation.date || allocation.date <= "2025-12-31"));
      }
    }
    assert.ok((await getCustomerActivity("C011")).events.find((event) => event.id === "FUP0003")?.warning);
    await fixture(`INSERT INTO finance.ar_receipts (receipt_id,customer_id,receipt_date,receipt_amount_inr,status,source_filename,source_record_number) VALUES ('ARR99999','C024','2026-01-01',100,'Posted','verification',99999)`, async () => {
      assert.ok(!(await getCustomerActivity("C024")).events.some((event) => event.id === "ARR99999"));
    });
  });
  await check("related pending approval blocks scheduling review without changing settlement", async () => {
    const evidence = await getDocumentEvidence("ap", "API00007");
    const bill = (await getOpportunities()).paymentReview.find((row) => row.id === "API00007")!;
    assert.ok(bill); assert.equal(bill.eligible, false);
    assert.equal(cents(bill.outstanding), cents(evidence!.outstanding!));
    const payment = bill.approvalWarnings.find((row) => row.id === "APP00001");
    assert.ok(payment); assert.equal(payment.status, "Pending");
    assert.equal(payment.sourceFilename, "ap_payments.csv"); assert.equal(payment.sourceRecordNumber, 1);
    await fixture("UPDATE finance.ap_payments SET approval_status='Approved' WHERE payment_id='APP00001'", async () => {
      assert.ok(!(await getOpportunities()).paymentReview.find((row) => row.id === "API00007")!.approvalWarnings.some((row) => row.id === "APP00001"));
      assert.equal((await getDocumentEvidence("ap", "API00007"))!.outstanding, evidence!.outstanding);
    });
  });
  await check("posting and last-transaction ageing reconcile to independent CSV bucket oracle", async () => {
    for (const basis of ["posted", "last"] as const) {
      const buckets = [0n, 0n, 0n, 0n, 0n];
      for (const doc of arAt("2025-12-31").filter((row) => row.outstanding > 0n)) {
        const dates = [doc.posting_date];
        if (basis === "last") {
          dates.push(...allocations.filter((a) => a.invoice_id === doc.invoice_id && a.status === "Allocated" && a.allocation_date <= "2025-12-31" && receiptById.get(a.receipt_id)?.status === "Posted" && receiptById.get(a.receipt_id)!.receipt_date <= "2025-12-31").map((a) => a.allocation_date));
          dates.push(...adjustments.filter((a) => a.invoice_id === doc.invoice_id && a.status === "Posted" && a.adjustment_date <= "2025-12-31").map((a) => a.adjustment_date));
        }
        const date = dates.sort().at(-1)!;
        const age = Math.round((Date.parse("2025-12-31") - Date.parse(date)) / 86400000);
        buckets[age <= 0 ? 0 : age <= 15 ? 1 : age <= 45 ? 2 : age <= 120 ? 3 : 4] += doc.outstanding;
      }
      const ageing = await getAgeing("ar", basis, [15, 45, 120]);
      assert.deepEqual(ageing.buckets.map((row) => cents(row.amount!)), buckets);
    }
    const before = await getAgeing("ar", "last", [15, 45, 120]);
    await fixture(`INSERT INTO finance.ar_receipts (receipt_id,customer_id,receipt_date,receipt_amount_inr,status,source_filename,source_record_number)
      SELECT 'ARR99999',customer_id,'2026-01-02',100,'Posted','verification',99999 FROM finance.ar_invoices WHERE invoice_id='ARI00003';
      INSERT INTO finance.ar_receipt_allocations (allocation_id,receipt_id,invoice_id,allocation_date,allocated_amount_inr,status,source_filename,source_record_number)
      VALUES ('ARA99999','ARR99999','ARI00003','2026-01-02',100,'Allocated','verification',99999)`, async () => {
      assert.deepEqual(await getAgeing("ar", "last", [15, 45, 120]), before);
    });
  });
  const nativeFetch = globalThis.fetch;
  await check("unsupported comparison periods clarify before provider calls while supported months retain scope", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("No provider call expected for unsupported periods"); };
    try {
      for (const question of [
        "Compare receivables in January and March", "Compare receivables from 2025-01 to 2025-03",
        "Compare receivables in January, February and March", "How did receivables change from January through March?",
        "How did receivables change between 2025-01-15 and 2025-03-15?", "Compare receivables March and 2025-04",
        "Show receivables in 2025-13", "Show receivables for Q1", "Show receivables for the last 3 months",
        "Compare receivables from Jan 15 to Feb 15", "Show receivables on 15th January", "Show receivables on February 28th",
        "Show receivables last month", "Show receivables previous month", "Show receivables past month",
      ]) {
        const reply = await processAgentMessage(question, undefined, { geminiKey: "verification-only", providerPriority: "gemini" });
        assert.equal(reply.kind, "clarify", question);
      }
      assert.equal(calls, 0);
      const originalQuery = pool.query;
      const lookupQueries: string[] = [];
      Object.defineProperty(pool, "query", { writable: true, value: (...args: Parameters<typeof pool.query>) => {
        lookupQueries.push(String(args[0]));
        return Reflect.apply(originalQuery, pool, args);
      } });
      let shortfallChoice: string | undefined;
      try {
        const named = await processAgentMessage("Who pays less than billed for Customer 30 Pvt Ltd between January and March?", undefined, { geminiKey: "verification-only", providerPriority: "gemini" });
        assert.equal(named.kind, "clarify");
        if (named.kind === "clarify") {
          assert.ok(named.choices.length > 0 && named.choices.every((choice) => choice.includes("C030")));
          shortfallChoice = named.choices.find((choice) => choice.includes("jan 2025"));
          assert.ok(shortfallChoice);
        }
        const ambiguous = await processAgentMessage("Who pays less than billed for Customer 30 Pvt Ltd and Customer 24 Pvt Ltd between January and March?", undefined, { geminiKey: "verification-only", providerPriority: "gemini" });
        assert.equal(ambiguous.kind, "clarify");
        if (ambiguous.kind === "clarify") { assert.ok(ambiguous.choices.some((choice) => choice.includes("C030"))); assert.ok(ambiguous.choices.some((choice) => choice.includes("C024"))); }
        assert.ok(lookupQueries.length > 0 && lookupQueries.every((sql) => sql.includes("FROM finance.customer_master") && !sql.includes("finance.ar_invoices")));
        assert.equal(calls, 0);
      } finally { Object.defineProperty(pool, "query", { value: originalQuery, writable: true }); }
      const scoped = await processAgentMessage(shortfallChoice!, undefined, { providerPriority: "system" });
      assert.equal(scoped.kind, "answer");
      if (scoped.kind === "answer") { assert.equal(scoped.context?.tool, "toolShortPayments"); assert.equal(scoped.context?.customerId, "C030"); assert.equal(scoped.context?.month, 1); }
      for (const [question, month] of [["How did receivables change in March?", 3], ["Compare receivables in November and December", 12], ["Compare receivables 2025-11 and 2025-12", 12], ["Compare receivables in March and February", 3], ["Compare receivables 2025-12 and 2025-11", 12], ["How did receivables change in Jan 2025?", 1]] as const) {
        const reply = await processAgentMessage(question, undefined, { providerPriority: "system" });
        assert.equal(reply.kind, "answer", question);
        if (reply.kind === "answer") { assert.equal(reply.context?.month, month); assert.equal(new URL(reply.example.evidence[0].href, "http://localhost").searchParams.get("month"), String(month)); }
      }
      const invoice = await processAgentMessage("Explain ARI00003 dated 2025-03-05", undefined, { providerPriority: "system" });
      assert.equal(invoice.kind, "answer");
      if (invoice.kind === "answer") assert.equal(invoice.context?.tool, "toolDocumentEvidence");
      assert.equal(calls, 0);
    } finally { globalThis.fetch = nativeFetch; }
  });
  await check("fresh client config preserves server model and explicit selection overrides it", async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    let saved: string | null = null;
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => saved } });
    try {
      const fresh = getStoredAiConfig();
      assert.ok(!fresh.geminiModelConfigured && !fresh.groqModelConfigured);
      saved = JSON.stringify({ geminiModel: "explicit-gemini", groqModel: "explicit-groq" });
      const selected = getStoredAiConfig();
      assert.equal(selected.geminiModelConfigured, true); assert.equal(selected.groqModelConfigured, true);
      assert.equal(selected.geminiModel, "explicit-gemini"); assert.equal(selected.groqModel, "explicit-groq");
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
      if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage); else Reflect.deleteProperty(globalThis, "localStorage");
    }
    const priorModel = process.env.GROQ_MODEL;
    const models: unknown[] = [];
    globalThis.fetch = async (_input, init) => {
      models.push(JSON.parse(String(init?.body)).model);
      return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: "toolCollectionAttention", arguments: "{}" } }] } }] });
    };
    try {
      process.env.GROQ_MODEL = "server-selected-model";
      await processAgentMessage("Who needs collection attention today?", undefined, { groqKey: "verification-only", providerPriority: "groq" });
      await processAgentMessage("Who needs collection attention today?", undefined, { groqKey: "verification-only", groqModel: "explicit-client-model", providerPriority: "groq" });
      assert.deepEqual(models, ["server-selected-model", "explicit-client-model"]);
    } finally { globalThis.fetch = nativeFetch; if (priorModel === undefined) delete process.env.GROQ_MODEL; else process.env.GROQ_MODEL = priorModel; }
  });
  await check("provider abort and direct text fall through to validated tools", async () => {
    let calls = 0;
    const requests: { body: Record<string, unknown>; signal?: AbortSignal | null }[] = [];
    globalThis.fetch = async (_input, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      requests.push({ body: request, signal: init?.signal });
      if (calls === 1) throw new DOMException("mock deadline", "AbortError");
      if (calls === 2) return Response.json({ choices: [{ message: { content: "Invented advisory" } }] });
      return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: "toolCollectionAttention", arguments: "{}" } }] } }] });
    };
    try {
      process.env.OPENAI_API_KEY = "verification-only";
      const reply = await processAgentMessage("Who needs collection attention today?", undefined, { geminiKey: "verification-only", groqKey: "verification-only" });
      assert.equal(reply.kind, "answer"); assert.equal(calls, 3);
      for (const request of requests) { assert.equal(request.body.tool_choice, "required"); assert.equal(request.body.max_completion_tokens, 2048); }
      assert.equal(requests[0].signal, undefined);
      assert.ok(requests[1].signal); assert.ok(requests[2].signal);
      if (reply.kind === "answer") { assert.ok(reply.example.facts?.length); assert.notEqual(reply.example.answer, "Invented advisory"); }
    } finally { globalThis.fetch = nativeFetch; delete process.env.OPENAI_API_KEY; }
  });
  await check("six supported scenarios return source links and live follow-up context", async () => {
    const scenarios = [
      ["Why are receivables increasing?", "toolReceivablesIncrease"],
      ["Who needs collection attention today?", "toolCollectionAttention"],
      ["Who pays less than they are billed?", "toolShortPayments"],
      ["Why is Customer 30 Pvt Ltd high risk?", "toolCustomerRisk"],
      ["Which vendor payments should be prioritised?", "toolVendorPriorities"],
      ["Investigate HLD0001", "toolInvestigateException"],
    ];
    for (const [question, tool] of scenarios) {
      const reply = await processAgentMessage(question, undefined, { providerPriority: "system" });
      assert.equal(reply.kind, "answer", question);
      if (reply.kind === "answer") {
        assert.ok(reply.example.evidence.length > 0); assert.ok(reply.context);
        assert.equal(reply.context.tool, tool);
        assert.notEqual(reply.example.topic, "Source coverage");
        assert.ok(reply.example.facts?.length);
        assert.ok(reply.example.table?.rows.length);
        if (tool === "toolCustomerRisk") assert.equal(reply.context.customerId, "C030");
        if (tool === "toolInvestigateException") assert.equal(reply.context.issueId, "HLD0001");
        const followup = await processAgentMessage("Show the source evidence", reply.context, { providerPriority: "system" });
        assert.equal(followup.kind, "answer");
        if (followup.kind === "answer") {
          assert.deepEqual(followup.example.table, reply.example.table);
          if (reply.context?.tool === "toolShortPayments") assert.deepEqual(followup.example.evidence[0], reply.example.evidence[0]);
          else assert.deepEqual(followup.example.evidence, reply.example.evidence);
        }
      }
    }
  });
  await check("invalid model tool arguments cannot execute invented tools", async () => {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { tool_calls: [{ function: { name: "deleteLedger", arguments: "{}" } }] } }] });
    try {
      const reply = await processAgentMessage("Who needs collection attention today?", undefined, { groqKey: "verification-only", providerPriority: "groq" });
      assert.equal(reply.kind, "answer");
      const unsupported = await processAgentMessage("Calculate inventory CCC", undefined, { providerPriority: "system" });
      assert.equal(unsupported.kind, "unsupported");
    } finally { globalThis.fetch = nativeFetch; }
  });
  await check("cancelled turns stop before another provider or tool", async () => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(processAgentMessage("Who needs collection attention today?", undefined, { providerPriority: "system" }, controller.signal), { name: "AbortError" });
  });
  await check("in-flight Stop aborts provider work and prevents fallback", async () => {
    let calls = 0;
    const controller = new AbortController();
    globalThis.fetch = async (_input, init) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), { once: true });
        controller.abort();
      });
    };
    try {
      await assert.rejects(processAgentMessage("Who needs collection attention today?", undefined, { geminiKey: "verification-only", groqKey: "verification-only" }, controller.signal), { name: "AbortError" });
      assert.equal(calls, 1);
    } finally { globalThis.fetch = nativeFetch; }
  });
  await check("wrong-party and overallocated cash cannot settle invoices", async () => {
    await fixture("UPDATE finance.ar_receipt_allocations SET allocated_amount_inr=999999999 WHERE allocation_id=(SELECT allocation_id FROM finance.ar_receipt_allocations WHERE invoice_id='ARI00003' LIMIT 1)", async () => {
      assert.equal((await getDocumentEvidence("ar", "ARI00003"))!.outstanding, null);
      assert.equal((await getFinanceSummary()).receivables, null);
    });
    await fixture("UPDATE finance.ar_receipts SET customer_id='C001' WHERE receipt_id=(SELECT receipt_id FROM finance.ar_receipt_allocations WHERE invoice_id='ARI00003' LIMIT 1)", async () => {
      assert.equal((await getDocumentEvidence("ar", "ARI00003"))!.outstanding, null);
    });
  });
  await check("cancelled documents remain inspectable but leave active balances", async () => fixture("UPDATE finance.ar_invoices SET status='Cancelled' WHERE invoice_id='ARI00003'", async () => {
    const evidence = await getDocumentEvidence("ar", "ARI00003");
    assert.equal(evidence!.sourceStatus, "Cancelled"); assert.equal(evidence!.outstanding, null);
    assert.equal((await listDocuments("ar", 1, 10, "ARI00003", "all", "", "number", "asc")).total, 0);
  }));
  await check("requested month and shortfall follow-up customer are retained", async () => {
    const march = await processAgentMessage("How did receivables change in March?", undefined, { providerPriority: "system" });
    assert.equal(march.kind, "answer");
    if (march.kind === "answer") { assert.equal(march.context!.month, 3); assert.ok(march.example.answer.includes("Mar 2025")); assert.equal(new URL(march.example.evidence[0].href, "http://localhost").searchParams.get("month"), "3"); }
    const short = await processAgentMessage("Who pays less than they are billed?", undefined, { providerPriority: "system" });
    assert.equal(short.kind, "answer");
    if (short.kind === "answer") {
      assert.equal(short.context!.customerId, "C030");
      const another = await processAgentMessage("What about C024?", short.context, { providerPriority: "system" });
      assert.equal(another.kind, "answer");
      if (another.kind === "answer") { assert.equal(another.context!.tool, "toolShortPayments"); assert.equal(another.context!.customerId, "C024"); }
    }
  });
  await check("model-supplied unmentioned invoice cannot become evidence", async () => {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { tool_calls: [{ function: { name: "toolDocumentEvidence", arguments: '{"documentId":"ARI00003"}' } }] } }] });
    try {
      const reply = await processAgentMessage("Show that invoice", undefined, { providerPriority: "groq", groqKey: "verification-only" });
      assert.equal(reply.kind, "clarify");
    } finally { globalThis.fetch = nativeFetch; }
  });
  await check("distributed reservation enforces concurrency and sliding-window limits", async () => {
    await pool.query("TRUNCATE public.ledgerlens_chat_requests");
    const reservations = await Promise.all(Array.from({ length: 3 }, () => reserveChatRequest("verification")));
    assert.equal(reservations.filter(Boolean).length, 2);
    for (const id of reservations) if (id) await releaseChatRequest(id);
    for (let index = 0; index < 8; index++) { const id = await reserveChatRequest("verification"); assert.ok(id); await releaseChatRequest(id); }
    assert.equal(await reserveChatRequest("verification"), null);
    await pool.query("TRUNCATE public.ledgerlens_chat_requests");
  });
  await check("HTTP boundary rejects malformed questions and forged context", async () => {
    for (const payload of [{ question: 12 }, { question: "x", context: { tool: "deleteLedger" } }, { question: "x".repeat(1001) }]) {
      const response = await POST(new NextRequest("http://localhost/api/assistant/chat", { method: "POST", body: JSON.stringify(payload) }));
      assert.equal(response.status, 400);
    }
    const response = await POST(new NextRequest("http://localhost/api/assistant/chat", { method: "POST", headers: { "x-ai-provider": "system" }, body: JSON.stringify({ question: "Why is C030 high risk?" }) }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await response.json()).reply.context.customerId, "C030");
  });
} finally {
  await pool.end();
}
console.log(`Completion checks: ${passed} passed, ${failed} failed.`);
if (failed) process.exitCode = 1;

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
