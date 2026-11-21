"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { Dialog } from "radix-ui";
import {
  AiClientConfig,
  clearStoredAiConfig,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  GEMINI_MODEL_OPTIONS,
  getStoredAiConfig,
  GROQ_MODEL_OPTIONS,
  hasCustomAiConfig,
  saveStoredAiConfig,
} from "@/lib/ai-client-config";
import type { ModelItem } from "@/app/api/assistant/models/route";

export function AISettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 animate-in fade-in duration-150" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(100%-2rem,36rem)] max-h-[calc(100vh-4rem)] overflow-y-auto p-5 sm:p-6 bg-popover text-popover-foreground border border-border rounded-2xl shadow-2xl z-51 focus:outline-none animate-in fade-in zoom-in-95 duration-150"
          aria-describedby="ai-settings-desc"
        >
          {open && <AISettingsContent onClose={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AISettingsContent({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<AiClientConfig>(getStoredAiConfig);
  const [activeTab, setActiveTab] = useState<"gemini" | "groq">(() => {
    return config.providerPriority === "groq" ? "groq" : "gemini";
  });

  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [saved, setSaved] = useState(false);

  // Use suggested defaults until the provider returns the account's model catalog.
  const [geminiModels, setGeminiModels] = useState<ModelItem[]>(() =>
    GEMINI_MODEL_OPTIONS.map((o) => ({ id: o.value, name: o.label }))
  );
  const [groqModels, setGroqModels] = useState<ModelItem[]>(() =>
    GROQ_MODEL_OPTIONS.map((o) => ({ id: o.value, name: o.label }))
  );
  const [loadingGeminiModels, setLoadingGeminiModels] = useState(false);
  const [loadingGroqModels, setLoadingGroqModels] = useState(false);
  const [geminiLiveCount, setGeminiLiveCount] = useState<number | null>(null);
  const [groqLiveCount, setGroqLiveCount] = useState<number | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [groqError, setGroqError] = useState<string | null>(null);

  const modelRequests = useRef<Partial<Record<"gemini" | "groq", AbortController>>>({});
  useEffect(() => () => { Object.values(modelRequests.current).forEach((controller) => controller.abort()); }, []);

  async function fetchLiveModels(provider: "gemini" | "groq", keyToUse?: string) {
    const gemini = provider === "gemini";
    const key = keyToUse ?? (gemini ? config.geminiApiKey : config.groqApiKey);
    modelRequests.current[provider]?.abort();
    const controller = new AbortController();
    modelRequests.current[provider] = controller;
    const setLoading = gemini ? setLoadingGeminiModels : setLoadingGroqModels;
    const setError = gemini ? setGeminiError : setGroqError;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/assistant/models", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      });
      if (!response.ok) throw new Error("Model discovery failed");
      const data = await response.json() as { models?: ModelItem[]; isLive?: boolean; error?: string };
      if (controller.signal.aborted) return;
      const models = data.models ?? [];
      (gemini ? setGeminiModels : setGroqModels)(models);
      (gemini ? setGeminiLiveCount : setGroqLiveCount)(data.isLive ? models.length : null);
      if (data.isLive && models.length) {
        setConfig((previous) => {
          const selected = gemini ? previous.geminiModel : previous.groqModel;
          return models.some((model) => model.id === selected) ? previous : { ...previous, [gemini ? "geminiModel" : "groqModel"]: models[0].id };
        });
      } else {
        setError(data.error ?? "Live account access could not be verified. Suggested defaults are shown.");
      }
    } catch {
      if (!controller.signal.aborted) setError("Could not retrieve the provider catalog. Check your key and retry.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function fetchLiveGeminiModels(key?: string) { return fetchLiveModels("gemini", key); }
  function fetchLiveGroqModels(key?: string) { return fetchLiveModels("groq", key); }

  function handleTabChange(tab: "gemini" | "groq") {
    setActiveTab(tab);
    setConfig((prev) => ({ ...prev, providerPriority: tab }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveStoredAiConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  function handleReset() {
    clearStoredAiConfig();
    setConfig({
      geminiApiKey: "",
      geminiModel: DEFAULT_GEMINI_MODEL,
      groqApiKey: "",
      groqModel: DEFAULT_GROQ_MODEL,
      providerPriority: "gemini",
    });
    setActiveTab("gemini");
    setGeminiLiveCount(null);
    setGroqLiveCount(null);
    setGeminiError(null);
    setGroqError(null);
    setSaved(false);
  }

  const isCustomActive = hasCustomAiConfig(config);

  return (
    <div className="flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-border">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="grid place-items-center shrink-0 w-9 h-9 rounded-xl bg-primary/15 text-primary border border-primary/30">
            <Cpu size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <Dialog.Title className="text-base font-semibold tracking-tight text-foreground truncate">
              AI Model & Credentials
            </Dialog.Title>
            <Dialog.Description id="ai-settings-desc" className="text-xs text-muted-foreground mt-0.5 leading-relaxed truncate">
              Select your provider and fetch the text-generation models visible to your account.
            </Dialog.Description>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid place-items-center shrink-0 w-8 h-8 text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors cursor-pointer"
          aria-label="Close settings"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>


      <div className="flex items-start gap-2.5 mt-3.5 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs leading-relaxed">
        <ShieldCheck size={17} className="shrink-0 mt-0.5 text-emerald-400" aria-hidden="true" />
        <p className="min-w-0">
          <strong className="text-emerald-300 font-semibold">Browser storage:</strong> Saved keys persist in this browser&apos;s localStorage until you reset settings. Requests pass them to the application server and selected provider; the application does not save them in its database.
        </p>
      </div>

      {/* Provider Selector Tabs */}
      <div className="mt-4">
        <label className="block text-xs font-semibold text-foreground mb-1.5">
          Select AI Engine
        </label>
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-secondary/40 border border-border rounded-xl">
          <button
            type="button"
            onClick={() => handleTabChange("gemini")}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "gemini"
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
            <span className="truncate">Google Gemini</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("groq")}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "groq"
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Zap size={13} className="text-orange-400" />
            <span className="truncate">Groq Cloud</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3.5 mt-3.5 min-w-0">
        {/* Google Gemini Card */}
        {activeTab === "gemini" && (
          <div className="p-3.5 rounded-xl border border-border bg-card/60 flex flex-col gap-3 shadow-xs min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground min-w-0">
                <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8] shrink-0" />
                <span className="truncate">Google Gemini</span>
                {geminiLiveCount !== null ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 font-mono font-medium">
                    <CheckCircle2 size={10} /> {geminiLiveCount} live models
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground font-mono">
                    {geminiModels.length} default models
                  </span>
                )}
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0"
              >
                Get Free Key <ExternalLink size={11} aria-hidden="true" />
              </a>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="gemini-key" className="font-medium text-muted-foreground">
                  Gemini API Key
                </label>
                <button
                  type="button"
                  onClick={() => fetchLiveGeminiModels()}
                  disabled={loadingGeminiModels}
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer disabled:opacity-50"
                  title="Authenticate key & fetch all available models from Google AI Studio"
                >
                  {loadingGeminiModels ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <RefreshCw size={11} />
                  )}
                  <span>Fetch All Live Models</span>
                </button>
              </div>

              <div className="relative flex items-center min-w-0">
                <input
                  id="gemini-key"
                  type={showGemini ? "text" : "password"}
                  className="w-full px-3 py-2 pr-9 bg-background border border-border rounded-lg text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                  placeholder="AIzaSy..."
                  value={config.geminiApiKey}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setConfig((prev) => ({ ...prev, geminiApiKey: val }));
                  }}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val) fetchLiveGeminiModels(val);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer transition-colors"
                  onClick={() => setShowGemini(!showGemini)}
                  aria-label={showGemini ? "Hide Gemini API Key" : "Show Gemini API Key"}
                >
                  {showGemini ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {geminiError && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-400 mt-0.5">
                  <AlertCircle size={12} className="shrink-0" />
                  <span>{geminiError}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor="gemini-model" className="text-xs font-medium text-muted-foreground">
                Model ({geminiModels.length} {geminiLiveCount !== null ? "live models" : "default models"})
              </label>
              <select
                id="gemini-model"
                className="w-full max-w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer truncate"
                value={config.geminiModel}
                onChange={(e) => setConfig({ ...config, geminiModel: e.target.value })}
              >
                {!geminiModels.some((model) => model.id === config.geminiModel) && (
                  <option value={config.geminiModel}>{config.geminiModel} (saved selection)</option>
                )}
                {geminiModels.map((opt) => (
                  <option key={opt.id} value={opt.id} className="truncate">
                    {opt.name}
                  </option>
                ))}
              </select>
              {geminiLiveCount === null && (
                <span className="text-[11px] text-muted-foreground">
                  Showing suggested defaults. Enter API key and click <strong>Fetch All Live Models</strong> to retrieve text-generation candidates from Google AI Studio.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Groq Cloud Card */}
        {activeTab === "groq" && (
          <div className="p-3.5 rounded-xl border border-border bg-card/60 flex flex-col gap-3 shadow-xs min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground min-w-0">
                <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316] shrink-0" />
                <span className="truncate">Groq Cloud (LPU Inference)</span>
                {groqLiveCount !== null ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 font-mono font-medium">
                    <CheckCircle2 size={10} /> {groqLiveCount} live models
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground font-mono">
                    {groqModels.length} default models
                  </span>
                )}
              </div>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0"
              >
                Get Free Key <ExternalLink size={11} aria-hidden="true" />
              </a>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="groq-key" className="font-medium text-muted-foreground">
                  Groq API Key
                </label>
                <button
                  type="button"
                  onClick={() => fetchLiveGroqModels()}
                  disabled={loadingGroqModels}
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer disabled:opacity-50"
                  title="Authenticate key & fetch all available models from Groq Cloud"
                >
                  {loadingGroqModels ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <RefreshCw size={11} />
                  )}
                  <span>Fetch All Live Models</span>
                </button>
              </div>

              <div className="relative flex items-center min-w-0">
                <input
                  id="groq-key"
                  type={showGroq ? "text" : "password"}
                  className="w-full px-3 py-2 pr-9 bg-background border border-border rounded-lg text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                  placeholder="gsk_..."
                  value={config.groqApiKey}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setConfig((prev) => ({ ...prev, groqApiKey: val }));
                  }}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val) fetchLiveGroqModels(val);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer transition-colors"
                  onClick={() => setShowGroq(!showGroq)}
                  aria-label={showGroq ? "Hide Groq API Key" : "Show Groq API Key"}
                >
                  {showGroq ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {groqError && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-400 mt-0.5">
                  <AlertCircle size={12} className="shrink-0" />
                  <span>{groqError}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor="groq-model" className="text-xs font-medium text-muted-foreground">
                Model ({groqModels.length} {groqLiveCount !== null ? "live models" : "default models"})
              </label>
              <select
                id="groq-model"
                className="w-full max-w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer truncate"
                value={config.groqModel}
                onChange={(e) => setConfig({ ...config, groqModel: e.target.value })}
              >
                {!groqModels.some((model) => model.id === config.groqModel) && (
                  <option value={config.groqModel}>{config.groqModel} (saved selection)</option>
                )}
                {groqModels.map((opt) => (
                  <option key={opt.id} value={opt.id} className="truncate">
                    {opt.name}
                  </option>
                ))}
              </select>
              {groqLiveCount === null && (
                <span className="text-[11px] text-muted-foreground">
                  Showing suggested defaults. Enter API key and click <strong>Fetch All Live Models</strong> to retrieve text-generation candidates from Groq Cloud.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Quick Step Guide */}
        <div className="p-3 bg-secondary/20 border border-dashed border-border rounded-lg text-xs text-muted-foreground leading-relaxed min-w-0">
          <strong className="block text-foreground font-semibold mb-1">Quick Guide</strong>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Generate your key via Google AI Studio or Groq Cloud above.</li>
            <li>Paste your key & click <em>Verify & Fetch Live</em> to pull models directly.</li>
            <li>Select your model and click <em>Save Settings</em>.</li>
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-border mt-0.5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border rounded-lg text-xs font-medium transition-colors cursor-pointer"
            onClick={handleReset}
            title="Reset to default system settings"
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>Reset</span>
          </button>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold transition-opacity cursor-pointer shadow-xs"
          >
            {saved ? <Check size={15} aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
            <span>{saved ? "Saved to Browser!" : "Save Settings"}</span>
          </button>
        </div>

        {isCustomActive && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-sky-500/10 text-sky-400 text-[11px] border border-sky-500/20 truncate">
            <KeyRound size={13} aria-hidden="true" className="shrink-0" />
            <span className="truncate">Custom credentials active for subsequent queries.</span>
          </div>
        )}
      </form>
    </div>
  );
}
