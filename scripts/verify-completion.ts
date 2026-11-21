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
const { listDocuments, getDocumentEvidence } = await import("../src/server/finance/documents");
const { getBalanceHistory, getAgeing } = await import("../src/server/finance/history");
const { getPeriodAnalysis } = await import("../src/server/finance/analysis");
const { getMeasures } = await import("../src/server/finance/measures");
const { getShortPaymentCustomers } = await import("../src/server/finance/short-payments");
const { getCustomerPriorities } = await import("../src/server/finance/customer-priorities");
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
    await check(`${ledger}: configurable date/due ageing and measures preserve supported scope`, async () => {
      for (const basis of ["date", "due"] as const) {
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
  const nativeFetch = globalThis.fetch;
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
      for (const request of requests) { assert.equal(request.body.tool_choice, "required"); assert.equal(request.body.max_completion_tokens, 2048); assert.ok(request.signal); }
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
    if (march.kind === "answer") { assert.equal(march.context!.month, 3); assert.ok(march.example.answer.includes("Mar 2025")); }
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
