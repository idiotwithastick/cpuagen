"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Message, EnforcementResult, Conversation } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";

const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });

/* ─── Copy button ─── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="px-2 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground hover:bg-surface-light transition-colors cursor-pointer"
    >
      {copied ? "\u2713 Copied" : "Copy"}
    </button>
  );
}

/* ─── Simple markdown renderer ─── */
function renderMarkdown(text: string, onOpenCanvas?: (code: string, lang: string) => void) {
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
      const codeText = codeLines.join("\n");
      parts.push(
        <div key={key++} className="my-2 rounded-lg overflow-hidden border border-border">
          <div className="flex items-center justify-between px-3 py-1 bg-surface-light border-b border-border">
            <span className="text-[10px] font-mono text-muted">{lang || "code"}</span>
            <div className="flex items-center gap-1">
              {onOpenCanvas && codeText.split("\n").length >= 3 && (
                <button
                  onClick={() => onOpenCanvas(codeText, lang)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono text-accent-light hover:text-foreground hover:bg-accent/10 transition-colors cursor-pointer"
                >
                  Open in Canvas
                </button>
              )}
              <CopyButton text={codeText} />
            </div>
          </div>
          <pre className="p-3 bg-[#0a0a14] overflow-x-auto text-xs font-mono leading-relaxed">
            <code>{codeText}</code>
          </pre>
        </div>,
      );
      continue;
    }

    // Heading
    const headingMatch = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1 ? "text-lg font-bold mt-4 mb-2" : level === 2 ? "text-base font-semibold mt-3 mb-1.5" : "text-sm font-semibold mt-2 mb-1";
      parts.push(<div key={key++} className={cls}>{headingMatch[2]}</div>);
      i++;
      continue;
    }

    // List item
    const listMatch = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const indent = Math.floor(listMatch[1].length / 2);
      parts.push(
        <div key={key++} className="flex gap-2" style={{ paddingLeft: indent * 16 }}>
          <span className="text-muted shrink-0">{listMatch[2].match(/\d/) ? listMatch[2] : "\u2022"}</span>
          <span>{renderInline(listMatch[3])}</span>
        </div>,
      );
      i++;
      continue;
    }

    // Regular line with inline formatting
    const line = lines[i];
    parts.push(
      <span key={key++}>
        {renderInline(line)}
        {i < lines.length - 1 && "\n"}
      </span>,
    );
    i++;
  }

  return parts;
}

