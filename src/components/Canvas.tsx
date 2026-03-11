"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

/* ─── Types ─── */
interface CanvasProps {
  code: string;
  language: string;
  onClose: () => void;
  onSendToChat: (instruction: string, code: string) => void;
  onCodeChange?: (code: string) => void;
  consoleOutput?: ConsoleEntry[];
}

export interface ConsoleEntry {
  type: "log" | "error" | "warn" | "info";
  args: string;
  timestamp: number;
}

interface VersionSnapshot {
  code: string;
  timestamp: number;
  label: string;
}

/* ─── Syntax Highlighting ─── */
const KEYWORDS_JS = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|void|delete|null|undefined|true|false|NaN|Infinity)\b/g;
const KEYWORDS_PY = /\b(def|class|return|if|elif|else|for|while|break|continue|import|from|as|try|except|finally|raise|with|yield|lambda|pass|del|global|nonlocal|assert|True|False|None|and|or|not|in|is)\b/g;
const KEYWORDS_HTML = /\b(html|head|body|div|span|p|a|img|ul|ol|li|h[1-6]|table|tr|td|th|form|input|button|select|option|textarea|script|style|link|meta|title|header|footer|nav|main|section|article|aside)\b/g;
const KEYWORDS_CSS = /\b(color|background|margin|padding|border|display|flex|grid|position|width|height|font|text|align|justify|overflow|opacity|transition|transform|animation|z-index|box-shadow|cursor|content)\b/g;

function highlightCode(code: string, lang: string): string {
  // Escape HTML entities
  let html = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const isJS = /^(javascript|js|jsx|typescript|ts|tsx)$/i.test(lang);
  const isPy = /^(python|py)$/i.test(lang);
  const isHTML = /^(html|htm|xml|svg)$/i.test(lang);
  const isCSS = /^(css|scss|less)$/i.test(lang);

  // Strings (single, double, template)
  html = html.replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, '<span class="hl-string">$&</span>');

  // Comments
  html = html.replace(/(\/\/.*$)/gm, '<span class="hl-comment">$&</span>');
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$&</span>');
  html = html.replace(/(#(?![0-9a-fA-F]{3,8}\b).*$)/gm, (match) => {
    if (isPy || isCSS) return `<span class="hl-comment">${match}</span>`;
    return match;
  });

  // Numbers
  html = html.replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/g, '<span class="hl-number">$&</span>');

  // Keywords
  if (isJS) html = html.replace(KEYWORDS_JS, '<span class="hl-keyword">$&</span>');
  if (isPy) html = html.replace(KEYWORDS_PY, '<span class="hl-keyword">$&</span>');

  // HTML tags
  if (isHTML) {
    html = html.replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="hl-tag">$2</span>');
    html = html.replace(/\b([\w-]+)(=)/g, '<span class="hl-attr">$1</span>$2');
  }

  // CSS properties
  if (isCSS) {
    html = html.replace(KEYWORDS_CSS, '<span class="hl-keyword">$&</span>');
    html = html.replace(/(\.[\w-]+)/g, '<span class="hl-tag">$1</span>');
  }

  // Function calls
  html = html.replace(/\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, '<span class="hl-func">$&</span>');

  return html;
}

/* ─── Diff computation ─── */
function computeDiff(oldCode: string, newCode: string): { type: "same" | "add" | "remove"; text: string }[] {
  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");
  const result: { type: "same" | "add" | "remove"; text: string }[] = [];

  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: "same", text: oldLines[oi] });
      oi++; ni++;
    } else if (ni < newLines.length && (oi >= oldLines.length || !oldLines.slice(oi).includes(newLines[ni]))) {
      result.push({ type: "add", text: newLines[ni] });
      ni++;
    } else if (oi < oldLines.length && (ni >= newLines.length || !newLines.slice(ni).includes(oldLines[oi]))) {
      result.push({ type: "remove", text: oldLines[oi] });
      oi++;
    } else {
      // Context mismatch — treat as remove old + add new
      result.push({ type: "remove", text: oldLines[oi] });
      oi++;
    }
  }
  return result;
}

/* ─── Auto-close pairs ─── */
const CLOSE_PAIRS: Record<string, string> = {
  "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`", "<": ">",
};

