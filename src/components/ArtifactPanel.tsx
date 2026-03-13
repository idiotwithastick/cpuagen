"use client";

import { useState, useRef, useCallback } from "react";

/* ─── Types ─── */
interface ArtifactFile {
  id: string;
  name: string;
  language: string;
  content: string;
  previousContent?: string;
}

interface ArtifactPanelProps {
  files: ArtifactFile[];
  activeFileId: string | null;
  onFileSelect: (id: string) => void;
  onFileCreate: (name: string, content: string, language: string) => void;
  onFileUpdate: (id: string, content: string) => void;
  onFileDelete: (id: string) => void;
  onClose: () => void;
  onInlineEdit: (instruction: string, fileContent: string, fileName: string) => void;
  loading?: boolean;
  onStopGeneration?: () => void;
}

/* ─── Language detection ─── */
function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp",
    rb: "ruby", php: "php", swift: "swift", kt: "kotlin", scala: "scala",
    html: "html", css: "css", scss: "scss", json: "json", yaml: "yaml",
    yml: "yaml", toml: "toml", md: "markdown", sql: "sql", sh: "bash",
    bat: "batch", ps1: "powershell", dockerfile: "dockerfile",
    xml: "xml", svg: "svg", txt: "text",
  };
  return map[ext] || "text";
}

/* ─── Previewable check ─── */
function isPreviewable(language: string): boolean {
  return ["html", "svg", "markdown"].includes(language.toLowerCase());
}

