"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Message, EnforcementResult } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";

/* ─── Simple markdown renderer ─── */
function renderMarkdown(text: string) {
  const parts: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    // Code block
    if (lines[i].startsWith("```")) {
      const lang = lines[i].slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      parts.push(
        <div key={key++} className="my-2 rounded-lg overflow-hidden border border-border">
          {lang && (
            <div className="px-3 py-1 bg-surface-light text-[10px] font-mono text-muted border-b border-border">
              {lang}
            </div>
          )}
          <pre className="p-3 bg-[#0a0a14] overflow-x-auto text-xs font-mono leading-relaxed">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>,
      );
      continue;
    }

    // Regular line with inline formatting
    let line = lines[i];
    const inlineParts: React.ReactNode[] = [];
    let remaining = line;
    let ik = 0;

    while (remaining.length > 0) {
      // Inline code
      const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/);
      if (codeMatch) {
        if (codeMatch[1]) inlineParts.push(codeMatch[1]);
        inlineParts.push(
          <code key={`ic-${ik++}`} className="px-1.5 py-0.5 rounded bg-surface-light text-accent-light text-[13px] font-mono">
            {codeMatch[2]}
          </code>,
        );
        remaining = codeMatch[3];
        continue;
      }
      // Bold
      const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)$/);
      if (boldMatch) {
        if (boldMatch[1]) inlineParts.push(boldMatch[1]);
        inlineParts.push(<strong key={`b-${ik++}`}>{boldMatch[2]}</strong>);
        remaining = boldMatch[3];
        continue;
      }
      // No more patterns
      inlineParts.push(remaining);
      break;
    }

    parts.push(
      <span key={key++}>
        {inlineParts}
        {i < lines.length - 1 && "\n"}
      </span>,
    );
    i++;
  }

  return parts;
}

