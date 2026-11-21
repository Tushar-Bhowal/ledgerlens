"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChartNoAxesCombined, ClipboardList, Cpu, FileText, List, Mic, ReceiptText, RotateCcw, Square, WalletCards } from "lucide-react";
import { Popover } from "radix-ui";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AssistantReply } from "./assistant-reply";
import { examples, followUp } from "./examples";
import { usePreviewConversation, type PreviewOutcome, type PreviewTurn } from "./preview-conversation";
import { useVoiceDictation } from "./use-voice-dictation";
import { AISettingsDialog } from "@/components/dashboard/ai-settings-dialog";

const draftLimit = 500;
const suggestions = [
  { id: "receivables", label: "Receivables trend", icon: ChartNoAxesCombined },
  { id: "collections", label: "Collection priorities", icon: ClipboardList },
  { id: "vendor-payments", label: "Vendor payments", icon: WalletCards },
];

function appendTranscript(draft: string, transcript: string) {
  return transcript ? [draft.trimEnd(), transcript].filter(Boolean).join(" ") : draft;
}

export function Assistant({ exampleId }: { exampleId?: string }) {
  return <AssistantConversation exampleId={exampleId} />;
}

function AssistantConversation({ exampleId }: { exampleId?: string }) {
  const [draft, setDraft] = useState(() => examples.find((example) => example.id === exampleId)?.question ?? "");
  const { turns, pending, begin, stop, clear, historyReady, historyAvailable } = usePreviewConversation();
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const promptChosen = useRef(false);
  const scrollArea = useRef<HTMLDivElement>(null);
  const latestResponse = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const latest = turns.at(-1);
  const hasConversation = turns.length > 0;
  const latestReply = latest?.reply;
  const voice = useVoiceDictation((transcript) => {
    setDraft((previous) => appendTranscript(previous, transcript));
  });
  const recording = voice.phase === "starting" || voice.phase === "listening";
  const voiceBusy = voice.phase !== "idle";
  const visibleDraft = appendTranscript(draft, voice.transcript);
  const draftTooLong = visibleDraft.length > draftLimit;

  useEffect(() => {
    const area = scrollArea.current;
    const response = latestResponse.current;
    if (!area || !response) return;
    if (response.offsetHeight > area.clientHeight) {
      area.scrollTop += response.getBoundingClientRect().top - area.getBoundingClientRect().top - 8;
    } else {
      area.scrollTop = area.scrollHeight;
    }
  }, [turns.length, latestReply]);

  useEffect(() => {
    if (voice.transcript && input.current) input.current.scrollTop = input.current.scrollHeight;
  }, [voice.transcript]);

  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    const nextHeight = Math.min(Math.max(input.current.scrollHeight, 48), 128);
    input.current.style.height = `${nextHeight}px`;
  }, [visibleDraft]);

  function choosePrompt(question: string) {
    voice.cancel();
    setDraft(question);
    if (examplesOpen) {
      promptChosen.current = true;
      setExamplesOpen(false);
    } else {
      input.current?.focus({ preventScroll: true });
    }
  }

  function send(value: string, outcome: PreviewOutcome = "normal") {
    const question = value.trim();
    if (!question || value.length > draftLimit || voiceBusy || pending || !begin(question, outcome)) return;

    voice.cancel();
    if (examplesOpen) promptChosen.current = true;
    setExamplesOpen(false);
    setDraft("");
    input.current?.focus({ preventScroll: true });
  }

  function retry(turn: PreviewTurn) {
    if (voiceBusy || pending || !begin(turn.question, "normal", turn.id)) return;
    input.current?.focus({ preventScroll: true });
  }

  function stopReply() {
    stop();
    input.current?.focus({ preventScroll: true });
  }

  function reset() {
    voice.cancel();
    setExamplesOpen(false);
    clear();
    setDraft("");
    input.current?.focus({ preventScroll: true });
  }

  return (
    <section className="assistant-page flex flex-col flex-1 h-full max-h-full min-h-0 overflow-hidden relative bg-background text-foreground" aria-labelledby="assistant-heading">
      <div className="assistant-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]" ref={scrollArea}>
        <div className={cn(hasConversation ? "sr-only" : "grid justify-items-center content-center min-h-full py-8 md:py-12 px-4 text-center")}>
          <span className="grid place-items-center size-[50px] mb-4 text-accent-foreground bg-accent/30 border border-border rounded-2xl" aria-hidden="true">
            <ReceiptText size={29} />
          </span>
          <h1 id="assistant-heading" className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tighter leading-tight text-foreground">
            Working capital, explained.
          </h1>
          {!hasConversation && (
            <>
              <p className="max-w-[37ch] mt-2.5 text-muted-foreground text-sm sm:text-base md:text-lg">
                Ask about balances, payments, or the records behind them.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-6" aria-label="Suggested questions">
                {suggestions.map(({ id, label, icon: Icon }) => {
                  const example = examples.find((entry) => entry.id === id);
                  return example && (
                    <button
                      key={id}
                      type="button"
                      className="flex items-center gap-2 min-h-[42px] pl-1.5 pr-3 py-1.5 text-[13px] font-medium text-accent-foreground bg-[var(--button-surface)] border border-[var(--button-border)] hover:bg-[var(--button-surface-hover)] hover:border-primary rounded-xl cursor-pointer transition-colors"
                      onClick={() => choosePrompt(example.question)}
                    >
                      <span className="grid place-items-center size-[29px] text-accent-foreground bg-accent/30 rounded-md">
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="w-full max-w-[780px] mx-auto grid gap-6 px-3.5 sm:px-6 py-5 pb-6" role="log" aria-label="Chat messages">
          {turns.map((turn) => (
            <div className="grid gap-3 min-w-0" key={turn.id}>
              <p className="justify-self-end max-w-[min(86%,560px)] px-3.5 py-2.5 break-words whitespace-pre-wrap bg-primary/10 border border-primary/20 text-foreground rounded-2xl rounded-br-xs text-sm leading-relaxed">
                <span className="sr-only">You: </span>{turn.question}
              </p>
              <div className="grid gap-2 max-w-[66ch] text-sm leading-relaxed text-foreground" ref={turn.id === latest?.id ? latestResponse : undefined}>
                <span className="text-[13px] font-semibold text-foreground">LedgerLens</span>
                <AssistantReply reply={turn.reply} onChoose={choosePrompt} onRetry={turn.id === latest?.id ? () => retry(turn) : undefined} retryDisabled={pending || voiceBusy} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="composer-area flex-none w-full px-3.5 sm:px-6 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))] bg-background border-t border-border/50 shadow-[-4px_16px_4px_rgba(0,0,0,0.08)] relative z-10">
        <div className="grid gap-1.5 w-full max-w-[780px] mx-auto">
          <span className="sr-only" role="status">{pending ? "Preparing a response" : ""}</span>
          {latestReply?.kind === "answer" && !latestReply.evidenceOnly && (
            <button
              className="justify-self-start inline-flex items-center gap-1.5 min-h-[34px] px-3 mb-2 rounded-full text-xs font-medium text-accent-foreground bg-[var(--button-surface)] border border-[var(--button-border)] hover:bg-[var(--button-surface-hover)] hover:border-primary cursor-pointer transition-colors"
              type="button"
              onClick={() => choosePrompt(followUp)}
            >
              <FileText size={15} aria-hidden="true" /> {followUp}
            </button>
          )}
          <form
            className="grid p-2 bg-card border border-border rounded-2xl shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
            onSubmit={(event) => { event.preventDefault(); send(draft); }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              if (recording) {
                event.preventDefault();
                voice.stop();
              } else if (pending && !examplesOpen) {
                event.preventDefault();
                stopReply();
              }
            }}
          >
            <label htmlFor="chat-message" className="sr-only">Ask a working capital question</label>
            <textarea
              ref={input}
              id="chat-message"
              rows={2}
              value={visibleDraft}
              readOnly={voiceBusy}
              maxLength={draftLimit}
              aria-invalid={draftTooLong || undefined}
              aria-describedby={draftTooLong ? "assistant-draft-limit" : undefined}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask a working capital question…"
              className="w-full min-h-[48px] max-h-[128px] px-2 py-1 text-foreground placeholder:text-muted-foreground bg-transparent resize-none outline-none text-base leading-relaxed overflow-y-auto"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!event.repeat) send(draft);
                }
              }}
            />
            <div className="flex items-center justify-between gap-1.5 mt-1">
              <div className="flex items-center gap-1.5">
                <Popover.Root open={examplesOpen} onOpenChange={setExamplesOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          aria-label="Example questions"
                          className="grid place-items-center size-[34px] rounded-lg text-accent-foreground bg-[var(--button-surface)] border border-[var(--button-border)] hover:bg-[var(--button-surface-hover)] hover:border-primary cursor-pointer transition-colors"
                        >
                          <List size={16} aria-hidden="true" />
                        </button>
                      </Popover.Trigger>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      <p>Example questions</p>
                    </TooltipContent>
                  </Tooltip>
                  <Popover.Portal>
                    <Popover.Content
                      align="start"
                      side="top"
                      sideOffset={8}
                      className="z-50 grid gap-1 w-[min(330px,calc(100vw-24px))] max-h-[60vh] overflow-y-auto p-1.5 bg-popover text-popover-foreground border border-border rounded-xl shadow-xl outline-none"
                      aria-label="Example questions"
                      onCloseAutoFocus={(event) => {
                        if (!promptChosen.current) return;
                        event.preventDefault();
                        promptChosen.current = false;
                        input.current?.focus({ preventScroll: true });
                      }}
                    >
                      {examples.map(({ id, question, topic }) => (
                        <button
                          key={id}
                          type="button"
                          className="flex flex-col text-left px-2.5 py-2 rounded-lg text-xs font-medium text-accent-foreground bg-[var(--button-surface)] border border-[var(--button-border)] hover:bg-[var(--button-surface-hover)] hover:border-primary transition-colors cursor-pointer"
                          onClick={() => choosePrompt(question)}
                        >
                          <small className="block mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{topic}</small>
                          {question}
                        </button>
                      ))}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="AI Configuration"
                      className="grid place-items-center size-[34px] rounded-lg text-accent-foreground bg-[var(--button-surface)] border border-[var(--button-border)] hover:bg-[var(--button-surface-hover)] hover:border-primary cursor-pointer transition-colors"
                      onClick={() => setSettingsOpen(true)}
                    >
                      <Cpu size={16} aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    <p>AI Configuration</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Clear conversation"
                      disabled={!hasConversation && !draft && !voiceBusy}
                      className="grid place-items-center size-[34px] rounded-lg text-accent-foreground bg-[var(--button-surface)] border border-[var(--button-border)] hover:bg-[var(--button-surface-hover)] hover:border-primary cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={reset}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    <p>Clear conversation</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex items-center gap-1.5">
                {voice.phase === "listening" && (
                  <span className="inline-flex flex-none items-center gap-[3px] h-6 px-1.5 text-accent-foreground dictation-wave" data-speaking={voice.speaking || undefined} aria-hidden="true">
                    <i /><i /><i /><i /><i /><i /><i />
                  </span>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "grid place-items-center size-[38px] rounded-lg cursor-pointer transition-colors border text-accent-foreground bg-[var(--button-surface)] border-[var(--button-border)] hover:bg-[var(--button-surface-hover)] disabled:opacity-45 disabled:cursor-not-allowed",
                        recording && "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                      )}
                      type="button"
                      aria-label={recording ? "Stop voice dictation" : "Start voice dictation"}
                      aria-pressed={recording}
                      onClick={voice.toggle}
                      disabled={voice.phase === "finishing"}
                    >
                      {recording ? <Square size={15} aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    <p>{recording ? "Stop dictation" : "Start voice dictation"}</p>
                  </TooltipContent>
                </Tooltip>

                {pending ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="grid place-items-center size-[38px] rounded-lg cursor-pointer transition-colors text-primary-foreground bg-destructive hover:bg-destructive/90"
                        type="button"
                        aria-label="Stop response"
                        onClick={stopReply}
                      >
                        <Square size={16} aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      <p>Stop response</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="grid place-items-center size-[38px] rounded-lg cursor-pointer transition-colors text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-45 disabled:cursor-not-allowed"
                        type="submit"
                        disabled={!historyReady || !draft.trim() || voiceBusy || draftTooLong}
                        aria-label="Send question"
                      >
                        <ArrowUp size={19} aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      <p>Send question</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </form>
          {draftTooLong && <p className="text-center text-xs text-amber-500 font-medium mt-0.5" id="assistant-draft-limit" role="status">Shorten the draft to {draftLimit} characters before sending.</p>}
          {!historyAvailable && <p className="text-center text-xs text-muted-foreground mt-0.5" role="status">History could not be saved in this browser. It may be lost when you leave or refresh.</p>}
          {voice.message && <p className="text-center text-xs text-muted-foreground mt-0.5" role="status">{voice.message}</p>}
          <span className="sr-only" role="status">{voice.phase === "listening" ? "Recording" : voice.phase === "finishing" ? "Finishing dictation" : voice.phase === "starting" ? "Waiting for microphone" : ""}</span>
        </div>
      </div>

      <AISettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </section>
  );
}
