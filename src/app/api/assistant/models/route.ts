import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_GEMINI_MODEL, DEFAULT_GROQ_MODEL, GEMINI_MODEL_OPTIONS, GROQ_MODEL_OPTIONS } from "@/lib/ai-client-config";

export interface ModelItem {
  id: string;
  name: string;
  description?: string;
}

const providerSchema = z.enum(["gemini", "groq"]);
const requestSchema = z.object({ provider: providerSchema.default("gemini"), apiKey: z.string().trim().max(4096).optional() }).strict();
const geminiCatalogSchema = z.object({ models: z.array(z.object({
  name: z.string(), displayName: z.string().optional(), description: z.string().optional(), supportedGenerationMethods: z.array(z.string()).optional(),
})).optional() });
const groqCatalogSchema = z.object({ data: z.array(z.object({ id: z.string(), active: z.boolean().optional() })).optional() });

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.has("apiKey")) return json({ error: "Send credentials in a POST body, never in a URL." }, 400);
  const provider = providerSchema.safeParse(request.nextUrl.searchParams.get("provider") || "gemini");
  if (!provider.success) return json({ error: "Unknown provider" }, 400);
  return fetchModels(provider.data, undefined, request.signal);
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 8192) return json({ error: "Request is too large." }, 413);
    const parsed = requestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return json({ error: "Provide a valid provider and API key." }, 400);
    return fetchModels(parsed.data.provider, parsed.data.apiKey || undefined, request.signal);
  } catch {
    return json({ error: "Invalid request payload" }, 400);
  }
}

async function fetchModels(provider: "gemini" | "groq", userKey: string | undefined, signal: AbortSignal) {
  const gemini = provider === "gemini";
  const suggestions = gemini ? GEMINI_MODEL_OPTIONS : GROQ_MODEL_OPTIONS;
  const fallback = suggestions.map((model) => ({ id: model.value, name: model.label }));
  const apiKey = userKey || (gemini ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY);
  if (!apiKey) return json({ models: fallback, isLive: false, error: "No API key is configured. Suggested defaults are not verified account access." });
  try {
    const response = await fetch(gemini ? "https://generativelanguage.googleapis.com/v1beta/models" : "https://api.groq.com/openai/v1/models", {
      headers: gemini ? { "x-goog-api-key": apiKey } : { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      // This signal remains active while the provider body is parsed.
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return json({ models: fallback, isLive: false, error: `Model discovery failed (HTTP ${response.status}). Check account access or quota; suggested defaults are unverified.` });
    }
    const data: unknown = await response.json();
    let models: ModelItem[];
    if (gemini) {
      const catalog = geminiCatalogSchema.parse(data);
      models = (catalog.models ?? [])
        .filter((model) => model.supportedGenerationMethods?.includes("generateContent") && /^models\/gemini-/.test(model.name) && !/embedding|aqa|image|tts|live|robotic|computer-use/i.test(model.name))
        .map((model) => ({ id: model.name.replace(/^models\//, ""), name: model.displayName ? `${model.displayName} (${model.name.replace(/^models\//, "")})` : model.name.replace(/^models\//, ""), description: model.description }));
    } else {
      const catalog = groqCatalogSchema.parse(data);
      models = (catalog.data ?? [])
        .filter((model) => model.active !== false && model.id.length > 0 && !/whisper|tts|orpheus|guard|embedding|compound/i.test(model.id))
        .map((model) => ({ id: model.id, name: model.id }));
    }
    const preferred = gemini ? DEFAULT_GEMINI_MODEL : DEFAULT_GROQ_MODEL;
    models.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred) || a.id.localeCompare(b.id));
    if (!models.length) return json({ models: fallback, isLive: false, error: "No compatible text-generation candidates were returned. Suggested defaults are unverified." });
    return json({ models, isLive: true, note: "Catalog availability does not guarantee tool-calling access or remaining quota; chat validates tool responses." });
  } catch {
    return json({ models: fallback, isLive: false, error: "Model discovery timed out or returned an invalid response. Suggested defaults are unverified." });
  }
}
