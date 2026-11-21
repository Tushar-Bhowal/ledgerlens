import { z } from "zod";
import { agentContextSchema } from "@/lib/assistant-contract";
import type { PreviewTurn } from "./preview-conversation";

const historyKey = "ledgerlens_chat_history_v1";
const maxTurns = 100;
const maxCharacters = 500_000;
const text = z.string().max(16_000);
const href = z.string().max(2048).refine((value) => value.startsWith("/") && !value.startsWith("//") && !/[\\\x00-\x1f]/.test(value));
const exampleSchema = z.object({
  id: z.string().max(100), topic: text, question: text, aliases: z.array(text).max(50), answer: text,
  facts: z.array(z.object({ label: text, value: text })).max(50).optional(),
  figure: z.object({
    kind: z.enum(["comparison", "allocation"]), title: text,
    values: z.array(z.object({ label: text, amount: z.number().finite() })).max(100),
  }).optional(),
  table: z.object({
    title: text, columns: z.array(text).max(20),
    rows: z.array(z.object({ id: z.string().max(200), values: z.array(text).max(20), href })).max(100),
  }).optional(),
  nextStep: text, limitation: text,
  evidence: z.array(z.object({ label: text, caption: text, href })).max(50),
});
const replySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("loading"), step: z.number().int().min(0).max(2) }),
  z.object({ kind: z.literal("message"), text }),
  z.object({ kind: z.literal("answer"), example: exampleSchema, evidenceOnly: z.boolean(), context: agentContextSchema.optional() }),
  z.object({ kind: z.literal("clarify"), choices: z.array(text).max(100) }),
  z.object({ kind: z.literal("unsupported"), message: text.optional() }),
  z.object({ kind: z.literal("stopped") }),
  z.object({ kind: z.literal("service-error") }),
  z.object({ kind: z.literal("rate-limit") }),
]);
const historySchema = z.object({
  version: z.literal(1),
  turns: z.array(z.object({
    id: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
    question: z.string().max(1000), reply: replySchema,
  })).max(maxTurns),
});

export function readChatHistory(): { turns: PreviewTurn[]; available: boolean } {
  try {
    const raw = window.localStorage.getItem(historyKey);
    if (!raw || raw.length > maxCharacters) return { turns: [], available: true };
    const parsed = historySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { turns: [], available: true };
    const ids = new Set(parsed.data.turns.map((turn) => turn.id));
    if (ids.size !== parsed.data.turns.length) return { turns: [], available: true };
    return {
      turns: parsed.data.turns.map((turn) => ({ ...turn, reply: turn.reply.kind === "loading" ? { kind: "stopped" } : turn.reply })),
      available: true,
    };
  } catch {
    return { turns: [], available: false };
  }
}

export function writeChatHistory(turns: PreviewTurn[]): boolean {
  try {
    if (!turns.length) {
      window.localStorage.removeItem(historyKey);
      return true;
    }
    // A restored page cannot resume an in-flight fetch. Save an interrupted state, not endless loading dots.
    const retained = turns.slice(-maxTurns).map((turn) => ({ ...turn, reply: turn.reply.kind === "loading" ? { kind: "stopped" as const } : turn.reply }));
    let encoded = JSON.stringify({ version: 1, turns: retained });
    while (encoded.length > maxCharacters && retained.length) {
      retained.shift();
      encoded = JSON.stringify({ version: 1, turns: retained });
    }
    window.localStorage.setItem(historyKey, encoded);
    return true;
  } catch {
    return false;
  }
}