/* ─── Enforcement badge ─── */
function EnforcementBadge({ enforcement }: { enforcement?: EnforcementResult }) {
  const [expanded, setExpanded] = useState(false);
  if (!enforcement) return null;

  const post = enforcement.post;
  const allSafe = enforcement.pre.cbf.allSafe && (post?.cbf.allSafe ?? true);

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[10px] font-mono transition-colors cursor-pointer ${
          allSafe
            ? "bg-success/10 text-success border border-success/20 hover:bg-success/15"
            : "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15"
        }`}
      >
        <span>{allSafe ? "\u2713" : "\u2717"} 8/8 CBF</span>
        {post?.teepId && <span className="text-muted">|</span>}
        {post?.teepId && <span>{post.teepId}</span>}
        {post && <span className="text-muted">|</span>}
        {post && <span>dS={post.signature.dS}</span>}
        {post && <span className="text-muted">|</span>}
        {post && <span>{"\u03C6"}={post.signature.phi}</span>}
        <span className="text-muted ml-1">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      {expanded && (
        <div className="mt-2 p-3 rounded-lg bg-surface border border-border text-[10px] font-mono space-y-3">
          <div>
            <div className="text-muted mb-1">{"\u2500\u2500"} PRE-ENFORCEMENT (input) {"\u2500\u2500"}</div>
            <div className="text-foreground">
              n={enforcement.pre.signature.n} S={enforcement.pre.signature.S} dS={enforcement.pre.signature.dS} {"\u03C6"}={enforcement.pre.signature.phi}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {Object.entries(enforcement.pre.cbf)
                .filter(([k]) => k !== "allSafe")
                .map(([name, scheme]) => (
                  <span
                    key={name}
                    className={`px-1.5 py-0.5 rounded ${
                      (scheme as { safe: boolean }).safe
                        ? "bg-success/10 text-success"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    {name}{(scheme as { safe: boolean }).safe ? "\u2713" : "\u2717"}
                  </span>
                ))}
            </div>
          </div>

          {post && (
            <div>
              <div className="text-muted mb-1">{"\u2500\u2500"} POST-ENFORCEMENT (output) {"\u2500\u2500"}</div>
              <div className="text-foreground">
                n={post.signature.n} S={post.signature.S} dS={post.signature.dS} {"\u03C6"}={post.signature.phi}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(post.cbf)
                  .filter(([k]) => k !== "allSafe")
                  .map(([name, scheme]) => (
                    <span
                      key={name}
                      className={`px-1.5 py-0.5 rounded ${
                        (scheme as { safe: boolean }).safe
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger"
                      }`}
                    >
                      {name}{(scheme as { safe: boolean }).safe ? "\u2713" : "\u2717"}
                    </span>
                  ))}
              </div>
              {post.teepId && (
                <div className="mt-1 text-accent-light">TEEP: {post.teepId} (cached)</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Message bubble ─── */
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
            {isUser ? "you" : "assistant"}
          </span>
        </div>
        <div
          className={`px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-accent/15 border border-accent/20 text-foreground"
              : "bg-surface border border-border text-foreground"
          }`}
        >
          {message.content ? (
            isUser ? message.content : renderMarkdown(message.content)
          ) : (
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 bg-accent-light rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-accent-light rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-accent-light rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>
        {!isUser && <EnforcementBadge enforcement={message.enforcement} />}
      </div>
    </div>
  );
}

/* ─── Chat persistence ─── */
function saveChatHistory(messages: Message[]) {
  try {
    localStorage.setItem("cpuagen-chat", JSON.stringify(messages));
  } catch {
    // storage full — ignore
  }
}

function loadChatHistory(): Message[] {
  try {
    const saved = localStorage.getItem("cpuagen-chat");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/* ─── Main chat page ─── */
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load settings + chat history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cpuagen-settings");
      if (saved) {
        const s = JSON.parse(saved);
        setProvider(s.provider || "");
        setApiKey(s.apiKey || "");
        setModel(s.model || "");
      }
    } catch {
      // ignore
    }
    setMessages(loadChatHistory());
    setHydrated(true);
  }, []);

  // Persist messages on change
  useEffect(() => {
    if (hydrated && messages.length > 0) {
      saveChatHistory(messages);
    }
  }, [messages, hydrated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const providerConfig = PROVIDERS.find((p) => p.id === provider);
  const isConfigured = Boolean(provider && apiKey && model);

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem("cpuagen-chat");
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !isConfigured) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, provider, apiKey, model }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let enforcement: Partial<EnforcementResult> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "delta") {
                fullContent += parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullContent } : m,
                  ),
                );
              } else if (parsed.type === "enforcement") {
                if (parsed.stage === "pre") {
                  enforcement.pre = {
                    signature: parsed.signature,
                    cbf: parsed.cbf,
                  };
                } else if (parsed.stage === "post") {
                  enforcement.post = {
                    signature: parsed.signature,
                    cbf: parsed.cbf,
                    teepId: parsed.teepId,
                  };
                }
                if (enforcement.pre) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, enforcement: enforcement as EnforcementResult }
                        : m,
                    ),
                  );
                }
              } else if (parsed.type === "error") {
                throw new Error(parsed.message);
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                throw e;
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${msg}` }
            : m,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading, isConfigured, messages, provider, apiKey, model]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  // Not configured — show setup prompt
  if (!hydrated) return null;

  if (!isConfigured) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-accent-light text-2xl font-bold">C</span>
          </div>
          <h2 className="text-2xl font-bold mb-3">Welcome to CPUAGEN</h2>
          <p className="text-muted text-sm mb-6 leading-relaxed">
            Connect your LLM to start chatting with physics-based enforcement.
            Every response is validated through 8 control barriers and cached as a TEEP.
          </p>
          <Link
            href="/app/settings"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-colors"
          >
            Configure your LLM
            <span>{"\u2192"}</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border bg-surface/30 shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 bg-success rounded-full" />
          <span className="text-xs font-mono text-muted">
            {providerConfig?.name} / {model}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              disabled={loading}
              className="px-2.5 py-1 rounded-md text-[10px] font-mono text-muted border border-border hover:border-danger/30 hover:text-danger transition-colors cursor-pointer disabled:opacity-30"
            >
              New Chat
            </button>
          )}
          <span className="px-2 py-0.5 rounded bg-success/10 text-success border border-success/20 text-[10px] font-mono">
            8/8 CBF ACTIVE
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-muted text-sm mb-2">
                {"\ud83d\udee1\ufe0f"} Enforcement active
              </div>
              <div className="text-muted/50 text-xs font-mono">
                d{"\u03C8"}/dt = -{"\u03B7"}{"\u2207"}S[{"\u03C8"}]
              </div>
              <div className="text-muted/30 text-xs mt-4">
                Type a message to begin
              </div>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4 bg-surface/30 shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Message with enforcement..."
            disabled={loading}
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted/50 text-sm resize-none focus:outline-none focus:border-accent/40 transition-colors disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-4 py-3 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 1.5L14.5 8L1.5 14.5V9.5L10 8L1.5 6.5V1.5Z" />
              </svg>
            )}
          </button>
        </div>
        <div className="max-w-3xl mx-auto mt-2 flex items-center justify-between text-[10px] text-muted/50 font-mono">
          <span>Enter to send {"\u00B7"} Shift+Enter for newline</span>
          <span>Enforcement: ON {"\u00B7"} 8/8 CBF {"\u00B7"} TEEP cache active</span>
        </div>
      </div>
    </div>
  );
}