/* ─── Canvas Component ─── */
export default function Canvas({ code, language, onClose, onSendToChat, onCodeChange, consoleOutput = [] }: CanvasProps) {
  const [editedCode, setEditedCode] = useState(code);
  const [instruction, setInstruction] = useState("");
  const [copied, setCopied] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findCount, setFindCount] = useState(0);
  const [showConsole, setShowConsole] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [showMinimap, setShowMinimap] = useState(true);
  const [activePanel, setActivePanel] = useState<"editor" | "console" | "history">("editor");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  const lineCount = useMemo(() => editedCode.split("\n").length, [editedCode]);

  // Sync external code changes + snapshot for version history
  useEffect(() => {
    if (code !== editedCode) {
      // Snapshot the current state before overwriting
      if (editedCode.trim()) {
        setVersions((prev) => [
          ...prev.slice(-19), // keep last 20
          { code: editedCode, timestamp: Date.now(), label: `v${prev.length + 1} (before AI edit)` },
        ]);
      }
      setEditedCode(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Highlighted HTML
  const highlightedHtml = useMemo(() => highlightCode(editedCode, language), [editedCode, language]);

  // Find matches count
  useEffect(() => {
    if (!findText) { setFindCount(0); return; }
    try {
      const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = editedCode.match(regex);
      setFindCount(matches?.length ?? 0);
    } catch { setFindCount(0); }
  }, [findText, editedCode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowFind(true);
        setActivePanel("editor");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        setShowFind(true);
        setActivePanel("editor");
      }
      if (e.key === "Escape" && showFind) {
        setShowFind(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showFind]);

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
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const updateCode = useCallback((newCode: string) => {
    setEditedCode(newCode);
    onCodeChange?.(newCode);
  }, [onCodeChange]);

  const handleSend = () => {
    if (!instruction.trim()) return;
    // Snapshot before AI edit
    setVersions((prev) => [
      ...prev.slice(-19),
      { code: editedCode, timestamp: Date.now(), label: `v${prev.length + 1} (before instruction)` },
    ]);
    onSendToChat(instruction.trim(), editedCode);
    setInstruction("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Advanced editor keydown (textarea)
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = editedCode;

    // Tab / Shift+Tab indent/dedent
    if (e.key === "Tab") {
      e.preventDefault();
      if (start !== end) {
        // Multi-line indent/dedent
        const beforeSel = val.substring(0, start);
        const sel = val.substring(start, end);
        const afterSel = val.substring(end);
        const lineStart = beforeSel.lastIndexOf("\n") + 1;
        const fullSel = val.substring(lineStart, end);
        const lines = fullSel.split("\n");

        if (e.shiftKey) {
          // Dedent
          const dedented = lines.map((l) => l.replace(/^ {1,2}/, "")).join("\n");
          const newVal = val.substring(0, lineStart) + dedented + afterSel;
          updateCode(newVal);
          requestAnimationFrame(() => {
            ta.selectionStart = lineStart;
            ta.selectionEnd = lineStart + dedented.length;
          });
        } else {
          // Indent
          const indented = lines.map((l) => "  " + l).join("\n");
          const newVal = val.substring(0, lineStart) + indented + afterSel;
          updateCode(newVal);
          requestAnimationFrame(() => {
            ta.selectionStart = lineStart;
            ta.selectionEnd = lineStart + indented.length;
          });
        }
      } else {
        if (e.shiftKey) {
          // Dedent current line
          const lineStart = val.lastIndexOf("\n", start - 1) + 1;
          const line = val.substring(lineStart, val.indexOf("\n", start) === -1 ? val.length : val.indexOf("\n", start));
          const dedented = line.replace(/^ {1,2}/, "");
          const diff = line.length - dedented.length;
          const newVal = val.substring(0, lineStart) + dedented + val.substring(lineStart + line.length);
          updateCode(newVal);
          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = Math.max(lineStart, start - diff); });
        } else {
          const newVal = val.substring(0, start) + "  " + val.substring(end);
          updateCode(newVal);
          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
        }
      }
      return;
    }

    // Auto-close brackets/quotes
    if (CLOSE_PAIRS[e.key]) {
      const closing = CLOSE_PAIRS[e.key];
      // Don't auto-close if it's a quote and we're inside a word
      if ((e.key === '"' || e.key === "'" || e.key === "`") && start > 0 && /\w/.test(val[start - 1])) return;
      // Don't auto-close < unless in HTML
      if (e.key === "<" && !/^(html|htm|xml|svg|jsx|tsx)$/i.test(language)) return;

      e.preventDefault();
      const newVal = val.substring(0, start) + e.key + closing + val.substring(end);
      updateCode(newVal);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
      return;
    }

    // Enter: auto-indent
    if (e.key === "Enter") {
      e.preventDefault();
      const lineStart = val.lastIndexOf("\n", start - 1) + 1;
      const currentLine = val.substring(lineStart, start);
      const indent = currentLine.match(/^(\s*)/)?.[1] || "";
      const prevChar = val[start - 1];
      const nextChar = val[start];

      // Extra indent after { [ (
      let extra = "";
      if (prevChar === "{" || prevChar === "[" || prevChar === "(") {
        extra = "  ";
        // If matching close bracket is next char, put it on new line
        if ((prevChar === "{" && nextChar === "}") || (prevChar === "[" && nextChar === "]") || (prevChar === "(" && nextChar === ")")) {
          const newVal = val.substring(0, start) + "\n" + indent + extra + "\n" + indent + val.substring(start);
          updateCode(newVal);
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = start + 1 + indent.length + extra.length;
          });
          return;
        }
      }

      const newVal = val.substring(0, start) + "\n" + indent + extra + val.substring(end);
      updateCode(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 1 + indent.length + extra.length;
      });
    }
  };

  // Find & Replace
  const handleFindNext = () => {
    if (!findText || !textareaRef.current) return;
    const ta = textareaRef.current;
    const idx = editedCode.toLowerCase().indexOf(findText.toLowerCase(), ta.selectionEnd);
    if (idx >= 0) {
      ta.focus();
      ta.selectionStart = idx;
      ta.selectionEnd = idx + findText.length;
    }
  };

  const handleReplace = () => {
    if (!findText || !textareaRef.current) return;
    const ta = textareaRef.current;
    const selText = editedCode.substring(ta.selectionStart, ta.selectionEnd);
    if (selText.toLowerCase() === findText.toLowerCase()) {
      const newCode = editedCode.substring(0, ta.selectionStart) + replaceText + editedCode.substring(ta.selectionEnd);
      updateCode(newCode);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionStart;
        ta.selectionEnd = ta.selectionStart + replaceText.length;
      });
    }
    handleFindNext();
  };

  const handleReplaceAll = () => {
    if (!findText) return;
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    updateCode(editedCode.replace(regex, replaceText));
  };

  // Restore version
  const restoreVersion = (v: VersionSnapshot) => {
    setVersions((prev) => [
      ...prev.slice(-19),
      { code: editedCode, timestamp: Date.now(), label: `v${prev.length + 1} (before restore)` },
    ]);
    updateCode(v.code);
    setShowDiff(false);
    setSelectedVersion(null);
    setActivePanel("editor");
  };

  // Diff view
  const diffLines = useMemo(() => {
    if (selectedVersion === null || !versions[selectedVersion]) return [];
    return computeDiff(versions[selectedVersion].code, editedCode);
  }, [selectedVersion, versions, editedCode]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Highlight styles */}
      <style>{`
        .hl-keyword { color: #c792ea; font-weight: 500; }
        .hl-string { color: #c3e88d; }
        .hl-comment { color: #546e7a; font-style: italic; }
        .hl-number { color: #f78c6c; }
        .hl-func { color: #82aaff; }
        .hl-tag { color: #f07178; }
        .hl-attr { color: #ffcb6b; }
        .editor-overlay { pointer-events: none; position: absolute; inset: 0; }
        .minimap { width: 60px; font-size: 1.2px; line-height: 1.5px; overflow: hidden; opacity: 0.5; }
        .minimap:hover { opacity: 0.8; }
      `}</style>

      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border bg-surface/30 shrink-0">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent-light">
            <path d="M5 2L2 8l3 6M11 2l3 6-3 6M9 3L7 13" />
          </svg>
          <span className="text-[10px] font-mono text-muted">
            {language || "code"} {"\u00B7"} {lineCount} lines
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Bottom panel toggles */}
          <button
            onClick={() => { setActivePanel("console"); setShowConsole(!showConsole || activePanel !== "console"); }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
              showConsole && activePanel === "console" ? "bg-accent/15 text-accent-light" : "text-muted hover:text-foreground"
            }`}
            title="Console (logs from Preview)"
          >
            Console{consoleOutput.length > 0 && <span className="ml-1 text-warning">{consoleOutput.length}</span>}
          </button>
          <button
            onClick={() => { setActivePanel("history"); setShowDiff(!showDiff || activePanel !== "history"); }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
              showDiff && activePanel === "history" ? "bg-accent/15 text-accent-light" : "text-muted hover:text-foreground"
            }`}
            title="Version History"
          >
            History{versions.length > 0 && <span className="ml-1 text-muted/60">{versions.length}</span>}
          </button>
          <span className="mx-0.5 text-border">|</span>
          <button
            onClick={() => setShowMinimap(!showMinimap)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${showMinimap ? "text-accent-light" : "text-muted hover:text-foreground"}`}
            title="Minimap"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="0" y="0" width="3" height="10" rx="0.5" opacity="0.6"/><rect x="4" y="1" width="6" height="1.5" rx="0.3"/><rect x="4" y="4" width="5" height="1.5" rx="0.3"/><rect x="4" y="7" width="4" height="1.5" rx="0.3"/></svg>
          </button>
          <button onClick={handleCopy} className="px-2 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground transition-colors cursor-pointer">
            {copied ? "\u2713" : "Copy"}
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
            className="px-2 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>

      {/* Find & Replace bar */}
      {showFind && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-border shrink-0">
          <input
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleFindNext(); if (e.key === "Escape") setShowFind(false); }}
            placeholder="Find..."
            autoFocus
            className="px-2 py-1 rounded bg-background border border-border text-foreground text-xs font-mono w-36 focus:outline-none focus:border-accent/40"
          />
          <input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleReplace(); }}
            placeholder="Replace..."
            className="px-2 py-1 rounded bg-background border border-border text-foreground text-xs font-mono w-36 focus:outline-none focus:border-accent/40"
          />
          <span className="text-[10px] font-mono text-muted">{findCount} found</span>
          <button onClick={handleFindNext} className="px-2 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground border border-border hover:border-accent/30 transition-colors cursor-pointer">Next</button>
          <button onClick={handleReplace} className="px-2 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground border border-border hover:border-accent/30 transition-colors cursor-pointer">Replace</button>
          <button onClick={handleReplaceAll} className="px-2 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground border border-border hover:border-accent/30 transition-colors cursor-pointer">All</button>
          <button onClick={() => setShowFind(false)} className="ml-auto p-0.5 text-muted hover:text-foreground cursor-pointer">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          </button>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 flex min-h-0">
        {/* Main editor */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Line numbers */}
          <div
            ref={lineNumRef}
            className="w-10 bg-[#08081a] text-muted/30 text-[11px] font-mono text-right pr-2 pt-3 pb-3 overflow-hidden select-none shrink-0 leading-[1.55]"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Code editor with syntax highlight overlay */}
          <div className="flex-1 relative overflow-hidden">
            {/* Highlighted code (behind) */}
            <pre
              ref={highlightRef}
              className="editor-overlay p-3 text-[11px] font-mono leading-[1.55] overflow-hidden whitespace-pre"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: highlightedHtml + "\n" }}
            />
            {/* Transparent textarea (in front) */}
            <textarea
              ref={textareaRef}
              value={editedCode}
              onChange={(e) => updateCode(e.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleEditorKeyDown}
              spellCheck={false}
              className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-foreground text-[11px] font-mono p-3 resize-none outline-none leading-[1.55] overflow-auto"
              style={{ caretColor: "var(--foreground, #e0e0e0)" }}
            />
          </div>
        </div>

        {/* Minimap */}
        {showMinimap && lineCount > 20 && (
          <div className="w-[60px] bg-[#08081a] border-l border-border overflow-hidden shrink-0 relative cursor-pointer"
            onClick={(e) => {
              if (!textareaRef.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientY - rect.top) / rect.height;
              textareaRef.current.scrollTop = ratio * textareaRef.current.scrollHeight;
            }}
          >
            <pre
              className="p-1 text-[1.3px] leading-[1.8px] font-mono text-foreground/40 overflow-hidden whitespace-pre select-none"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </div>
        )}
      </div>

      {/* Bottom panels */}
      {((showConsole && activePanel === "console") || (showDiff && activePanel === "history")) && (
        <div className="h-48 border-t border-border bg-[#08081a] flex flex-col shrink-0">
          {/* Console panel */}
          {activePanel === "console" && (
            <>
              <div className="flex items-center justify-between px-3 py-1 border-b border-border/50 shrink-0">
                <span className="text-[10px] font-mono text-muted">Console Output</span>
                <span className="text-[10px] font-mono text-muted/50">{consoleOutput.length} entries</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px]">
                {consoleOutput.length === 0 ? (
                  <div className="text-muted/40 text-center py-4">
                    Console output from Preview will appear here
                  </div>
                ) : (
                  consoleOutput.map((entry, i) => (
                    <div key={i} className={`py-0.5 px-1 rounded ${
                      entry.type === "error" ? "text-danger bg-danger/5" :
                      entry.type === "warn" ? "text-warning bg-warning/5" :
                      "text-foreground/80"
                    }`}>
                      <span className="text-muted/40 mr-2">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      <span className={`mr-1 ${
                        entry.type === "error" ? "text-danger" :
                        entry.type === "warn" ? "text-warning" :
                        entry.type === "info" ? "text-accent-light" : ""
                      }`}>[{entry.type}]</span>
                      {entry.args}
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* History / Diff panel */}
          {activePanel === "history" && (
            <>
              <div className="flex items-center justify-between px-3 py-1 border-b border-border/50 shrink-0">
                <span className="text-[10px] font-mono text-muted">Version History</span>
                <span className="text-[10px] font-mono text-muted/50">{versions.length} snapshots</span>
              </div>
              <div className="flex-1 flex min-h-0">
                {/* Version list */}
                <div className="w-48 border-r border-border/50 overflow-y-auto p-1 shrink-0">
                  {versions.length === 0 ? (
                    <div className="text-muted/40 text-[10px] text-center py-4">
                      Versions saved on AI edits
                    </div>
                  ) : (
                    versions.map((v, i) => (
                      <button
                        key={i}
                        onClick={() => { setSelectedVersion(i); setShowDiff(true); }}
                        className={`w-full text-left px-2 py-1.5 rounded text-[10px] font-mono transition-colors cursor-pointer mb-0.5 ${
                          selectedVersion === i ? "bg-accent/15 text-accent-light" : "text-muted hover:text-foreground hover:bg-surface/30"
                        }`}
                      >
                        <div className="truncate">{v.label}</div>
                        <div className="text-muted/50">{new Date(v.timestamp).toLocaleTimeString()}</div>
                      </button>
                    ))
                  )}
                </div>

                {/* Diff view */}
                <div className="flex-1 overflow-auto p-2 font-mono text-[10px]">
                  {selectedVersion !== null && diffLines.length > 0 ? (
                    <>
                      <div className="mb-2 flex items-center gap-2">
                        <button
                          onClick={() => restoreVersion(versions[selectedVersion])}
                          className="px-2 py-0.5 rounded text-[10px] font-mono text-warning border border-warning/30 hover:bg-warning/10 transition-colors cursor-pointer"
                        >
                          Restore this version
                        </button>
                      </div>
                      {diffLines.map((line, i) => (
                        <div key={i} className={`px-1 ${
                          line.type === "add" ? "bg-success/10 text-success" :
                          line.type === "remove" ? "bg-danger/10 text-danger line-through" :
                          "text-muted/60"
                        }`}>
                          <span className="inline-block w-4 text-center">{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}</span>
                          {line.text || "\u00A0"}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="text-muted/40 text-center py-4">
                      Select a version to see diff
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Instruction input */}
      <div className="border-t border-border p-2.5 bg-surface/30 shrink-0">
        <div className="flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI to modify this code..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted/40 text-xs focus:outline-none focus:border-accent/40 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!instruction.trim()}
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-light text-white font-medium text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            Update
          </button>
        </div>
        <div className="mt-1 text-[9px] text-muted/50 font-mono flex items-center gap-2">
          <span>Enter {"\u2192"} send</span>
          <span>{"\u00B7"}</span>
          <span>Tab {"\u2192"} indent</span>
          <span>{"\u00B7"}</span>
          <span>Ctrl+F {"\u2192"} find</span>
          <span>{"\u00B7"}</span>
          <span>Auto-close brackets</span>
          <span>{"\u00B7"}</span>
          <span>{lineCount} lines</span>
        </div>
      </div>
    </div>
  );
}
