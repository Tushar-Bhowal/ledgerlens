"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChartNoAxesCombined, ClipboardList, FileText, List, Mic, ReceiptText, RotateCcw, Square, WalletCards } from "lucide-react";
import { Popover } from "radix-ui";
import { AssistantReply } from "./assistant-reply";
import { examples, followUp } from "./examples";
import { usePreviewConversation, type PreviewOutcome, type PreviewTurn } from "./preview-conversation";
import { useVoiceDictation } from "./use-voice-dictation";

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
  const { turns, pending, begin, stop, clear } = usePreviewConversation();
  const [examplesOpen, setExamplesOpen] = useState(false);
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

  function choosePrompt(question: string) {
    voice.cancel();
    setDraft(question);
    if (examplesOpen) {
      promptChosen.current = true;
      setExamplesOpen(false);
    } else {
      input.current?.focus();
    }
  }

  function send(value: string, outcome: PreviewOutcome = "normal") {
    const question = value.trim();
    if (!question || value.length > draftLimit || voiceBusy || pending || !begin(question, outcome)) return;

    voice.cancel();
    if (examplesOpen) promptChosen.current = true;
    setExamplesOpen(false);
    setDraft("");
    input.current?.focus();
  }

  function retry(turn: PreviewTurn) {
    if (voiceBusy || pending || !begin(turn.question, "normal", turn.id)) return;
    input.current?.focus();
  }

  function stopReply() {
    stop();
    input.current?.focus();
  }

  function reset() {
    voice.cancel();
    setExamplesOpen(false);
    clear();
    setDraft("");
    input.current?.focus();
  }

  return (
    <section className="assistant-page" aria-labelledby="assistant-heading">
      <div className="assistant-session">
        {(hasConversation || draft || voiceBusy) && (
          <button className="assistant-tool" type="button" onClick={reset}><RotateCcw size={15} aria-hidden="true" /> Clear conversation</button>
        )}
      </div>

      <div className="assistant-scroll" ref={scrollArea}>
        <div className={hasConversation ? "sr-only" : "assistant-welcome"}>
          <span className="assistant-brand-mark" aria-hidden="true"><ReceiptText size={29} /></span>
          <h1 id="assistant-heading">Working capital, explained.</h1>
          {!hasConversation && (
            <>
              <p>Ask about balances, payments, or the records behind them.</p>
              <div className="assistant-prompts" aria-label="Suggested questions">
                {suggestions.map(({ id, label, icon: Icon }) => {
                  const example = examples.find((entry) => entry.id === id);
                  return example && (
                    <button key={id} type="button" onClick={() => choosePrompt(example.question)}>
                      <span><Icon size={16} aria-hidden="true" /></span>{label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="conversation-log" role="log" aria-label="Chat messages">
          {turns.map((turn) => (
            <div className="chat-turn" key={turn.id}>
              <p className="chat-user"><span className="sr-only">You: </span>{turn.question}</p>
              <div className="chat-response" ref={turn.id === latest?.id ? latestResponse : undefined}>
                <span className="response-name">LedgerLens</span>
                <AssistantReply reply={turn.reply} onChoose={choosePrompt} onRetry={turn.id === latest?.id ? () => retry(turn) : undefined} retryDisabled={pending || voiceBusy} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="composer-area">
        <span className="sr-only" role="status">{pending ? "Preparing a response" : ""}</span>
        {latestReply?.kind === "answer" && !latestReply.evidenceOnly && (
          <button className="assistant-tool follow-up" type="button" onClick={() => choosePrompt(followUp)}>
            <FileText size={15} aria-hidden="true" /> {followUp}
          </button>
        )}
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(draft); }} onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (recording) {
            event.preventDefault();
            voice.stop();
          } else if (pending && !examplesOpen) {
            event.preventDefault();
            stopReply();
          }
        }}>
          <label htmlFor="chat-message" className="sr-only">Ask a working capital question</label>
          <textarea ref={input} id="chat-message" rows={2} value={visibleDraft} readOnly={voiceBusy} maxLength={draftLimit} aria-invalid={draftTooLong || undefined} aria-describedby={draftTooLong ? "assistant-draft-limit" : undefined} onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask a working capital question…"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (!event.repeat) send(draft);
              }
            }} />
          <div className="composer-tools">
            <Popover.Root open={examplesOpen} onOpenChange={setExamplesOpen}>
              <Popover.Trigger className="assistant-tool" type="button"><List size={17} aria-hidden="true" /> Examples</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" side="top" sideOffset={8} className="assistant-example-menu" aria-label="Example questions" onCloseAutoFocus={(event) => {
                  if (!promptChosen.current) return;
                  event.preventDefault();
                  promptChosen.current = false;
                  input.current?.focus();
                }}>
                  {examples.map(({ id, question, topic }) => (
                    <button key={id} type="button" onClick={() => choosePrompt(question)}>
                      <small>{topic}</small>{question}
                    </button>
                  ))}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <div className="composer-actions">
              {voice.phase === "listening" && (
                <span className="dictation-wave" data-speaking={voice.speaking || undefined} aria-hidden="true">
                  <i /><i /><i /><i /><i /><i /><i />
                </span>
              )}
              <button className="assistant-tool voice-button" type="button" aria-label={recording ? "Stop voice dictation" : "Start voice dictation"}
                aria-pressed={recording} title={recording ? "Stop dictation" : "Start dictation"}
                onClick={voice.toggle} disabled={voice.phase === "finishing"}>
                {recording ? <Square size={15} aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
              </button>
              {pending ? (
                <button className="assistant-send assistant-stop" type="button" aria-label="Stop response" onClick={stopReply}>
                  <Square size={16} aria-hidden="true" />
                </button>
              ) : (
                <button className="assistant-send" type="submit" disabled={!draft.trim() || voiceBusy || draftTooLong} aria-label="Send question">
                  <ArrowUp size={19} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </form>
        {draftTooLong && <p className="voice-status" id="assistant-draft-limit" role="status">Shorten the draft to {draftLimit} characters before sending.</p>}
        <p className="voice-status" role="status">{voice.message}</p>
        <span className="sr-only" role="status">{voice.phase === "listening" ? "Recording" : voice.phase === "finishing" ? "Finishing dictation" : voice.phase === "starting" ? "Waiting for microphone" : ""}</span>
      </div>
    </section>
  );
}
