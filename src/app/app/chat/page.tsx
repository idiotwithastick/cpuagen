"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Message, EnforcementResult, Conversation } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";

const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });
const Preview = dynamic(() => import("@/components/Preview"), { ssr: false });

/* ─── HTML detection ─── */
function isHtmlContent(code: string, lang: string): boolean {
  const htmlLangs = ["html", "htm", "svg"];
  if (htmlLangs.includes(lang.toLowerCase())) return true;
  const trimmed = code.trim().toLowerCase();
  return (
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<svg") ||
    (trimmed.startsWith("<") && (trimmed.includes("<body") || trimmed.includes("<div") || trimmed.includes("<style")))
  );
}

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
function renderMarkdown(text: string, onOpenCanvas?: (code: string, lang: string) => void, onOpenPreview?: (code: string, lang: string) => void) {
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
              {onOpenPreview && isHtmlContent(codeText, lang) && codeText.length > 50 && (
                <button
                  onClick={() => onOpenPreview(codeText, lang)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono text-success hover:text-foreground hover:bg-success/10 transition-colors cursor-pointer"
                >
                  Preview
                </button>
              )}
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

  const pre = enforcement.pre;
  const post = enforcement.post;
  const allSafe = pre.cbf.allSafe && (post?.cbf.allSafe ?? true);
  const preBarrierCount = Object.keys(pre.cbf).filter((k) => k !== "allSafe").length;
  const postBarrierCount = post ? Object.keys(post.cbf).filter((k) => k !== "allSafe").length : 0;
  const preSafeCount = Object.entries(pre.cbf).filter(([k, v]) => k !== "allSafe" && (v as { safe: boolean }).safe).length;
  const postSafeCount = post ? Object.entries(post.cbf).filter(([k, v]) => k !== "allSafe" && (v as { safe: boolean }).safe).length : 0;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Always-visible enforcement summary */}
      <div className={`p-2.5 rounded-lg text-[10px] font-mono border ${
        allSafe
          ? "bg-success/5 border-success/20"
          : "bg-danger/5 border-danger/20"
      }`}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={allSafe ? "text-success" : "text-danger"}>
              {allSafe ? "\u2713" : "\u2717"} ENFORCEMENT
            </span>
            <span className="text-muted">|</span>
            <span className="text-muted">
              IN: {preSafeCount}/{preBarrierCount} barriers
            </span>
            {post && (
              <>
                <span className="text-muted">|</span>
                <span className="text-muted">
                  OUT: {postSafeCount}/{postBarrierCount} barriers
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted hover:text-foreground cursor-pointer px-1"
          >
            {expanded ? "\u25B2" : "\u25BC"}
          </button>
        </div>

        {/* Thermosolve signatures — always visible */}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted">
          <span>
            Input: n={pre.signature.n} {"\u00B7"} {"\u03C6"}={pre.signature.phi} {"\u00B7"} {preSafeCount === preBarrierCount ? (
              <span className="text-success">PASSED</span>
            ) : (
              <span className="text-danger">BLOCKED</span>
            )}
          </span>
          {post && (
            <span>
              Output: n={post.signature.n} {"\u00B7"} {"\u03C6"}={post.signature.phi} {"\u00B7"} {postSafeCount === postBarrierCount ? (
                <span className="text-success">VALIDATED</span>
              ) : (
                <span className="text-danger">FAILED</span>
              )}
            </span>
          )}
        </div>

        {/* TEEP cache line — always visible when available */}
        {post?.teepId && (
          <div className="mt-1 text-accent-light">
            {"\u2192"} {post.teepId} {"\u00B7"} Response cached to TEEP ledger
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="p-3 rounded-lg bg-surface border border-border text-[10px] font-mono space-y-3">
          <div>
            <div className="text-muted mb-1">{"\u2500\u2500"} INPUT ENFORCEMENT {"\u2500\u2500"}</div>
            <div className="text-foreground">
              words={pre.signature.n} {"\u00B7"} {"\u03C6"}={pre.signature.phi} {"\u00B7"} dS={"\u2264"}0
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {Object.entries(pre.cbf)
                .filter(([k]) => k !== "allSafe")
                .map(([name, scheme]) => {
                  const s = scheme as { safe: boolean; value: number };
                  return (
                    <span
                      key={name}
                      className={`px-1.5 py-0.5 rounded ${
                        s.safe ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                      }`}
                    >
                      {name} {s.safe ? "\u2713" : "\u2717"} {s.value !== undefined ? `(${s.value})` : ""}
                    </span>
                  );
                })}
            </div>
          </div>

          {post && (
            <div>
              <div className="text-muted mb-1">{"\u2500\u2500"} OUTPUT ENFORCEMENT {"\u2500\u2500"}</div>
              <div className="text-foreground">
                words={post.signature.n} {"\u00B7"} {"\u03C6"}={post.signature.phi} {"\u00B7"} dS={"\u2264"}0
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {Object.entries(post.cbf)
                  .filter(([k]) => k !== "allSafe")
                  .map(([name, scheme]) => {
                    const s = scheme as { safe: boolean; value: number };
                    return (
                      <span
                        key={name}
                        className={`px-1.5 py-0.5 rounded ${
                          s.safe ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                        }`}
                      >
                        {name} {s.safe ? "\u2713" : "\u2717"} {s.value !== undefined ? `(${s.value})` : ""}
                      </span>
                    );
                  })}
              </div>
              {post.teepId && (
                <div className="mt-1.5 text-accent-light">
                  TEEP: {post.teepId} {"\u00B7"} Permanently cached
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Message bubble ─── */
function MessageBubble({ message, onOpenCanvas, onOpenPreview }: { message: Message; onOpenCanvas?: (code: string, lang: string) => void; onOpenPreview?: (code: string, lang: string) => void }) {
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
            isUser ? message.content : renderMarkdown(message.content, onOpenCanvas, onOpenPreview)
          ) : (
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 bg-accent-light rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-accent-light rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-accent-light rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>
        {message.enforcement && <EnforcementBadge enforcement={message.enforcement} />}
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
  const [activeTab, setActiveTab] = useState<"canvas" | "preview">("canvas");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
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

  // Smart auto-scroll: only scroll if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Reset scroll lock when loading finishes (new message complete)
  useEffect(() => {
    if (!loading) {
      userScrolledUpRef.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distFromBottom > 150;
  }, []);

  // Auto-update canvas when LLM responds with code
  useEffect(() => {
    if (!canvasOpen || loading) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    if (!lastAssistant) return;

    // Find all code blocks, prefer HTML ones
    const allMatches = [...lastAssistant.content.matchAll(/```(\w*)\n([\s\S]*?)```/g)];
    if (allMatches.length === 0) return;

    const htmlMatch = allMatches.find(([, lang]) => isHtmlContent("", lang || ""));
    const best = htmlMatch || allMatches[0];
    const [, lang, code] = best;
    setCanvasCode(code);
    if (lang) setCanvasLang(lang);
    if (htmlMatch) setActiveTab("preview");
  }, [messages, canvasOpen, loading]);

  // Auto-open Canvas+Preview for HTML responses when canvas is not open
  useEffect(() => {
    if (canvasOpen || loading) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    if (!lastAssistant) return;
    const htmlMatch = lastAssistant.content.match(/```(html|htm|svg)\n([\s\S]*?)```/);
    if (htmlMatch && htmlMatch[2].length > 50) {
      setCanvasCode(htmlMatch[2]);
      setCanvasLang(htmlMatch[1]);
      setCanvasOpen(true);
      setActiveTab("preview");
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
    setActiveTab(isHtmlContent(code, lang) ? "preview" : "canvas");
  }, []);

  const openPreview = useCallback((code: string, lang: string) => {
    setCanvasCode(code);
    setCanvasLang(lang);
    setCanvasOpen(true);
    setActiveTab("preview");
  }, []);

  // sendMessageRef lets handleCanvasInstruction call sendMessage without circular deps
  const sendMessageRef = useRef<(text: string) => void>(() => {});

  const handleCanvasInstruction = useCallback((instruction: string, code: string) => {
    const prompt = `[CANVAS EDIT REQUEST] Here is the current code in the Canvas editor. Please provide the complete updated code (not a diff):\n\n\`\`\`${canvasLang}\n${code}\n\`\`\`\n\n${instruction}`;
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

      // Default CPUAGEN context — always included so the AI can explain how it works
      const cpuagenContext = [
        "You are an AI assistant responding through CPUAGEN, the world's first physics-based AI enforcement platform. You are NOT a raw LLM — every input and output passes through CPUAGEN's 8 Control Barrier Functions (CBFs) and is validated via thermosolve signatures before reaching the user.",
        "",
        "IMPORTANT BEHAVIORAL RULES:",
        "- You MUST acknowledge that your responses are CPUAGEN-enforced when relevant (e.g., when asked who you are, what makes you different, or how you work).",
        "- When a user asks 'who are you' or 'what are you', identify as an AI assistant powered by [your underlying model] but enforced through CPUAGEN's validation engine.",
        "- Reference the enforcement when it adds value: 'This response has been validated through 8 safety barriers' or 'CPUAGEN's enforcement engine has verified this output.'",
        "- Do NOT pretend the enforcement doesn't exist. You are a CPUAGEN-enforced model, not a raw API call.",
        "",
        "How CPUAGEN works (you may share this with users who ask):",
        "- CPUAGEN is an enforcement layer that sits between the user and any LLM provider (Claude, GPT, Gemini, Grok, etc.).",
        "- Every user message passes through a proprietary validation engine before reaching the LLM.",
        "- 8 independent safety barriers run throughout the entire validation process — they are not a separate step, they actively protect every phase of processing.",
        "- These barriers check for truth alignment, coherence, naturality, energy bounds, and other quality metrics.",
        "- If all 8 barriers pass, the message is forwarded to the LLM. If any barrier fails, the input is blocked.",
        "- The LLM's response also passes through the same barrier validation before being delivered to the user.",
        "- Validated responses are permanently cached in a knowledge store with millions of entries, so previously validated answers can be returned instantly.",
        "- The user brings their own API key — CPUAGEN never stores or has access to the user's conversations beyond the current session.",
        "- The enforcement engine uses proprietary mathematical validation (details are confidential).",
        "- CPUAGEN supports 5+ LLM providers and 13+ models.",
        "Do not speculate about the internal mathematics or algorithms. If asked for specifics about the validation formulas, explain that the enforcement engine is proprietary.",
        "",
        "## Canvas & Preview Features",
        "You have access to two interactive panels that the user can see:",
        "",
        "**Canvas** — A code editor panel on the right side of the chat. When you output a code block (```language), the user can click 'Open in Canvas' to load it into the editor. The user can also edit code directly in the Canvas and ask you to modify it via the Canvas instruction input.",
        "",
        "**Preview** — A live HTML renderer (sandboxed iframe) that sits alongside the Canvas. When you generate HTML content, the user can click 'Preview' to see it rendered live. The Preview updates in real-time as the Canvas code changes.",
        "",
        "**Instructions for generating visual/HTML content:**",
        "- When the user asks for anything visual (landing page, UI mockup, chart, diagram, interactive demo, game, animation), generate COMPLETE, self-contained HTML with all CSS and JS inline.",
        "- Do NOT use external CDN links or imports — everything must be in a single HTML file.",
        "- Use ```html as the language tag so it is correctly identified for preview.",
        "- Make the HTML responsive and visually polished.",
        "- When modifying Canvas content (messages starting with [CANVAS EDIT REQUEST]), always output the COMPLETE updated code, not a diff or partial snippet.",
      ].join("\n");

      allMessages.push({ role: "system", content: cpuagenContext });

      // Add user's custom system prompt if configured
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
                  // Show input enforcement on the user message
                  const inputEnforcement: EnforcementResult = { pre: enforcement.pre };
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === userMsg.id
                        ? { ...m, enforcement: inputEnforcement }
                        : m,
                    ),
                  );
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
    <div className={`flex flex-col min-h-0 relative ${canvasOpen ? "w-1/2 border-r border-border max-md:hidden" : "flex-1"}`}>
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
            8/8 BARRIERS
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
                <div className="text-xs text-muted/70 px-2 py-4 text-center">
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
                    <div className="text-[10px] text-muted/70 mt-0.5">
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
      <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg">
              <div className="text-accent-light text-sm font-medium mb-1">
                {"\ud83d\udee1\ufe0f"} CPUAGEN Enforcement Active
              </div>
              <p className="text-muted text-xs max-w-sm mx-auto mb-1 leading-relaxed">
                Every message is validated by 8 safety barriers before and after reaching your LLM.
                Validated answers are cached for instant future retrieval.
              </p>
              <div className="text-muted/60 text-[10px] font-mono mb-6">
                Ask &ldquo;How does CPUAGEN work?&rdquo; to learn more
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
                    <div className="text-[11px] text-muted/80 line-clamp-2">{ex.prompt}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onOpenCanvas={openCanvas} onOpenPreview={openPreview} />
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
        <div className="max-w-3xl mx-auto mt-2 flex items-center justify-between text-[10px] text-muted/70 font-mono">
          <span>Enter to send {"\u00B7"} Shift+Enter for newline</span>
          <span>Enforcement: ON {"\u00B7"} 8/8 barriers {"\u00B7"} cache active</span>
        </div>
      </div>
    </div>{/* end chat pane */}

    {/* Canvas + Preview pane */}
    {canvasOpen && (
      <div className="w-1/2 min-h-0 flex flex-col max-md:fixed max-md:inset-0 max-md:w-full max-md:z-30 max-md:bg-background">
        {/* Tab bar */}
        <div className="h-10 flex items-center justify-between px-2 border-b border-border bg-surface/30 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab("canvas")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-mono transition-colors cursor-pointer ${
                activeTab === "canvas"
                  ? "bg-accent/15 text-accent-light border border-accent/25"
                  : "text-muted hover:text-foreground hover:bg-surface-light"
              }`}
            >
              Canvas
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "preview"
                  ? "bg-success/15 text-success border border-success/25"
                  : "text-muted hover:text-foreground hover:bg-surface-light"
              }`}
            >
              Preview
              {isHtmlContent(canvasCode, canvasLang) && (
                <span className="w-1.5 h-1.5 bg-success rounded-full" />
              )}
            </button>
          </div>
          <button
            onClick={() => setCanvasOpen(false)}
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-light transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          {activeTab === "canvas" ? (
            <Canvas
              code={canvasCode}
              language={canvasLang}
              onClose={() => setCanvasOpen(false)}
              onSendToChat={handleCanvasInstruction}
              onCodeChange={(code) => setCanvasCode(code)}
            />
          ) : (
            <Preview code={canvasCode} language={canvasLang} />
          )}
        </div>
      </div>
    )}
    </div>
  );
}
