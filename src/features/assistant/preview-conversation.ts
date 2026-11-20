"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewExample } from "./examples";

export type PreviewOutcome = "normal" | "service-error" | "rate-limit";

export type PreviewReply =
  | { kind: "loading"; step: number }
  | { kind: "answer"; example: PreviewExample; evidenceOnly: boolean }
  | { kind: "clarify"; choices: readonly string[] }
  | { kind: "unsupported" | "stopped" | "service-error" | "rate-limit" };

export type PreviewTurn = { id: number; question: string; reply: PreviewReply };

export const loadingSteps = ["Executing financial tools", "Querying PostgreSQL system of record", "Synthesizing evidence-backed findings"];

export function usePreviewConversation() {
  const [turns, setTurns] = useState<PreviewTurn[]>([]);
  const [pending, setPending] = useState(false);
  const queued = useRef<{ id: number; timers: ReturnType<typeof setTimeout>[]; controller?: AbortController } | null>(null);
  const nextId = useRef(0);

  useEffect(() => () => {
    queued.current?.timers.forEach((timer) => clearTimeout(timer));
    queued.current?.controller?.abort();
    queued.current = null;
  }, []);

  function update(id: number, reply: PreviewReply) {
    setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, reply } : turn));
  }

  function begin(question: string, outcome: PreviewOutcome = "normal", retryId?: number) {
    if (queued.current) return false;
    const id = retryId ?? nextId.current++;
    const before = retryId === undefined ? turns : turns.slice(0, turns.findIndex((turn) => turn.id === retryId));
    const previous = before.findLast((turn) => turn.reply.kind === "answer")?.reply;
    const lastExample = previous?.kind === "answer" ? previous.example : undefined;

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

    fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, lastExampleId: lastExample?.id }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Assistant chat failed");
        return res.json() as Promise<{ reply: PreviewReply }>;
      })
      .then((data) => {
        if (queued.current === request) {
          queued.current = null;
          setPending(false);
          update(id, data.reply);
        }
      })
      .catch((err) => {
        if (queued.current === request && err.name !== "AbortError") {
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
    setTurns([]);
  }

  return { turns, pending, begin, stop, clear };
}
