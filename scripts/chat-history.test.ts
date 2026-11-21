import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { readChatHistory, writeChatHistory } from "../src/features/assistant/chat-history";
import type { PreviewTurn } from "../src/features/assistant/preview-conversation";

const key = "ledgerlens_chat_history_v1";
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let entries: Map<string, string>;

beforeEach(() => {
  entries = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: {
      getItem: (name: string) => entries.get(name) ?? null,
      setItem: (name: string, value: string) => { entries.set(name, value); },
      removeItem: (name: string) => { entries.delete(name); },
    },
  } });
});
after(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

const greeting: PreviewTurn = { id: 0, question: "hi", reply: { kind: "message", text: "Hello!" } };
const answer: PreviewTurn = {
  id: 1, question: "Explain C030 in March", reply: {
    kind: "answer", evidenceOnly: false, context: { tool: "toolCustomerRisk", customerId: "C030", month: 3 },
    example: {
      id: "customer-risk", topic: "Customer risk", question: "Explain C030", aliases: [],
      answer: "Review the supporting source records.",
      facts: [{ label: "Amount", value: "₹1,000.01" }],
      table: { title: "Invoices", columns: ["Invoice", "Amount"], rows: [{ id: "ARI00003", values: ["ARI00003", "₹1,000.01"], href: "/receivables?invoice=ARI00003" }] },
      nextStep: "Inspect allocations.", limitation: "Snapshot at 31 December 2025.",
      evidence: [{ label: "Customer", caption: "Source profile", href: "/receivables?customer=C030" }],
    },
  },
};

test("restores messages and exact financial reply/context across storage reads", () => {
  assert.equal(writeChatHistory([greeting, answer]), true);
  assert.deepEqual(readChatHistory(), { available: true, turns: [greeting, answer] });
});

test("pending requests persist as stopped and never mutate the visible loading state", () => {
  const pending: PreviewTurn = { id: 2, question: "Show invoices", reply: { kind: "loading", step: 1 } };
  writeChatHistory([answer, pending]);
  const saved = readChatHistory().turns;
  assert.deepEqual(saved[1].reply, { kind: "stopped" });
  assert.equal(pending.reply.kind, "loading");
  assert.deepEqual(saved[0], answer);
});

test("legacy stored loading states restore as stopped", () => {
  entries.set(key, JSON.stringify({ version: 1, turns: [{ id: 0, question: "hello", reply: { kind: "loading", step: 0 } }] }));
  assert.equal(readChatHistory().turns[0].reply.kind, "stopped");
});

test("clear removes only conversation history and preserves AI settings", () => {
  entries.set("ledgerlens_ai_config_v1", "settings-preserved");
  writeChatHistory([greeting]);
  assert.equal(writeChatHistory([]), true);
  assert.equal(entries.has(key), false);
  assert.equal(entries.get("ledgerlens_ai_config_v1"), "settings-preserved");
  assert.deepEqual(readChatHistory().turns, []);
});

test("corrupt, unsupported-version and duplicate-ID history cannot crash restoration", () => {
  for (const raw of ["{", JSON.stringify({ version: 2, turns: [greeting] }), JSON.stringify({ version: 1, turns: [greeting, greeting] })]) {
    entries.set(key, raw);
    assert.deepEqual(readChatHistory().turns, []);
  }
});

test("invalid reply/context shapes are rejected rather than rendered or reused", () => {
  for (const reply of [{ kind: "answer", example: {} }, { kind: "answer", ...(answer.reply.kind === "answer" ? answer.reply : {}), context: { tool: "deleteLedger" } }]) {
    entries.set(key, JSON.stringify({ version: 1, turns: [{ id: 0, question: "x", reply }] }));
    assert.deepEqual(readChatHistory().turns, []);
  }
});

test("unsafe evidence links are not restored", () => {
  assert.equal(answer.reply.kind, "answer");
  if (answer.reply.kind !== "answer") return;
  for (const unsafe of ["javascript:alert(1)", "https://example.com", "//example.com", "/\\example.com"]) {
    const altered = { ...answer, reply: { ...answer.reply, example: { ...answer.reply.example, evidence: [{ label: "Bad", caption: "Bad", href: unsafe }] } } };
    entries.set(key, JSON.stringify({ version: 1, turns: [altered] }));
    assert.deepEqual(readChatHistory().turns, []);
  }
});

test("disabled browser storage fails safely", () => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("Storage denied"); } });
  assert.deepEqual(readChatHistory(), { turns: [], available: false });
  assert.equal(writeChatHistory([greeting]), false);
  assert.equal(writeChatHistory([]), false);
});

test("quota failures are returned to the UI instead of throwing", () => {
  window.localStorage.setItem = () => { throw new Error("Quota exceeded"); };
  assert.equal(writeChatHistory([greeting]), false);
});

test("keeps the newest 100 turns and preserves their IDs", () => {
  const turns = Array.from({ length: 120 }, (_, id) => ({ ...greeting, id }));
  writeChatHistory(turns);
  const restored = readChatHistory().turns;
  assert.equal(restored.length, 100);
  assert.equal(restored[0].id, 20);
  assert.equal(restored.at(-1)!.id, 119);
});

test("large histories trim oldest turns to the storage size cap", () => {
  const turns: PreviewTurn[] = Array.from({ length: 100 }, (_, id) => ({ id, question: "hello", reply: { kind: "message", text: "a".repeat(16_000) } }));
  assert.equal(writeChatHistory(turns), true);
  assert.ok(entries.get(key)!.length <= 500_000);
  const restored = readChatHistory().turns;
  assert.ok(restored.length > 0 && restored.length < 100);
  assert.equal(restored.at(-1)!.id, 99);
});
