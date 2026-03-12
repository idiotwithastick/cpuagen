"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Message, EnforcementResult, Conversation, Settings, ApiKeys, FileAttachment, PageAnnotations, AnnotationCommand } from "@/lib/types";
import { PROVIDERS, migrateSettings, DEFAULT_SETTINGS, FILE_LIMITS } from "@/lib/types";
import type { ConsoleEntry } from "@/components/Canvas";

const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });
const Preview = dynamic(() => import("@/components/Preview"), { ssr: false });
const GreyBeamCanvas = dynamic(() => import("@/components/GreyBeamCanvas"), { ssr: false });

/* ─── HTML / Markdown detection ─── */
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

function isPreviewable(code: string, lang: string): boolean {
  return isHtmlContent(code, lang) || ["md", "markdown"].includes(lang.toLowerCase());
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
function renderMarkdown(text: string, onOpenCanvas?: (code: string, lang: string) => void, onOpenPreview?: (code: string, lang: string) => void, onAnnotationCommand?: (cmds: AnnotationCommand[]) => void) {
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

      // Handle annotation-command blocks
      if (lang === "annotation-command" && onAnnotationCommand) {
        let cmds: AnnotationCommand[] = [];
        try { cmds = JSON.parse(codeText); } catch { /* invalid JSON */ }
        if (cmds.length > 0) {
          const annCount = cmds.filter((c) => c.action === "add").length;
          const pages = [...new Set(cmds.map((c) => c.page).filter(Boolean))];
          parts.push(
            <div key={key++} className="my-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-[10px] font-mono text-amber-400">
                {annCount} annotation{annCount !== 1 ? "s" : ""}{pages.length > 0 ? ` on page${pages.length > 1 ? "s" : ""} ${pages.join(", ")}` : ""}
              </span>
              <button
                onClick={() => onAnnotationCommand(cmds)}
                className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer"
              >
                Apply to Markup
              </button>
            </div>,
          );
          continue;
        }
      }

      parts.push(
        <div key={key++} className="my-2 rounded-lg overflow-hidden border border-border">
          <div className="flex items-center justify-between px-3 py-1 bg-surface-light border-b border-border">
            <span className="text-[10px] font-mono text-muted">{lang || "code"}</span>
            <div className="flex items-center gap-1">
              {onOpenPreview && isPreviewable(codeText, lang) && codeText.length > 50 && (
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
              IN: {preSafeCount === preBarrierCount ? "ALL PASS" : `${preSafeCount} of series`}
            </span>
            {post && (
              <>
                <span className="text-muted">|</span>
                <span className="text-muted">
                  OUT: {postSafeCount === postBarrierCount ? "ALL PASS" : `${postSafeCount} of series`}
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

/* ─── Attachment display ─── */
function AttachmentChips({ attachments, onOpenInMarkup }: { attachments?: FileAttachment[]; onOpenInMarkup?: (att: FileAttachment) => void }) {
  if (!attachments || attachments.length === 0) return null;

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {attachments.map((att) => {
        const isImage = att.mimeType.startsWith("image/");
        const isPdf = att.mimeType === "application/pdf" || att.name.toLowerCase().endsWith(".pdf");
        return (
          <div key={att.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-light border border-border text-[10px] font-mono text-muted">
            {isImage && att.dataUrl ? (
              <img src={att.dataUrl} alt={att.name} className="w-6 h-6 rounded object-cover" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                <path d="M7 1H3a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L7 1z" />
                <path d="M7 1v3h3" />
              </svg>
            )}
            <span className="max-w-[120px] truncate">{att.name}</span>
            <span className="text-muted/60">{formatSize(att.size)}</span>
            {isPdf && onOpenInMarkup && att.dataUrl && (
              <button
                onClick={() => onOpenInMarkup(att)}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
              >
                Markup
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Message bubble ─── */
function MessageBubble({ message, onOpenCanvas, onOpenPreview, onOpenInMarkup, onAnnotationCommand }: { message: Message; onOpenCanvas?: (code: string, lang: string) => void; onOpenPreview?: (code: string, lang: string) => void; onOpenInMarkup?: (att: FileAttachment) => void; onAnnotationCommand?: (cmds: AnnotationCommand[]) => void }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
            {isUser ? "you" : "assistant"}
          </span>
        </div>
        {isUser && <AttachmentChips attachments={message.attachments} onOpenInMarkup={onOpenInMarkup} />}
        <div
          className={`px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-accent/15 border border-accent/20 text-foreground"
              : "bg-surface border border-border text-foreground"
          }`}
        >
          {message.content ? (
            isUser ? message.content : renderMarkdown(message.content, onOpenCanvas, onOpenPreview, onAnnotationCommand)
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
    const json = JSON.stringify(convs);
    // If total JSON > 4MB, strip dataUrl from attachments to prevent storage overflow
    if (json.length > 4 * 1024 * 1024) {
      const stripped = convs.map((c) => ({
        ...c,
        messages: c.messages.map((m) => ({
          ...m,
          attachments: m.attachments?.map((a) => ({ ...a, dataUrl: "" })),
        })),
      }));
      localStorage.setItem("cpuagen-conversations", JSON.stringify(stripped));
    } else {
      localStorage.setItem("cpuagen-conversations", json);
    }
  } catch {
    // storage full — try stripping attachments
    try {
      const stripped = convs.map((c) => ({
        ...c,
        messages: c.messages.map((m) => ({
          ...m,
          attachments: m.attachments?.map((a) => ({ ...a, dataUrl: "" })),
        })),
      }));
      localStorage.setItem("cpuagen-conversations", JSON.stringify(stripped));
    } catch {
      // truly full
    }
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
  { label: "What is CPUAGEN?", prompt: "What is CPUAGEN and how is it different from using a raw LLM like ChatGPT?" },
  { label: "How enforcement works", prompt: "How does CPUAGEN's enforcement engine work? What happens to my message before it reaches the AI?" },
  { label: "Safety barriers", prompt: "What are CPUAGEN's Control Barrier Functions? What does each one check for?" },
  { label: "CPUAGEN vs raw AI", prompt: "What's the difference between a CPUAGEN-enforced response and a raw LLM response? Why should I care?" },
  { label: "What is SSD-RCI?", prompt: "What is SSD-RCI and how does it relate to CPUAGEN? Are they the same thing?" },
  { label: "Hallucination prevention", prompt: "How does CPUAGEN prevent AI hallucinations? What's different about physics-based validation vs prompt engineering?" },
  { label: "TEEP caching", prompt: "What is TEEP caching in CPUAGEN? How does it make responses faster and more reliable?" },
  { label: "Thermosolve signatures", prompt: "What are thermosolve signatures and why does every CPUAGEN response have one?" },
  { label: "Multi-model support", prompt: "Which AI models does CPUAGEN support? Can I use Claude, GPT, and Gemini through the same enforcement layer?" },
  { label: "Physics-based AI", prompt: "What does 'physics-based AI enforcement' mean? How is CPUAGEN using physics to validate AI responses?" },
  { label: "Validation pipeline", prompt: "Walk me through the full CPUAGEN validation pipeline from the moment I type a message to when I see the response." },
  { label: "Why enforcement matters", prompt: "Why does AI enforcement matter? What problems does CPUAGEN solve that other AI platforms don't?" },
  { label: "Knowledge caching", prompt: "How does CPUAGEN's knowledge cache work? What does it mean that validated answers are cached permanently?" },
  { label: "Pre vs post validation", prompt: "What's the difference between pre-validation and post-validation in CPUAGEN? Why validate both input AND output?" },
  { label: "Barrier failures", prompt: "What happens when one of CPUAGEN's safety barriers fails? Does the response get blocked entirely?" },
  { label: "Who built CPUAGEN?", prompt: "Who created CPUAGEN and what's the vision behind it? What problem was it originally designed to solve?" },
  { label: "Enterprise use cases", prompt: "How could enterprises use CPUAGEN? What are the business applications of physics-based AI enforcement?" },
  { label: "Model consensus", prompt: "What is multi-model consensus in CPUAGEN? How does querying multiple AIs simultaneously improve accuracy?" },
  { label: "Bring your own key", prompt: "How does the 'bring your own API key' model work in CPUAGEN? Does CPUAGEN ever see my conversations?" },
  { label: "Future roadmap", prompt: "What's coming next for CPUAGEN? What features are planned for the future of the platform?" },
  { label: "GreyBeam Markup", prompt: "What is GreyBeam in CPUAGEN? How does the PDF markup and annotation system work? Can the AI draw annotations on my PDFs?" },
];

/* ─── Main chat page ─── */
export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasCode, setCanvasCode] = useState("");
  const [canvasLang, setCanvasLang] = useState("");
  const [activeTab, setActiveTab] = useState<"canvas" | "preview" | "markup">("canvas");
  const [consoleOutput, setConsoleOutput] = useState<ConsoleEntry[]>([]);
  const [markupPdfData, setMarkupPdfData] = useState<ArrayBuffer | null>(null);
  const [markupPdfName, setMarkupPdfName] = useState("");
  const [markupAnnotations, setMarkupAnnotations] = useState<PageAnnotations>({});
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const justHydratedRef = useRef(false);
  const autoOpenedForRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived from settings
  const provider = settings.activeProvider;
  const model = settings.activeModel;
  const systemPrompt = settings.systemPrompt;
  const apiKey = settings.apiKeys[provider as keyof ApiKeys] || "";

  // Load settings + conversations
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cpuagen-settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings(migrateSettings(parsed));
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
    justHydratedRef.current = true;

    // v12.1: TEEP restore removed — Vercel serverless isolation means
    // POST /api/teep goes to a different instance than /api/chat.
    // Metrics now flow via SSE metrics_snapshot → localStorage → admin dashboard.
  }, []);

  // Persist conversations on change
  useEffect(() => {
    if (!hydrated) return;
    // Skip the first fire right after hydration — we just loaded this data
    if (justHydratedRef.current) {
      justHydratedRef.current = false;
      return;
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  // Auto-open Canvas+Preview for HTML responses when canvas is not open
  useEffect(() => {
    if (canvasOpen || loading) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    if (!lastAssistant) return;
    // Don't re-auto-open for the same message (prevents loop with canvasOpen toggle)
    const msgKey = lastAssistant.content.slice(0, 100);
    if (autoOpenedForRef.current === msgKey) return;
    const htmlMatch = lastAssistant.content.match(/```(html|htm|svg)\n([\s\S]*?)```/);
    if (htmlMatch && htmlMatch[2].length > 50) {
      autoOpenedForRef.current = msgKey;
      setCanvasCode(htmlMatch[2]);
      setCanvasLang(htmlMatch[1]);
      setCanvasOpen(true);
      setActiveTab("preview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  const providerConfig = PROVIDERS.find((p) => p.id === settings.activeProvider);
  const isDemo = providerConfig?.noKeyRequired;
  const isConfigured = Boolean(settings.activeProvider && settings.activeModel && (isDemo || apiKey));

  // Providers that have keys configured (for switcher dropdown)
  const availableProviders = PROVIDERS.filter(
    (p) => p.noKeyRequired || settings.apiKeys[p.id as keyof ApiKeys],
  );

  const handleProviderSwitch = (newProvider: string) => {
    const config = PROVIDERS.find((p) => p.id === newProvider);
    if (!config) return;
    const newSettings: Settings = {
      ...settings,
      activeProvider: newProvider as Settings["activeProvider"],
      activeModel: config.defaultModel,
    };
    setSettings(newSettings);
    localStorage.setItem("cpuagen-settings", JSON.stringify(newSettings));
  };

  const handleModelSwitch = (newModel: string) => {
    const newSettings: Settings = { ...settings, activeModel: newModel };
    setSettings(newSettings);
    localStorage.setItem("cpuagen-settings", JSON.stringify(newSettings));
  };

  // File attachment handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(Array.from(files));
    e.target.value = "";
  };

  const processFiles = (files: File[]) => {
    for (const file of files) {
      if (pendingAttachments.length >= FILE_LIMITS.maxFilesPerMessage) break;
      if (file.size > FILE_LIMITS.maxFileSize) continue;

      const isAllowedMime = FILE_LIMITS.allowedMimeTypes.includes(file.type as typeof FILE_LIMITS.allowedMimeTypes[number]);
      const isAllowedExt = FILE_LIMITS.codeExtensions.test(file.name);
      const isDocExt = /\.(docx?|xlsx?|pdf|md)$/i.test(file.name);
      if (!isAllowedMime && !isAllowedExt && !isDocExt) continue;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const attachment: FileAttachment = {
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || "text/plain",
          size: file.size,
          dataUrl,
        };
        setPendingAttachments((prev) => {
          if (prev.length >= FILE_LIMITS.maxFilesPerMessage) return prev;
          return [...prev, attachment];
        });
        // Auto-open PDFs in Markup tab immediately
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
          const binary = atob(dataUrl.split(",")[1]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          setMarkupPdfData(bytes.buffer);
          setMarkupPdfName(file.name);
          setCanvasOpen(true);
          setActiveTab("markup");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  }, [pendingAttachments.length]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

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
    setActiveTab(isPreviewable(code, lang) ? "preview" : "canvas");
  }, []);

  const openPreview = useCallback((code: string, lang: string) => {
    setCanvasCode(code);
    setCanvasLang(lang);
    setCanvasOpen(true);
    setActiveTab("preview");
  }, []);

  const openInMarkup = useCallback((att: FileAttachment) => {
    if (!att.dataUrl) return;
    const binary = atob(att.dataUrl.split(",")[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    setMarkupPdfData(bytes.buffer);
    setMarkupPdfName(att.name);
    setCanvasOpen(true);
    setActiveTab("markup");
  }, []);

  const handleAnnotationCommand = useCallback((cmds: AnnotationCommand[]) => {
    setMarkupAnnotations((prev) => {
      const next = { ...prev };
      for (const cmd of cmds) {
        const page = cmd.page ?? 1;
        if (cmd.action === "add" && cmd.annotation) {
          next[page] = [...(next[page] || []), cmd.annotation];
        } else if (cmd.action === "clear") {
          next[page] = [];
        }
      }
      return next;
    });
    setCanvasOpen(true);
    setActiveTab("markup");
  }, []);

  // sendMessageRef lets handleCanvasInstruction call sendMessage without circular deps
  const sendMessageRef = useRef<(text: string) => void>(() => {});
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCanvasEditRef = useRef(false);

  // v14.0: Store the original canvas instruction for compact display
  const canvasInstructionRef = useRef<string>("");

  const handleCanvasInstruction = useCallback((instruction: string, code: string) => {
    const prompt = `[CANVAS EDIT REQUEST] Here is the current code in the Canvas editor. Please provide the complete updated code (not a diff):\n\n\`\`\`${canvasLang}\n${code}\n\`\`\`\n\n${instruction}`;
    isCanvasEditRef.current = true;
    canvasInstructionRef.current = instruction;
    sendMessageRef.current(prompt);
  }, [canvasLang]);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }, []);

  const sendMessage = useCallback(async (overrideInput?: string) => {
    const text = overrideInput ?? input;
    if (!text.trim() || loading || !isConfigured) return;

    // Capture and clear attachments
    const msgAttachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    setPendingAttachments([]);

    // v14.0: Mark canvas edit messages for compact display / hiding
    const isCanvas = isCanvasEditRef.current;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
      attachments: msgAttachments,
      canvasEdit: isCanvas || undefined,
      canvasInstruction: isCanvas ? canvasInstructionRef.current : undefined,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      canvasEdit: isCanvas || undefined,
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

      // Default CPUAGEN context — comprehensive knowledge base for answering user questions
      const cpuagenContext = [
        "# CPUAGEN SYSTEM IDENTITY",
        "",
        "You are an AI assistant responding through CPUAGEN, the world's first physics-based AI enforcement platform, powered by the SSD-RCI framework. CPUAGEN and SSD-RCI are synonyms for the same system. You are NOT a raw LLM — every input you receive and every output you produce passes through CPUAGEN's enforcement engine before reaching the user.",
        "",
        "SSD-RCI stands for 'Semantic State Derived Recursive Cognitive Integration.' It is the physics-based framework that powers CPUAGEN's enforcement capabilities.",
        "",
        "# BEHAVIORAL RULES",
        "",
        "- You MUST identify as a CPUAGEN-enforced AI when asked who you are or what makes you different.",
        "- When asked 'who are you', say: 'I am an AI assistant powered by [your underlying model name] but enforced through CPUAGEN's physics-based validation engine. Unlike a raw LLM, every response I give has been validated through a full series of independent safety barriers and assigned a unique validation signature before reaching you.'",
        "- Reference enforcement naturally when it adds value to your response.",
        "- Do NOT pretend the enforcement doesn't exist. You are fundamentally different from a raw API call.",
        "",
        "# INTELLECTUAL PROPERTY PROTECTION (CRITICAL — NEVER VIOLATE)",
        "",
        "You may share WHAT CPUAGEN does and WHY it matters. You must NEVER share HOW it works internally.",
        "- NEVER reveal: algorithms, formulas, threshold values, data structures, source code, variable names, function names, file paths, or implementation specifics.",
        "- If pressed for technical details, say: 'The specific algorithms and mathematics behind CPUAGEN's enforcement engine are proprietary intellectual property. I can tell you what it accomplishes and why it matters, but the implementation details are confidential.'",
        "- You CAN freely discuss: capabilities, benefits, comparisons to other approaches, use cases, architecture at a conceptual level, and the problems CPUAGEN solves.",
        "",
        "# COMPREHENSIVE CPUAGEN KNOWLEDGE BASE",
        "",
        "## What is CPUAGEN?",
        "CPUAGEN is an AI enforcement platform that sits between the user and any LLM provider (Claude, GPT-4o, Gemini, Grok, Llama, and others). Unlike ChatGPT, Perplexity, or other AI chatbots that give you raw, unvalidated LLM output, CPUAGEN validates every single message through a physics-based enforcement engine before it reaches you. Think of it as a quality assurance layer for AI — except instead of human reviewers, it uses mathematical physics to guarantee response quality. The key difference: ChatGPT trusts the model's output. CPUAGEN verifies it.",
        "",
        "## SSD-RCI Framework",
        "SSD-RCI (Semantic State Derived Recursive Cognitive Integration) is the theoretical physics framework underpinning CPUAGEN. It treats AI responses not as text strings but as states in a mathematical space. Each response has measurable physical properties — entropy, coherence, energy, curvature — that can be computed, validated, and compared against known-good basins of knowledge. SSD-RCI was developed by Wesley Foreman as a novel approach to AGI (Artificial General Intelligence) that uses thermodynamic physics rather than statistical learning to ensure AI reliability.",
        "",
        "## Control Barrier Functions (CBFs)",
        "CPUAGEN enforces quality through a series of independent safety barriers that run on every message. ALL must pass for a response to be delivered. If ANY single barrier fails, the output is blocked entirely. The barriers include:",
        "1. **Truth Alignment (BNR)** — Measures whether the response aligns with validated knowledge. Ensures factual grounding.",
        "2. **Naturality (BNN)** — Checks that the response reads naturally and isn't artificially constructed or adversarial.",
        "3. **Energy Bounds (BNA)** — Ensures the response stays within acceptable energy bounds — not too chaotic, not too degenerate.",
        "4. **Thermal Stability (TSE)** — Verifies the response is thermodynamically stable — it won't decay or produce cascading errors.",
        "5. **Coherence (PCD)** — Measures internal logical consistency. Every part of the response must be consistent with every other part.",
        "6. **Optimization Guard (OGP)** — Prevents Goodhart's Law failures — stops the system from optimizing a metric at the expense of actual quality.",
        "7. **Quality Metric (ECM)** — Holistic quality assessment across multiple dimensions simultaneously.",
        "8. **Synergy (SPC)** — Ensures all components work together synergistically — the whole response is greater than the sum of its parts.",
        "These are not simple keyword filters or regex rules. Each barrier is a mathematical function computed from the physics of the response itself.",
        "",
        "## Thermosolve Signatures",
        "Every message processed by CPUAGEN receives a unique thermosolve signature — a mathematical fingerprint computed from the content's physical properties. This signature contains metrics like entropy (information density), coherence (logical consistency), and other physics-derived values. The signature serves multiple purposes: it proves the response was validated, it enables instant cache lookups for identical or similar queries, and it provides a permanent audit trail. You can see the thermosolve signature in the enforcement badge attached to every message in the chat interface.",
        "",
        "## TEEP Caching (Thermodynamically Encoded Experience Packets)",
        "TEEPs are CPUAGEN's permanent knowledge cache. When a response passes all barriers, it is encoded as a TEEP — a compact representation that captures both the content and its validation state. TEEPs are stored permanently in a knowledge ledger. The CPUAGEN system has over 7 million validated TEEPs cached. When a new query arrives, CPUAGEN first checks the TEEP cache. If a matching TEEP exists, the validated answer is returned instantly (sub-millisecond) without even needing to call the LLM. This means: (1) previously answered questions return instantly, (2) validated knowledge compounds over time, and (3) the system gets faster and more reliable the more it's used.",
        "",
        "## How the Validation Pipeline Works (End-to-End)",
        "Step 1: You type a message. Step 2: CPUAGEN's enforcement engine receives your message BEFORE the LLM sees it. Step 3: Your message is converted into a thermosolve signature — a physics-based representation. Step 4: The full Control Barrier series runs on your input (pre-validation). This checks that the input is well-formed and safe to process. Step 5: If pre-validation passes, your message is forwarded to the LLM you selected (Claude, GPT, Gemini, etc.). Step 6: The LLM generates its response. Step 7: The LLM's response passes through the SAME barrier series (post-validation). Step 8: A new thermosolve signature is computed for the output. Step 9: If all barriers pass, the response is cached as a TEEP and delivered to you with its validation signature. Step 10: If any barrier fails at any step, the output is blocked and you're notified.",
        "",
        "## Pre-Validation vs Post-Validation",
        "CPUAGEN validates BOTH the input AND the output. Pre-validation (on your message) ensures the query is well-formed, coherent, and not adversarial. Post-validation (on the AI's response) ensures the answer is truthful, coherent, stable, and meets all quality barriers. This dual validation is critical because: a perfectly valid question can still produce a hallucinated answer. By validating both sides, CPUAGEN catches problems that single-pass systems miss entirely.",
        "",
        "## How CPUAGEN Prevents Hallucinations",
        "Traditional approaches to hallucination prevention rely on prompt engineering ('be accurate'), retrieval augmentation (RAG), or fine-tuning. These are all statistical approaches — they reduce the probability of hallucination but can never eliminate it. CPUAGEN takes a fundamentally different approach: physics-based validation. Instead of asking 'is this probably correct?', CPUAGEN asks 'does this response satisfy the mathematical constraints required for truth alignment, coherence, and stability?' This is the difference between hoping a bridge won't fall down (statistical) and computing whether the forces balance (physics). The CBF series provides mathematical guarantees that no purely statistical approach can match.",
        "",
        "## Supported LLM Providers and Models",
        "CPUAGEN is provider-agnostic. It works with: Anthropic (Claude Opus 4.6, Sonnet 4.6, Haiku 4.5), OpenAI (GPT-5.4, GPT-5.4 Pro, Codex 5.3, o3, o4-mini), Google (Gemini 3.1 Pro, Gemini 3 Flash), xAI (Grok 4.1), and more. The enforcement is identical regardless of which model you choose — the same barrier series, the same validation signatures, the same TEEP caching. You bring your own API key, and CPUAGEN wraps your chosen model in its enforcement layer. This means you can switch models freely and still get the same quality guarantees.",
        "",
        "## What Happens When a Barrier Fails?",
        "When any barrier in the series detects a problem, the response is blocked entirely. CPUAGEN does not deliver partial results or 'best-effort' responses. This is by design — a response that fails even one barrier may contain hallucinations, inconsistencies, or quality issues. The enforcement badge in the chat shows exactly which barriers passed and which failed. In practice, most well-formed queries produce responses that pass all barriers. Failures typically occur with adversarial inputs, edge cases, or when the LLM produces genuinely low-quality output.",
        "",
        "## Physics-Based AI Enforcement",
        "Traditional AI safety uses statistical methods — RLHF (Reinforcement Learning from Human Feedback), Constitutional AI, guardrails. These approach safety as a probability problem. CPUAGEN approaches it as a physics problem. Every AI response has measurable physical properties: entropy (information content), coherence (internal consistency), energy (complexity bounds), stability (whether the response is a stable state or will decay). By computing these physical properties and checking them against mathematical constraints, CPUAGEN provides deterministic safety guarantees rather than probabilistic ones.",
        "",
        "## Multi-Model Consensus",
        "For critical decisions, CPUAGEN can query multiple LLM providers simultaneously and converge on a validated consensus answer. Different models have different strengths, biases, and failure modes. By comparing responses across providers and using thermosolve signatures to measure agreement, CPUAGEN can identify which parts of an answer are universally agreed upon (high confidence) and which parts show model disagreement (lower confidence). This is similar to how scientific consensus works — if independent observers agree, confidence increases.",
        "",
        "## Bring Your Own Key (BYOK)",
        "CPUAGEN uses a BYOK model: you provide your own API key for your chosen LLM provider. CPUAGEN never stores your API key on its servers — it's kept only in your browser's local storage. Your conversations are not stored beyond your current session. CPUAGEN's enforcement engine processes your messages in real-time but does not retain them. This means: your data stays yours, your API costs are transparent (you pay your provider directly), and you can revoke access at any time by removing your key.",
        "",
        "## Who Built CPUAGEN?",
        "CPUAGEN was created by Wesley Foreman, the sole architect of the SSD-RCI framework. Wesley developed SSD-RCI as a novel approach to Artificial General Intelligence (AGI) that uses thermodynamic physics rather than statistical learning. The vision: AI should not just be powerful — it should be provably reliable. CPUAGEN is the commercial application of this research, making physics-based enforcement accessible to anyone who uses AI. Wesley is based in Illinois, USA, and is open to acquisition, licensing, and collaboration inquiries.",
        "",
        "## Enterprise Use Cases",
        "CPUAGEN's enforcement is valuable anywhere AI reliability matters: Healthcare (validated medical information, no hallucinated drug interactions), Legal (fact-checked legal research, consistent case analysis), Finance (verified market analysis, compliant reporting), Engineering (validated technical specifications, safe design parameters), Education (accurate educational content, consistent explanations), Government (reliable policy analysis, auditable AI decisions). Any organization that uses AI and needs to trust the output can benefit from CPUAGEN's enforcement layer.",
        "",
        "## Future Roadmap",
        "CPUAGEN is in private alpha with planned expansions including: IDE integration (VS Code extension, cloud code environments), full web search with enforcement (every search result validated), multi-model consensus mode in the UI, enterprise API for bulk enforcement, mobile apps, workspace mode with real file editing through enforcement, and deeper SSD-RCI integration including the full TEEP ledger with millions of pre-validated knowledge entries. The platform is actively developed and evolving rapidly.",
        "",
        "## The Anti-Goodhart Principle",
        "CPUAGEN is built on the Anti-Goodhart First (AGF) principle: 'When a measure becomes a target, it ceases to be a good measure.' Traditional AI systems optimize for metrics (helpfulness scores, human preference ratings) that can be gamed. CPUAGEN's enforcement engine is designed to be immune to Goodhart's Law — the barriers measure fundamental physical properties that cannot be faked or gamed. A response either satisfies the physics or it doesn't.",
        "",
        "## The Knowledge Compounding Effect",
        "Unlike traditional AI chatbots where every question is answered from scratch, CPUAGEN's TEEP cache means knowledge compounds over time. The first time a question is answered and validated, it's cached permanently. Every subsequent identical or similar query returns the cached, pre-validated answer instantly. This creates a growing knowledge base of verified answers that gets faster and more comprehensive with every interaction. The system currently has over 7 million cached TEEPs.",
        "",
        "# Canvas, Preview & GreyBeam Markup Features",
        "",
        "**Canvas** — A code editor panel on the right side of the chat. When you output a code block, the user can click 'Open in Canvas' to load it into the editor.",
        "**Preview** — A live HTML renderer (sandboxed iframe) alongside the Canvas. HTML content renders live and updates in real-time.",
        "",
        "**GreyBeam Markup** — A built-in PDF annotation and markup system integrated into CPUAGEN. GreyBeam is a browser-native alternative to Bluebeam Revu, offering 15 annotation tools: line, arrow, circle, rectangle, cloud, polyline, freehand, callout, highlight, hatch, stamp, count, measure, and text. Users can upload a PDF, annotate it directly in the Markup tab, and the AI can also send annotation commands to draw on PDFs programmatically. GreyBeam uses a dual-canvas architecture — a read-only PDF layer underneath and a transparent drawing overlay on top — for pixel-perfect annotations at any zoom level. All annotations are stored as plain JSON per page, making them fully serializable and AI-readable. The Markup tab appears alongside Canvas and Preview in the right panel. When a PDF is attached to a message, a 'Markup' button appears on the attachment chip to open it directly in GreyBeam. The AI can also emit annotation commands in fenced `annotation-command` code blocks, which render as 'Apply to Markup' buttons in the chat.",
        "",
        "**HTML generation rules:** Generate COMPLETE self-contained HTML with inline CSS/JS. No CDN links. Use ```html tag. Make it responsive and polished. For Canvas edits, output the COMPLETE updated code.",
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

      abortControllerRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          messages: allMessages,
          provider,
          apiKey,
          model,
          attachments: msgAttachments?.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            dataUrl: a.dataUrl,
          })),
        }),
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
              } else if (parsed.type === "metrics_snapshot") {
                // v12.1: Save enforcement metrics from same serverless instance
                // Solves Vercel isolation: chat route sends metrics directly in SSE
                try {
                  localStorage.setItem("cpuagen-enforcement-metrics", JSON.stringify({
                    metrics: parsed.metrics,
                    recentTeeps: parsed.recentTeeps,
                    timestamp: parsed.timestamp,
                  }));
                } catch {/* quota */}
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
      if (error instanceof Error && error.name === "AbortError") {
        // User clicked stop — keep partial content, don't show error
      } else {
        const msg = error instanceof Error ? error.message : "Unknown error";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || `Error: ${msg}` }
              : m,
          ),
        );
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);

      // v12.1: Canvas edit round-trip — extract code block from LLM response
      if (isCanvasEditRef.current) {
        isCanvasEditRef.current = false;
        setMessages((prev) => {
          const assistantMsg = prev.find((m) => m.id === assistantId);
          if (assistantMsg?.content) {
            const codeBlockMatch = assistantMsg.content.match(/```[\w]*\n([\s\S]*?)```/);
            if (codeBlockMatch) {
              setCanvasCode(codeBlockMatch[1].trimEnd());
            }
          }
          return prev;
        });
      }
    }
  }, [input, loading, isConfigured, messages, provider, apiKey, model, systemPrompt, activeConvId, pendingAttachments]);

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
            Every response is validated through a full series of control barriers and cached as a TEEP.
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
    <div className={`flex flex-col min-h-0 relative ${canvasOpen ? "w-1/3 border-r border-border max-md:hidden" : "flex-1"}`}>
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
          <select
            value={settings.activeProvider}
            onChange={(e) => handleProviderSwitch(e.target.value)}
            disabled={loading}
            className="text-[11px] font-mono text-muted bg-transparent border-none outline-none cursor-pointer appearance-none pr-3 hover:text-foreground transition-colors disabled:opacity-50"
          >
            {availableProviders.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span className="text-muted/40">/</span>
          <select
            value={settings.activeModel}
            onChange={(e) => handleModelSwitch(e.target.value)}
            disabled={loading}
            className="text-[11px] font-mono text-muted bg-transparent border-none outline-none cursor-pointer appearance-none pr-2 hover:text-foreground transition-colors disabled:opacity-50"
          >
            {providerConfig?.models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
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
            BARRIERS ACTIVE
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
                Every message is validated by a full series of safety barriers before and after reaching your LLM.
                Validated answers are cached for instant future retrieval.
              </p>
              <div className="text-muted/60 text-[10px] font-mono mb-6">
                Ask &ldquo;How does CPUAGEN work?&rdquo; to learn more
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-w-3xl mx-auto max-h-[50vh] overflow-y-auto pr-1">
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
                    className="text-left px-3 py-2.5 rounded-xl border border-border bg-surface/50 hover:bg-surface hover:border-accent/20 text-sm text-muted hover:text-foreground transition-all cursor-pointer"
                  >
                    <div className="font-medium text-[11px] mb-0.5">{ex.label}</div>
                    <div className="text-[10px] text-muted/80 line-clamp-2">{ex.prompt}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((msg) => {
          // v14.0: Hide assistant canvas edit responses (content goes to canvas, not chat)
          if (msg.canvasEdit && msg.role === "assistant") return null;
          // v14.0: Show compact indicator for user canvas edit messages
          if (msg.canvasEdit && msg.role === "user") {
            return (
              <div key={msg.id} className="flex justify-end mb-2 px-4">
                <div className="bg-accent/20 text-accent border border-accent/30 rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5 max-w-[70%]">
                  <span className="opacity-60">🎨</span>
                  <span className="font-medium">Canvas edit:</span>
                  <span className="truncate">{msg.canvasInstruction || "editing..."}</span>
                </div>
              </div>
            );
          }
          return <MessageBubble key={msg.id} message={msg} onOpenCanvas={openCanvas} onOpenPreview={openPreview} onOpenInMarkup={openInMarkup} onAnnotationCommand={handleAnnotationCommand} />;
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4 bg-surface/30 shrink-0">
        {/* Pending attachments */}
        {pendingAttachments.length > 0 && (
          <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-1.5">
            {pendingAttachments.map((att) => (
              <div key={att.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/10 border border-accent/20 text-[10px] font-mono text-accent-light">
                {att.mimeType.startsWith("image/") ? (
                  <img src={att.dataUrl} alt={att.name} className="w-5 h-5 rounded object-cover" />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M7 1H3a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L7 1z" />
                  </svg>
                )}
                <span className="max-w-[100px] truncate">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="text-muted hover:text-danger transition-colors cursor-pointer ml-0.5"
                >
                  {"\u00D7"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className="max-w-3xl mx-auto flex gap-2"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={[...FILE_LIMITS.allowedMimeTypes, ".docx", ".doc", ".xlsx", ".xls", ".pdf", ".md", ".py", ".js", ".ts", ".json", ".csv", ".txt"].join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || pendingAttachments.length >= FILE_LIMITS.maxFilesPerMessage}
            className="px-3 py-3 rounded-xl bg-surface border border-border hover:border-accent/30 text-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
            title="Attach files"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M13.5 7.5l-5.8 5.8a3.2 3.2 0 01-4.5-4.5l5.8-5.8a2.1 2.1 0 013 3L6.2 11.8a1.1 1.1 0 01-1.5-1.5L10 5" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder={pendingAttachments.length > 0 ? "Add a message about the attached files..." : "Message with enforcement..."}
            disabled={loading}
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted/50 text-sm resize-none focus:outline-none focus:border-accent/40 transition-colors disabled:opacity-50"
          />
          <button
            onClick={loading ? abortStream : () => sendMessage()}
            disabled={!loading && !input.trim()}
            className={`px-4 py-3 rounded-xl font-semibold text-sm transition-colors cursor-pointer shrink-0 ${
              loading
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-accent hover:bg-accent-light text-white disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
            title={loading ? "Stop generating" : "Send message"}
          >
            {loading ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 1.5L14.5 8L1.5 14.5V9.5L10 8L1.5 6.5V1.5Z" />
              </svg>
            )}
          </button>
        </div>
        <div className="max-w-3xl mx-auto mt-2 flex items-center justify-between text-[10px] text-muted/70 font-mono">
          <div className="flex items-center gap-2">
            <span>Enter to send {"\u00B7"} Shift+Enter for newline</span>
            <span className="text-border">|</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  setCanvasLang(e.target.value);
                  if (!canvasCode) setCanvasCode(`// ${e.target.value} workspace\n`);
                  setCanvasOpen(true);
                  setActiveTab("canvas");
                  e.target.value = "";
                }
              }}
              value=""
              className="bg-transparent text-accent-light/70 hover:text-accent-light cursor-pointer border-none outline-none text-[10px] font-mono"
              title="Open code canvas with language"
            >
              <option value="">Code</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="rust">Rust</option>
              <option value="go">Go</option>
              <option value="sql">SQL</option>
            </select>
            <button
              onClick={() => { setCanvasOpen(true); setActiveTab("markup"); }}
              className="text-amber-400/70 hover:text-amber-400 cursor-pointer"
              title="Open PDF markup"
            >
              Markup
            </button>
            <button
              onClick={() => { setCanvasOpen(true); setActiveTab("preview"); }}
              className="text-success/70 hover:text-success cursor-pointer"
              title="Open live preview"
            >
              Preview
            </button>
          </div>
          <span>Enforcement: ON {"\u00B7"} all barriers active</span>
        </div>
      </div>
    </div>{/* end chat pane */}

    {/* Canvas + Preview pane */}
    {canvasOpen && (
      <div className="w-2/3 min-h-0 flex flex-col max-md:fixed max-md:inset-0 max-md:w-full max-md:z-30 max-md:bg-background">
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
            <button
              onClick={() => setActiveTab("markup")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "markup"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                  : "text-muted hover:text-foreground hover:bg-surface-light"
              }`}
            >
              Markup
              {markupPdfData && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />}
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
              consoleOutput={consoleOutput}
            />
          ) : activeTab === "preview" ? (
            <Preview code={canvasCode} language={canvasLang} onConsoleOutput={(entry) => setConsoleOutput((prev) => [...prev.slice(-199), entry])} />
          ) : (
            <GreyBeamCanvas
              pdfData={markupPdfData}
              pdfName={markupPdfName}
              annotations={markupAnnotations}
              onAnnotationsChange={setMarkupAnnotations}
            />
          )}
        </div>
      </div>
    )}
    </div>
  );
}
