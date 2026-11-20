"use client";

import { useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

type Phase = "idle" | "starting" | "listening" | "finishing";
type DictationSession = { cancel: () => void; stop: () => void };

const silenceTimeoutMs = 5000;

function dispose(recognition: Recognition) {
  recognition.onstart = null;
  recognition.onend = null;
  recognition.onspeechstart = null;
  recognition.onspeechend = null;
  recognition.onerror = null;
  recognition.onresult = null;
}

function abort(recognition: Recognition) {
  try {
    recognition.abort();
  } catch {
    // A browser can reject abort once the speech session has already ended.
  }
}

function cancelSession(session: { current: DictationSession | null }) {
  const active = session.current;
  session.current = null;
  active?.cancel();
}

const errors: Partial<Record<SpeechRecognitionErrorEvent["error"], string>> = {
  "not-allowed": "Allow microphone access in your browser settings, or type your question.",
  "service-not-allowed": "Your browser blocked its speech service. You can type your question.",
  "audio-capture": "No microphone is available. Connect one or type your question.",
  "no-speech": "I didn’t catch any speech. Try again or type your question.",
  "network": "The speech service is unavailable. Try again or type your question.",
  "language-not-supported": "The browser doesn’t support this dictation language. You can type your question.",
};

export function useVoiceDictation(onTranscript: (text: string) => void) {
  const session = useRef<DictationSession | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState("");
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => cancelSession(session), []);

  function cancel() {
    cancelSession(session);
    setPhase("idle");
    setMessage("");
    setTranscript("");
    setSpeaking(false);
  }

  function stop() {
    session.current?.stop();
  }

  function toggle() {
    if (session.current) {
      stop();
      return;
    }

    const browser = window as VoiceWindow;
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!window.isSecureContext || !Constructor) {
      setMessage("Voice dictation is unavailable here. You can still type your question.");
      return;
    }

    setPhase("starting");
    setMessage("");
    try {
      const recognition = new Constructor();
      recognition.lang = "en-IN";
      recognition.continuous = true;
      recognition.interimResults = true;

      let latestText = "";
      let started = false;
      let stopping = false;
      let speechActive = false;
      let hasSpeechEvents = false;
      let silenceTimer: ReturnType<typeof setTimeout> | undefined;
      const active: DictationSession = {
        cancel: () => {
          clearTimeout(silenceTimer);
          dispose(recognition);
          abort(recognition);
        },
        stop: stopCapture,
      };
      session.current = active;

      function finish(error?: string) {
        if (session.current !== active) return;
        session.current = null;
        clearTimeout(silenceTimer);
        dispose(recognition);
        if (latestText) onTranscript(latestText);
        setTranscript("");
        setSpeaking(false);
        setPhase("idle");
        setMessage(error ?? (latestText ? "" : "No speech was captured. Try again or type your question."));
      }

      function stopCapture() {
        if (session.current !== active || stopping) return;
        if (!started) {
          cancel();
          return;
        }

        stopping = true;
        clearTimeout(silenceTimer);
        setPhase("finishing");
        setSpeaking(false);
        try {
          recognition.stop();
        } catch {
          finish("Dictation stopped early. You can edit the draft or try again.");
          abort(recognition);
        }
      }

      function scheduleSilenceStop() {
        clearTimeout(silenceTimer);
        if (started && !stopping && !speechActive) silenceTimer = setTimeout(stopCapture, silenceTimeoutMs);
      }

      recognition.onstart = () => {
        if (session.current !== active) return;
        started = true;
        setPhase("listening");
        scheduleSilenceStop();
      };
      recognition.onspeechstart = () => {
        if (session.current !== active || stopping) return;
        hasSpeechEvents = true;
        speechActive = true;
        clearTimeout(silenceTimer);
        setSpeaking(true);
      };
      recognition.onspeechend = () => {
        if (session.current !== active || stopping) return;
        hasSpeechEvents = true;
        speechActive = false;
        setSpeaking(false);
        scheduleSilenceStop();
      };
      recognition.onresult = (event) => {
        if (session.current !== active) return;
        // Each result event contains the confirmed prefix and the latest provisional words.
        latestText = Array.from(event.results, (result) => result[0]?.transcript.trim() ?? "")
          .filter(Boolean)
          .join(" ");
        setTranscript(latestText);
        if (!hasSpeechEvents) scheduleSilenceStop();
      };
      recognition.onerror = (event) => finish(errors[event.error] ?? "Dictation ended. Try again or type your question.");
      recognition.onend = () => finish();
      recognition.start();
    } catch {
      cancelSession(session);
      setPhase("idle");
      setMessage("The microphone couldn’t start. Try again or type your question.");
    }
  }

  return { phase, message, transcript, speaking, toggle, stop, cancel };
}
