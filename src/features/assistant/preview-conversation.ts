"use client";

import { useEffect, useRef, useState } from "react";
import { readChatHistory, writeChatHistory } from "./chat-history";
import type { AgentContext } from "@/lib/assistant-contract";
import type { PreviewExample } from "./examples";
import { getStoredAiConfig } from "@/lib/ai-client-config";

export type PreviewOutcome = "normal" | "service-error" | "rate-limit";

export type PreviewReply =
  | { kind: "loading"; step: number }
  | { kind: "message"; text: string }
  | { kind: "answer"; example: PreviewExample; evidenceOnly: boolean; context?: AgentContext }
  | { kind: "clarify"; choices: readonly string[] }
  | { kind: "unsupported"; message?: string }
  | { kind: "stopped" | "service-error" | "rate-limit" };

export type PreviewTurn = { id: number; question: string; reply: PreviewReply };

export const loadingSteps = ["Preparing your question", "Selecting the financial analysis", "Retrieving live facts and evidence"];

export function usePreviewConversation() {
  const [turns, setTurns] = useState<PreviewTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState(true);
  const queued = useRef<{ id: number; timers: ReturnType<typeof setTimeout>[]; controller?: AbortController } | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    let mounted = true;
    // Restore after hydration so server HTML and the browser's initial render agree.
    queueMicrotask(() => {
      if (!mounted) return;
      const saved = readChatHistory();
      nextId.current = saved.turns.reduce((next, turn) => Math.max(next, turn.id + 1), 0);
      setTurns(saved.turns);
      setHistoryAvailable(saved.available);
      setHistoryReady(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    let mounted = true;
    const saved = writeChatHistory(turns);
    queueMicrotask(() => { if (mounted) setHistoryAvailable(saved); });
    return () => { mounted = false; };
  }, [turns, historyReady]);

  useEffect(() => () => {
    queued.current?.timers.forEach((timer) => clearTimeout(timer));
    queued.current?.controller?.abort();
    queued.current = null;
  }, []);

  function update(id: number, reply: PreviewReply) {
    setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, reply } : turn));
  }

  function begin(question: string, outcome: PreviewOutcome = "normal", retryId?: number) {
    if (!historyReady || queued.current) return false;
    const id = retryId ?? nextId.current++;
    const before = retryId === undefined ? turns : turns.slice(0, turns.findIndex((turn) => turn.id === retryId));
    const previous = before.findLast((turn) => turn.reply.kind === "answer")?.reply;
    const context = previous?.kind === "answer" ? previous.context : undefined;

    const loading: PreviewReply = { kind: "loading", step: 0 };
    if (retryId === undefined) {
      setTurns((previousTurns) => [...previousTurns, { id, question, reply: loading }]);
    } else {
      update(id, loading);
    }

    setPending(true);

    if (outcome !== "normal") {
      const request = { id, timers: [] as ReturnType<typeof setTimeout>[] };
      queued.current = request;
      request.timers.push(
        setTimeout(() => {
          queued.current = null;
          setPending(false);
          update(id, { kind: outcome });
        }, 1200)
      );
      return true;
    }

    // Call real backend AI agent API
    const controller = new AbortController();
    const request = { id, timers: [] as ReturnType<typeof setTimeout>[], controller };
    queued.current = request;

    // Progression timer for UI feedback
    request.timers.push(
      setTimeout(() => {
        if (queued.current === request) update(id, { kind: "loading", step: 1 });
      }, 600)
    );
    request.timers.push(
      setTimeout(() => {
        if (queued.current === request) update(id, { kind: "loading", step: 2 });
      }, 1200)
    );

    const aiConfig = typeof window !== "undefined" ? getStoredAiConfig() : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (aiConfig?.geminiApiKey) headers["x-gemini-key"] = aiConfig.geminiApiKey;
    if (aiConfig?.geminiModel) headers["x-gemini-model"] = aiConfig.geminiModel;
    if (aiConfig?.groqApiKey) headers["x-groq-key"] = aiConfig.groqApiKey;
    if (aiConfig?.groqModel) headers["x-groq-model"] = aiConfig.groqModel;
    if (aiConfig?.providerPriority) headers["x-ai-provider"] = aiConfig.providerPriority;

    fetch("/api/assistant/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({ question, context }),
      signal: controller.signal,
    })
      .then((res) => {
        if (res.status === 429) return { reply: { kind: "rate-limit" } as PreviewReply };
        if (!res.ok) throw new Error("Assistant chat failed");
        return res.json() as Promise<{ reply: PreviewReply }>;
      })
      .then((data) => {
        if (queued.current === request) {
          request.timers.forEach((timer) => clearTimeout(timer));
          queued.current = null;
          setPending(false);
          update(id, data.reply);
        }
      })
      .catch(() => {
        if (queued.current === request) {
          request.timers.forEach((timer) => clearTimeout(timer));
          queued.current = null;
          setPending(false);
          update(id, { kind: "service-error" });
        }
      });

    return true;
  }

  function stop() {
    const request = queued.current;
    if (!request) return;
    queued.current = null;
    setPending(false);
    request.timers.forEach((timer) => clearTimeout(timer));
    request.controller?.abort();
    update(request.id, { kind: "stopped" });
  }

  function clear() {
    queued.current?.timers.forEach((timer) => clearTimeout(timer));
    queued.current?.controller?.abort();
    queued.current = null;
    setPending(false);
    setHistoryAvailable(writeChatHistory([]));
    setTurns([]);
  }

  return { turns, pending, begin, stop, clear, historyReady, historyAvailable };
}
