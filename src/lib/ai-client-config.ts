export interface AiClientConfig {
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  providerPriority: "auto" | "gemini" | "groq" | "system";
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export const GEMINI_MODEL_OPTIONS = [
  { value: "gemini-3.8-flash", label: "gemini-3.8-flash" },
  { value: "gemini-3.5-flash", label: "gemini-3.5-flash" },
  { value: "gemini-2.5-flash", label: "gemini-2.5-flash" },
];

export const GROQ_MODEL_OPTIONS = [
  { value: "openai/gpt-oss-120b", label: "openai/gpt-oss-120b" },
  { value: "openai/gpt-oss-20b", label: "openai/gpt-oss-20b" },
];

export function resolveGeminiModel(model?: string): string {
  const selected = model?.trim().replace(/^models\//, "");
  // Migrate retired defaults from browser storage and older environment files.
  if (!selected || ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"].includes(selected)) {
    return DEFAULT_GEMINI_MODEL;
  }
  return selected;
}

export function resolveGroqModel(model?: string): string {
  const selected = model?.trim();
  if (!selected || ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"].includes(selected)) {
    return DEFAULT_GROQ_MODEL;
  }
  return selected;
}

const STORAGE_KEY = "ledgerlens_ai_config_v1";

export function getStoredAiConfig(): AiClientConfig {
  if (typeof window === "undefined") {
    return {
      geminiApiKey: "",
      geminiModel: DEFAULT_GEMINI_MODEL,
      groqApiKey: "",
      groqModel: DEFAULT_GROQ_MODEL,
      providerPriority: "auto",
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        geminiApiKey: "",
        geminiModel: DEFAULT_GEMINI_MODEL,
        groqApiKey: "",
        groqModel: DEFAULT_GROQ_MODEL,
        providerPriority: "auto",
      };
    }

    const parsed = JSON.parse(raw) as Partial<AiClientConfig>;
    return {
      geminiApiKey: parsed.geminiApiKey || "",
      geminiModel: resolveGeminiModel(parsed.geminiModel),
      groqApiKey: parsed.groqApiKey || "",
      groqModel: resolveGroqModel(parsed.groqModel),
      providerPriority: parsed.providerPriority || "auto",
    };
  } catch {
    return {
      geminiApiKey: "",
      geminiModel: DEFAULT_GEMINI_MODEL,
      groqApiKey: "",
      groqModel: DEFAULT_GROQ_MODEL,
      providerPriority: "auto",
    };
  }
}

export function saveStoredAiConfig(config: AiClientConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event("ledgerlens-ai-config-changed"));
  } catch {
    // Ignore storage quota or disabled errors
  }
}

export function clearStoredAiConfig(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("ledgerlens-ai-config-changed"));
  } catch {
    // Ignore storage errors
  }
}

export function hasCustomAiConfig(config: AiClientConfig): boolean {
  return Boolean(config.geminiApiKey.trim() || config.groqApiKey.trim());
}
