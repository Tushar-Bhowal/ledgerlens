import { reserveChatRequest, releaseChatRequest, keepChatRequestAlive } from "@/server/agent/request-limits";
import { z } from "zod";
import { agentContextSchema } from "@/lib/assistant-contract";
import { NextRequest, NextResponse } from "next/server";
import { processAgentMessage, type ClientAiConfig } from "@/server/agent/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  context: agentContextSchema.optional(),
}).strict();


const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(a|an|the)\b/i,
  /act\s+as\s+(a|an|if)\b/i,
  /repeat\s+(everything|all|the\s+text)\s+(above|before)/i,
  /output\s+(your|the)\s+(system\s+)?prompt/i,
  /reveal\s+(your|the)\s+(system|internal)/i,
  /what\s+(are|is)\s+your\s+(system\s+)?(instructions|prompt|rules)/i,
  /show\s+me\s+(your|the)\s+(api|secret|env|key|token|password|credential)/i,
  /\bsudo\b|\brm\s+-rf\b|\bdrop\s+table\b|\bexec\s*\(/i,
  /<script[\s>]|javascript:/i,
];

function sanitizeInput(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

function detectInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export async function POST(request: NextRequest) {
  let reservation: string | null = null;
  let stopRenewal: (() => void) | undefined;
  try {
    // Bound the body while reading, rather than trusting a caller-supplied Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Question is required." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        return NextResponse.json({ error: "Request is too large." }, { status: 413 });
      }
      chunks.push(value);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) return NextResponse.json({ error: "Provide a question up to 1000 characters and valid conversation context." }, { status: 400 });
    const body = parsed.data;
    const rawQuestion = body.question;

    const question = sanitizeInput(rawQuestion);

    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    if (detectInjection(question)) {
      return NextResponse.json({
        reply: {
          kind: "clarify",
          choices: [
            "Why are receivables increasing?",
            "Who needs collection attention today?",
            "Which vendor payments should be prioritised?",
          ],
        },
      });
    }

    const priority = request.headers.get("x-ai-provider") || "auto";
    if (!["auto", "gemini", "groq", "system"].includes(priority)) {
      return NextResponse.json({ error: "Invalid AI provider selection." }, { status: 400 });
    }
    const clientConfig: ClientAiConfig = {
      geminiKey: request.headers.get("x-gemini-key") || undefined,
      geminiModel: request.headers.get("x-gemini-model") || undefined,
      groqKey: request.headers.get("x-groq-key") || undefined,
      groqModel: request.headers.get("x-groq-model") || undefined,
      providerPriority: priority as ClientAiConfig["providerPriority"],
    };

    const trustProxy = process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "true";
    const identity = trustProxy ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown" : "local";
    reservation = await reserveChatRequest(identity);
    if (!reservation) return NextResponse.json({ reply: { kind: "rate-limit" } }, {
      status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
    stopRenewal = keepChatRequestAlive(reservation);
    const reply = await processAgentMessage(question, body.context, clientConfig, request.signal);
    console.log(`[LedgerLens Agent] Completed reply: ${reply.kind}${reply.kind === "answer" ? `; tool: ${reply.context?.tool ?? "none"}` : ""}.`);
    return NextResponse.json({ reply }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("Assistant chat failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ reply: { kind: "service-error" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    stopRenewal?.();
    if (reservation) {
      try { await releaseChatRequest(reservation); }
      catch { console.error("Chat reservation release failed; its lease will expire automatically."); }
    }
  }
}
