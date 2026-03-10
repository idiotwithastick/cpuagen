"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface CanvasProps {
  code: string;
  language: string;
  onClose: () => void;
  onSendToChat: (instruction: string, code: string) => void;
  onCodeChange?: (code: string) => void;
}

export default function Canvas({ code, language, onClose, onSendToChat, onCodeChange }: CanvasProps) {
  const [editedCode, setEditedCode] = useState(code);
  const [instruction, setInstruction] = useState("");
  const [copied, setCopied] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditedCode(code);
  }, [code]);

  useEffect(() => {
    setLineCount(editedCode.split("\n").length);
  }, [editedCode]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = editedCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [editedCode]);

  const handleScroll = () => {
    if (textareaRef.current && lineNumRef.current) {
      lineNumRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleSend = () => {
    if (!instruction.trim()) return;
    onSendToChat(instruction.trim(), editedCode);
    setInstruction("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Tab support
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target as HTMLTextAreaElement;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = editedCode.substring(0, start) + "  " + editedCode.substring(end);
      setEditedCode(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border bg-surface/30 shrink-0">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent-light">
            <path d="M5 2L2 8l3 6M11 2l3 6-3 6M9 3L7 13" />
          </svg>
          <span className="text-xs font-mono text-muted">
            Canvas {"\u00B7"} {language || "code"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-md text-[10px] font-mono text-muted border border-border hover:border-accent/30 hover:text-foreground transition-colors cursor-pointer"
          >
            {copied ? "\u2713 Copied" : "Copy All"}
          </button>
          <button
            onClick={() => {
              const blob = new Blob([editedCode], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `code.${language || "txt"}`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2.5 py-1 rounded-md text-[10px] font-mono text-muted border border-border hover:border-accent/30 hover:text-foreground transition-colors cursor-pointer"
          >
            Download
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-light transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line numbers */}
        <div
          ref={lineNumRef}
          className="w-12 bg-[#08081a] text-muted/30 text-xs font-mono text-right pr-3 pt-3 pb-3 overflow-hidden select-none shrink-0 leading-[1.6]"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code textarea */}
        <textarea
          ref={textareaRef}
          value={editedCode}
          onChange={(e) => {
            setEditedCode(e.target.value);
            onCodeChange?.(e.target.value);
          }}
          onScroll={handleScroll}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const ta = e.target as HTMLTextAreaElement;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;
              const newVal = editedCode.substring(0, start) + "  " + editedCode.substring(end);
              setEditedCode(newVal);
              onCodeChange?.(newVal);
              requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + 2;
              });
            }
          }}
          spellCheck={false}
          className="flex-1 bg-[#0a0a14] text-foreground text-xs font-mono p-3 resize-none outline-none leading-[1.6] overflow-auto"
        />
      </div>

      {/* Instruction input */}
      <div className="border-t border-border p-3 bg-surface/30 shrink-0">
        <div className="flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI to modify this code..."
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted/40 text-sm focus:outline-none focus:border-accent/40 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!instruction.trim()}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white font-medium text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            Update
          </button>
        </div>
        <div className="mt-1.5 text-[10px] text-muted/70 font-mono">
          Enter to send {"\u00B7"} Tab for indent {"\u00B7"} {editedCode.split("\n").length} lines
        </div>
      </div>
    </div>
  );
}