/* ─── ArtifactPanel ─── */
export default function ArtifactPanel({
  files,
  activeFileId,
  onFileSelect,
  onFileCreate,
  onFileUpdate,
  onFileDelete,
  onClose,
  onInlineEdit,
  loading = false,
  onStopGeneration,
}: ArtifactPanelProps) {
  const [editInput, setEditInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const activeFile = files.find((f) => f.id === activeFileId) || null;

  /* ─── Actions ─── */
  const handleCopy = useCallback(() => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [activeFile]);

  const handleRevert = useCallback(() => {
    if (!activeFile?.previousContent) return;
    onFileUpdate(activeFile.id, activeFile.previousContent);
  }, [activeFile, onFileUpdate]);

  const handleDownload = useCallback(() => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeFile]);

  const handlePreview = useCallback(() => {
    if (!activeFile) return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    let html = activeFile.content;
    if (activeFile.language === "markdown") {
      // Minimal markdown-to-html: wrap in basic HTML shell
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 24px; color: #e2e8f0; background: #0f172a; }
pre { background: #1e293b; padding: 12px; border-radius: 6px; overflow-x: auto; }
code { font-size: 0.9em; }
a { color: #60a5fa; }
</style></head><body>${activeFile.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body></html>`;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    setPreviewUrl(URL.createObjectURL(blob));
  }, [activeFile, previewUrl]);

  const handleNewFile = useCallback(() => {
    const name = prompt("File name (e.g., utils.ts):");
    if (!name) return;
    const lang = detectLanguage(name);
    onFileCreate(name, "", lang);
  }, [onFileCreate]);

  const handleSendEdit = useCallback(() => {
    const trimmed = editInput.trim();
    if (!trimmed || !activeFile || loading) return;
    setEditInput("");
    onInlineEdit(trimmed, activeFile.content, activeFile.name);
  }, [editInput, activeFile, loading, onInlineEdit]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendEdit();
      }
    },
    [handleSendEdit],
  );

  /* ─── Empty state ─── */
  if (files.length === 0) {
    return (
      <div className="flex flex-col h-full bg-background border-l border-border">
        {/* Header */}
        <div className="h-9 flex items-center justify-between px-3 border-b border-border bg-surface/50 shrink-0">
          <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Artifacts</span>
          <button
            onClick={onClose}
            className="text-xs text-muted hover:text-foreground px-1.5 py-0.5 rounded hover:bg-surface-light cursor-pointer"
            title="Close panel"
          >
            ×
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-[240px]">
            <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-muted">
                <path d="M4 4h8l4 4v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z" />
                <path d="M12 4v4h4" />
              </svg>
            </div>
            <div className="text-xs text-muted leading-relaxed">
              Code artifacts appear here when AI generates code. You can also create files manually.
            </div>
            <button
              onClick={handleNewFile}
              className="mt-4 px-3 py-1.5 rounded text-xs font-mono text-accent-light bg-accent/10 hover:bg-accent/20 border border-accent/30 cursor-pointer"
            >
              + New file
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lineCount = activeFile ? activeFile.content.split("\n").length : 0;

  /* ─── Render ─── */
  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Tab bar */}
      <div className="h-9 flex items-center gap-0.5 px-2 border-b border-border bg-surface/50 overflow-x-auto shrink-0">
        {files.map((f) => (
          <div
            key={f.id}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-t text-xs font-mono cursor-pointer whitespace-nowrap group ${
              f.id === activeFileId
                ? "bg-background text-accent-light border border-border border-b-background -mb-px"
                : "text-muted hover:text-foreground"
            }`}
          >
            <span onClick={() => onFileSelect(f.id)}>{f.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileDelete(f.id);
              }}
              className="text-[10px] text-muted/40 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ml-1"
              title={`Close ${f.name}`}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={handleNewFile}
          className="px-2 py-1 text-xs text-muted hover:text-foreground cursor-pointer"
          title="New file"
        >
          +
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="text-xs text-muted hover:text-foreground px-1.5 py-0.5 rounded hover:bg-surface-light cursor-pointer"
          title="Close panel"
        >
          ×
        </button>
      </div>

      {/* File info bar */}
      {activeFile && (
        <div className="flex items-center justify-between px-3 py-1 bg-surface/30 border-b border-border text-[10px] font-mono text-muted shrink-0">
          <span>
            {activeFile.name} — {activeFile.language}
          </span>
          <span>{lineCount} lines</span>
        </div>
      )}

      {/* Code editor */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeFile ? (
          <textarea
            ref={editorRef}
            value={activeFile.content}
            onChange={(e) => onFileUpdate(activeFile.id, e.target.value)}
            className="w-full h-full bg-background text-foreground font-mono text-xs p-4 resize-none outline-none leading-relaxed"
            spellCheck={false}
            style={{ tabSize: 2 }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted text-xs">
            Select a file to edit
          </div>
        )}
      </div>

      {/* Preview overlay */}
      {previewUrl && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background">
          <div className="h-9 flex items-center justify-between px-3 border-b border-border bg-surface/50 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              <span className="text-[10px] font-mono text-muted">Preview — {activeFile?.name}</span>
            </div>
            <button
              onClick={handlePreview}
              className="text-xs text-muted hover:text-foreground px-2 py-0.5 rounded hover:bg-surface-light cursor-pointer"
            >
              Close Preview
            </button>
          </div>
          <iframe
            src={previewUrl}
            sandbox="allow-scripts"
            className="flex-1 border-0 w-full"
            style={{ backgroundColor: "white" }}
            title="File preview"
          />
        </div>
      )}

      {/* Action bar */}
      {activeFile && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border bg-surface/50 shrink-0">
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 rounded text-[11px] font-mono text-muted hover:text-foreground border border-border hover:border-accent/30 transition-colors cursor-pointer"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={handleRevert}
            disabled={!activeFile.previousContent}
            className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
              activeFile.previousContent
                ? "text-muted hover:text-foreground border-border hover:border-accent/30"
                : "text-muted/30 border-border/50 cursor-not-allowed"
            }`}
          >
            Revert
          </button>
          {isPreviewable(activeFile.language) && (
            <button
              onClick={handlePreview}
              className="px-2.5 py-1 rounded text-[11px] font-mono text-muted hover:text-foreground border border-border hover:border-accent/30 transition-colors cursor-pointer"
            >
              {previewUrl ? "Close Preview" : "Preview"}
            </button>
          )}
          <button
            onClick={handleDownload}
            className="px-2.5 py-1 rounded text-[11px] font-mono text-muted hover:text-foreground border border-border hover:border-accent/30 transition-colors cursor-pointer"
          >
            Download
          </button>
          {loading && onStopGeneration && (
            <button
              onClick={onStopGeneration}
              className="ml-auto px-2.5 py-1 rounded text-[11px] font-mono text-danger/70 hover:text-danger border border-danger/20 hover:border-danger/40 transition-colors cursor-pointer"
            >
              Stop
            </button>
          )}
        </div>
      )}

      {/* Inline edit bar */}
      {activeFile && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-surface/30 shrink-0">
          <span className="text-accent-light font-mono text-xs shrink-0">&gt;</span>
          <input
            ref={editInputRef}
            type="text"
            value={editInput}
            onChange={(e) => setEditInput(e.target.value)}
            onKeyDown={handleEditKeyDown}
            placeholder="Tell AI to edit this code..."
            disabled={loading}
            className="flex-1 bg-transparent text-foreground text-xs font-mono outline-none placeholder:text-muted/50"
          />
          {loading ? (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-accent-light shrink-0">
              <span className="w-1.5 h-1.5 bg-accent-light rounded-full animate-pulse" />
              Editing...
            </span>
          ) : (
            <button
              onClick={handleSendEdit}
              disabled={!editInput.trim()}
              className={`shrink-0 px-3 py-1 rounded text-[11px] font-mono cursor-pointer ${
                editInput.trim()
                  ? "text-accent-light bg-accent/10 hover:bg-accent/20 border border-accent/30"
                  : "text-muted/30 bg-surface border border-border/50"
              }`}
            >
              Send
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type { ArtifactFile, ArtifactPanelProps };
