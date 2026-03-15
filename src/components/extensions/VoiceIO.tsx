"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

/**
 * Voice Input button — uses Web Speech API for speech-to-text.
 * Renders a mic button that toggles recording.
 */
export function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const toggleListening = useCallback(() => {
    if (!supported) return;

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    transcriptRef.current = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      if (finalTranscript) {
        transcriptRef.current += finalTranscript;
        onTranscript(transcriptRef.current);
      }
    };

    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      // Send final transcript
      if (transcriptRef.current.trim()) {
        onTranscript(transcriptRef.current.trim());
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, supported, onTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  if (!supported) return null;

  return (
    <button
      onClick={toggleListening}
      disabled={disabled}
      className={`p-2 rounded-lg transition-all cursor-pointer disabled:opacity-30 ${
        listening
          ? "bg-danger/20 text-danger border border-danger/30 animate-pulse"
          : "text-muted hover:text-foreground hover:bg-surface-light"
      }`}
      title={listening ? "Stop listening" : "Voice input (Speech-to-Text)"}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="1" width="6" height="9" rx="3" />
        <path d="M3 7v1a5 5 0 0 0 10 0V7" />
        <line x1="8" y1="13" x2="8" y2="15" />
        <line x1="5.5" y1="15" x2="10.5" y2="15" />
      </svg>
    </button>
  );
}

interface VoiceOutputProps {
  text: string;
  autoSpeak?: boolean;
}

/**
 * Voice Output — Text-to-Speech for AI responses.
 * Renders a speaker button that reads the text aloud.
 */
export function VoiceOutput({ text, autoSpeak }: VoiceOutputProps) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utteranceRef = useRef<any>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  // Auto-speak when text changes (if enabled)
  useEffect(() => {
    if (autoSpeak && text && supported) {
      speak();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, autoSpeak]);

  const speak = useCallback(() => {
    if (!supported || !text) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    // Strip markdown formatting for cleaner speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, "code block")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/#{1,6}\s+/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/TEEP:.*$/gm, "")
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [supported, text, speaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speaking]);

  if (!supported || !text) return null;

  return (
    <button
      onClick={speak}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
        speaking
          ? "text-accent-light bg-accent/10"
          : "text-muted hover:text-foreground hover:bg-surface-light"
      }`}
      title={speaking ? "Stop speaking" : "Read aloud"}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="2,5 6,5 10,2 10,14 6,11 2,11" fill={speaking ? "currentColor" : "none"} />
        {!speaking && <path d="M12 5.5a4 4 0 0 1 0 5" />}
        {speaking && (
          <>
            <path d="M12 5.5a4 4 0 0 1 0 5" />
            <path d="M14 3.5a7 7 0 0 1 0 9" />
          </>
        )}
      </svg>
      {speaking ? "Stop" : "Speak"}
    </button>
  );
}

// Web Speech API accessed via (window as any).SpeechRecognition / (window as any).webkitSpeechRecognition
// Types are handled with `any` to avoid TS errors in environments without the Web Speech API types