function renderInline(text: string): React.ReactNode[] {
  const inlineParts: React.ReactNode[] = [];
  let remaining = text;
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

  return inlineParts;
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
function MessageBubble({ message, onOpenCanvas }: { message: Message; onOpenCanvas?: (code: string, lang: string) => void }) {
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
            isUser ? message.content : renderMarkdown(message.content, onOpenCanvas)
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

/* ─── Conversation persistence ─── */
function loadConversations(): Conversation[] {
  try {
    const saved = localStorage.getItem("cpuagen-conversations");
    if (saved) return JSON.parse(saved);
    // Migrate old single-chat format
    const oldChat = localStorage.getItem("cpuagen-chat");
    if (oldChat) {
      const msgs: Message[] = JSON.parse(oldChat);
      if (msgs.length > 0) {
        const conv: Conversation = {
          id: crypto.randomUUID(),
          title: generateTitle(msgs),
          messages: msgs,
          createdAt: msgs[0].timestamp,
          updatedAt: msgs[msgs.length - 1].timestamp,
        };
        localStorage.setItem("cpuagen-conversations", JSON.stringify([conv]));
        localStorage.removeItem("cpuagen-chat");
        return [conv];
      }
    }
    return [];
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  try {
    localStorage.setItem("cpuagen-conversations", JSON.stringify(convs));
  } catch {
    // storage full
  }
}

function generateTitle(msgs: Message[]): string {
  const first = msgs.find((m) => m.role === "user");
  if (!first) return "New Chat";
  const text = first.content.slice(0, 50);
  return text.length < first.content.length ? text + "..." : text;
}

/* ─── Example prompts ─── */
const EXAMPLE_PROMPTS = [
  { label: "Explain entropy", prompt: "Explain Shannon entropy in simple terms. How does it relate to information theory?" },
  { label: "Write code", prompt: "Write a Python function that computes the Fibonacci sequence using memoization." },
  { label: "Compare models", prompt: "Compare the strengths and weaknesses of transformer-based language models vs traditional NLP approaches." },
  { label: "Debug help", prompt: "I have a React component that re-renders too often. What are the common causes and how do I fix them?" },
];

/* ─── Main chat page ─── */
export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasCode, setCanvasCode] = useState("");
  const [canvasLang, setCanvasLang] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load settings + conversations
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cpuagen-settings");
      if (saved) {
        const s = JSON.parse(saved);
        setProvider(s.provider || "");
        setApiKey(s.apiKey || "");
        setModel(s.model || "");
        setSystemPrompt(s.systemPrompt || "");
      }
    } catch {
      // ignore
    }
    const convs = loadConversations();
    setConversations(convs);
    // Load most recent conversation
    if (convs.length > 0) {
      const latest = convs[0];
      setActiveConvId(latest.id);
      setMessages(latest.messages);
    }
    setHydrated(true);
  }, []);

  // Persist conversations on change
  useEffect(() => {
    if (!hydrated) return;
    if (activeConvId && messages.length > 0) {
      setConversations((prev) => {
        const existing = prev.findIndex((c) => c.id === activeConvId);
        const updated: Conversation = {
          id: activeConvId,
          title: generateTitle(messages),
          messages,
          createdAt: existing >= 0 ? prev[existing].createdAt : Date.now(),
          updatedAt: Date.now(),
        };
        let next: Conversation[];
        if (existing >= 0) {
          next = [...prev];
          next[existing] = updated;
        } else {
          next = [updated, ...prev];
        }
        // Sort by updatedAt descending
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        saveConversations(next);
        return next;
      });
    }
  }, [messages, hydrated, activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-update canvas when LLM responds with code
  useEffect(() => {
    if (!canvasOpen || loading) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    if (!lastAssistant) return;
    const codeMatch = lastAssistant.content.match(/```(\w*)\n([\s\S]*?)```/);
    if (codeMatch) {
      const [, lang, code] = codeMatch;
      setCanvasCode(code);
      if (lang) setCanvasLang(lang);
    }
  }, [messages, canvasOpen, loading]);

  const providerConfig = PROVIDERS.find((p) => p.id === provider);
  const isDemo = providerConfig?.noKeyRequired;
  const isConfigured = Boolean(provider && model && (isDemo || apiKey));

  const startNewChat = () => {
    const id = crypto.randomUUID();
    setActiveConvId(id);
    setMessages([]);
    setShowHistory(false);
  };

  const loadConversation = (conv: Conversation) => {
    setActiveConvId(conv.id);
    setMessages(conv.messages);
    setShowHistory(false);
  };

  const deleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== convId);
      saveConversations(next);
      return next;
    });
    if (activeConvId === convId) {
      setActiveConvId(null);
      setMessages([]);
    }
  };

  const openCanvas = useCallback((code: string, lang: string) => {
    setCanvasCode(code);
    setCanvasLang(lang);
    setCanvasOpen(true);
  }, []);

  // sendMessageRef lets handleCanvasInstruction call sendMessage without circular deps
  const sendMessageRef = useRef<(text: string) => void>(() => {});

  const handleCanvasInstruction = useCallback((instruction: string, code: string) => {
    const prompt = `Here is the current code:\n\n\`\`\`${canvasLang}\n${code}\n\`\`\`\n\n${instruction}`;
    sendMessageRef.current(prompt);
  }, [canvasLang]);

  const sendMessage = useCallback(async (overrideInput?: string) => {
    const text = overrideInput ?? input;
    if (!text.trim() || loading || !isConfigured) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    // If no active conversation, start one
    if (!activeConvId) {
      const newId = crypto.randomUUID();
      setActiveConvId(newId);
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const allMessages: { role: string; content: string }[] = [];
      // Add system prompt if configured
      if (systemPrompt.trim()) {
        allMessages.push({ role: "system", content: systemPrompt.trim() });
      }
      allMessages.push(
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: userMsg.role, content: userMsg.content },
      );

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
  }, [input, loading, isConfigured, messages, provider, apiKey, model, systemPrompt, activeConvId]);

  sendMessageRef.current = sendMessage;

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
    <div className={`flex-1 flex min-h-0 ${canvasOpen ? "" : "flex-col"}`}>
    {/* Chat pane */}
    <div className={`flex flex-col min-h-0 relative ${canvasOpen ? "w-1/2 border-r border-border" : "flex-1"}`}>
      {/* Chat header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border bg-surface/30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-1.5 -ml-1 rounded-md hover:bg-surface-light text-muted hover:text-foreground transition-colors cursor-pointer"
            title="Chat history"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 4h12M2 8h12M2 12h8" />
            </svg>
          </button>
          <span className="w-1.5 h-1.5 bg-success rounded-full" />
          <span className="text-xs font-mono text-muted">
            {providerConfig?.name} / {model}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startNewChat}
            disabled={loading}
            className="px-2.5 py-1 rounded-md text-[10px] font-mono text-muted border border-border hover:border-accent/30 hover:text-accent-light transition-colors cursor-pointer disabled:opacity-30"
          >
            + New Chat
          </button>
          <span className="px-2 py-0.5 rounded bg-success/10 text-success border border-success/20 text-[10px] font-mono hidden sm:inline">
            8/8 CBF ACTIVE
          </span>
        </div>
      </div>

      {/* History sidebar */}
      {showHistory && (
        <>
          <div
            className="absolute inset-0 top-12 z-10"
            onClick={() => setShowHistory(false)}
          />
          <div className="absolute top-12 left-0 bottom-0 w-72 z-20 bg-surface border-r border-border overflow-y-auto">
            <div className="p-3">
              <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-3 px-2">
                Conversations ({conversations.length})
              </div>
              {conversations.length === 0 && (
                <div className="text-xs text-muted/50 px-2 py-4 text-center">
                  No conversations yet
                </div>
              )}
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors cursor-pointer group flex items-start gap-2 ${
                    conv.id === activeConvId
                      ? "bg-accent/10 text-accent-light border border-accent/20"
                      : "text-muted hover:text-foreground hover:bg-surface-light"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-medium">{conv.title}</div>
                    <div className="text-[10px] text-muted/50 mt-0.5">
                      {conv.messages.length} msgs {"\u00B7"} {new Date(conv.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-all cursor-pointer shrink-0"
                    title="Delete"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" />
                    </svg>
                  </button>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg">
              <div className="text-muted text-sm mb-2">
                {"\ud83d\udee1\ufe0f"} Enforcement active
              </div>
              <div className="text-muted/50 text-xs font-mono mb-6">
                d{"\u03C8"}/dt = -{"\u03B7"}{"\u2207"}S[{"\u03C8"}]
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => {
                      setInput(ex.prompt);
                      if (!activeConvId) {
                        setActiveConvId(crypto.randomUUID());
                      }
                      sendMessage(ex.prompt);
                    }}
                    className="text-left px-4 py-3 rounded-xl border border-border bg-surface/50 hover:bg-surface hover:border-accent/20 text-sm text-muted hover:text-foreground transition-all cursor-pointer"
                  >
                    <div className="font-medium text-xs mb-0.5">{ex.label}</div>
                    <div className="text-[11px] text-muted/60 line-clamp-2">{ex.prompt}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onOpenCanvas={openCanvas} />
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
            onClick={() => sendMessage()}
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
    </div>{/* end chat pane */}

    {/* Canvas pane */}
    {canvasOpen && (
      <div className="w-1/2 min-h-0">
        <Canvas
          code={canvasCode}
          language={canvasLang}
          onClose={() => setCanvasOpen(false)}
          onSendToChat={handleCanvasInstruction}
        />
      </div>
    )}
    </div>
  );
}
