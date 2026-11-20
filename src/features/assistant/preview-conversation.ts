"use client";

import { useEffect, useRef, useState } from "react";
import { examples, followUp, type PreviewExample } from "./examples";

export type PreviewOutcome = "normal" | "service-error" | "rate-limit";

export type PreviewReply =
  | { kind: "loading"; step: number }
  | { kind: "answer"; example: PreviewExample; evidenceOnly: boolean }
  | { kind: "clarify"; choices: readonly string[] }
  | { kind: "unsupported" | "stopped" | "service-error" | "rate-limit" };

export type PreviewTurn = { id: number; question: string; reply: PreviewReply };

const delays = [600, 1250, 1950];
export const loadingSteps = ["Matching a sample", "Preparing the figures", "Preparing evidence links"];

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/[.!?,]+/g, "").replace(/\s+/g, " ");
}

function resolve(question: string, previous?: PreviewExample): PreviewReply {
  const normalized = normalize(question);
  const match = examples.find((item) => [item.question, ...item.aliases].some((value) => normalize(value) === normalized));
  if (match) return { kind: "answer", example: match, evidenceOnly: false };

  const followUps = [followUp, "show me the source", "show me the invoices", "show the linked records", "what is the evidence"];
  if (followUps.some((value) => normalize(value) === normalized)) {
    return previous
      ? { kind: "answer", example: previous, evidenceOnly: true }
      : { kind: "clarify", choices: [examples[1].question, examples[5].question] };
  }

  if (["show overdue balances", "show me overdue balances", "what is overdue", "show overdue balances for me"].includes(normalized)) {
    return { kind: "clarify", choices: [examples[1].question, examples[4].question] };
  }

  return { kind: "unsupported" };
}

export function usePreviewConversation() {
  const [turns, setTurns] = useState<PreviewTurn[]>([]);
  const queued = useRef<{ id: number; timers: ReturnType<typeof setTimeout>[] } | null>(null);
  const nextId = useRef(0);

  useEffect(() => () => {
    queued.current?.timers.forEach((timer) => clearTimeout(timer));
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
    const reply: PreviewReply = outcome === "normal" ? resolve(question, lastExample) : { kind: outcome };
    const loading: PreviewReply = { kind: "loading", step: 0 };

    if (retryId === undefined) {
      setTurns((previousTurns) => [...previousTurns, { id, question, reply: loading }]);
    } else {
      update(id, loading);
    }

    const request = { id, timers: [] as ReturnType<typeof setTimeout>[] };
    queued.current = request;
    request.timers = delays.map((delay, index) => setTimeout(() => {
      if (queued.current !== request) return;
      const step = index + 1;
      if (step < loadingSteps.length) {
        update(id, { kind: "loading", step });
      } else {
        queued.current = null;
        update(id, reply);
      }
    }, delay));

    return true;
  }

  function stop() {
    const request = queued.current;
    if (!request) return;
    queued.current = null;
    request.timers.forEach((timer) => clearTimeout(timer));
    update(request.id, { kind: "stopped" });
  }

  function clear() {
    queued.current?.timers.forEach((timer) => clearTimeout(timer));
    queued.current = null;
    setTurns([]);
  }

  return { turns, pending: turns.some((turn) => turn.reply.kind === "loading"), begin, stop, clear };
}
