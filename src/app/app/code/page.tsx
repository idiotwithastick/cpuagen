"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { EnforcementResult, Settings, ApiKeys } from "@/lib/types";
import { PROVIDERS, migrateSettings, DEFAULT_SETTINGS } from "@/lib/types";
import { getCodeContext } from "@/lib/system-context";

/* ─── Types ─── */
interface VirtualFile {
  id: string;
  name: string;
  language: string;
  content: string;
  modified: boolean;
}

interface TerminalEntry {
  id: string;
  type: "user" | "assistant" | "system" | "diff";
  content: string;
  timestamp: number;
  enforcement?: EnforcementResult;
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

/* ─── Diff computation (simple line diff) ─── */
function computeDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const result: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === undefined) {
      result.push(`+ ${newLine}`);
    } else if (newLine === undefined) {
      result.push(`- ${oldLine}`);
    } else if (oldLine !== newLine) {
      result.push(`- ${oldLine}`);
      result.push(`+ ${newLine}`);
    }
  }
  return result.join("\n") || "(no changes)";
}

/* ─── File tree component ─── */
function FileTree({
  files,
  activeFileId,
  onSelect,
  onDelete,
  onNewFile,
}: {
  files: VirtualFile[];
  activeFileId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewFile: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Files</span>
        <button
          onClick={onNewFile}
          className="text-xs text-muted hover:text-foreground px-1.5 py-0.5 rounded hover:bg-surface-light cursor-pointer"
          title="New file"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 && (
          <div className="px-3 py-4 text-[10px] text-muted text-center">
            No files yet.<br />Click + or ask the AI to create one.
          </div>
        )}
        {files.map((f) => (
          <div
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={`flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs font-mono group ${
              f.id === activeFileId
                ? "bg-accent/10 text-accent-light border-l-2 border-accent"
                : "text-muted hover:text-foreground hover:bg-surface-light border-l-2 border-transparent"
            }`}
          >
            <span className="truncate flex items-center gap-1.5">
              <span className="text-[10px] opacity-60">
                {f.language === "typescript" || f.language === "javascript" ? "\u{1F4C4}" :
                 f.language === "python" ? "\u{1F40D}" :
                 f.language === "html" || f.language === "css" ? "\u{1F3A8}" :
                 f.language === "json" || f.language === "yaml" ? "\u2699\uFE0F" : "\u{1F4C3}"}
              </span>
              {f.name}
              {f.modified && <span className="text-accent-light">*</span>}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}
              className="text-[10px] text-danger/50 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Enforcement mini badge ─── */
function EnforcementMini({ enforcement }: { enforcement?: EnforcementResult }) {
  if (!enforcement) return null;
  const allSafe = enforcement.pre.cbf.allSafe && (enforcement.post?.cbf.allSafe ?? true);
  const hitType = enforcement.agfHitType;
  const timing = enforcement.timing;

  return (
    <div className={`inline-flex items-center gap-2 px-2 py-0.5 rounded text-[9px] font-mono ${
      allSafe ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
    }`}>
      <span>{allSafe ? "\u2713" : "\u2717"}</span>
      {hitType && (
        <span>
          {hitType === "FULL_HIT" ? "\u26A1" : hitType === "PARTIAL_HIT" ? "\u{1F50C}" : "\u{1F9EA}"}
        </span>
      )}
      {timing?.total_ms !== undefined && (
        <span className="text-muted">{timing.total_ms}ms</span>
      )}
      {timing?.total_ms !== undefined && timing.total_ms < 2500 && (
        <span className="text-success">{(2500 / Math.max(timing.total_ms, 1)).toFixed(0)}x</span>
      )}
    </div>
  );
}

/* ─── Main CODE page ─── */
export default function CodePage() {
  /* ─── State ─── */
  const [files, setFiles] = useState<VirtualFile[]>([
    {
      id: "main",
      name: "main.py",
      language: "python",
      content: '# Welcome to CPUAGEN Code\n# Ask the AI to generate, refactor, or debug code\n# Every response is validated through the enforcement pipeline\n\ndef hello():\n    print("Hello from CPUAGEN!")\n\nif __name__ == "__main__":\n    hello()\n',
      modified: false,
    },
  ]);
  const [activeFileId, setActiveFileId] = useState<string | null>("main");
  const [terminal, setTerminal] = useState<TerminalEntry[]>([{
    id: "welcome",
    type: "system",
    content: "CPUAGEN Code — Agentic coding with enforcement.\nEvery AI response passes through 8 independent safety barriers.\nType an instruction below to start coding.",
    timestamp: Date.now(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ─── Load settings ─── */
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("cpuagen-settings") || "{}");
      setSettings(migrateSettings(raw));
    } catch { /* use defaults */ }
  }, []);

  /* ─── Auto-scroll terminal ─── */
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminal]);

  /* ─── Active file ─── */
  const activeFile = files.find((f) => f.id === activeFileId) || null;

  /* ─── File operations ─── */
  const updateFileContent = useCallback((fileId: string, content: string) => {
    setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, content, modified: true } : f));
  }, []);

  const createFile = useCallback((name: string, content: string = "") => {
    const id = `file-${Date.now()}`;
    const lang = detectLanguage(name);
    const newFile: VirtualFile = { id, name, language: lang, content, modified: false };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(id);
    return id;
  }, []);

  const deleteFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    if (activeFileId === fileId) {
      setActiveFileId(files.length > 1 ? files.find((f) => f.id !== fileId)?.id || null : null);
    }
  }, [activeFileId, files]);

  const handleNewFile = useCallback(() => {
    const name = prompt("File name (e.g., utils.ts):");
    if (name) createFile(name);
  }, [createFile]);

  /* ─── Extract code blocks from AI response ─── */
  const extractCodeBlocks = useCallback((text: string): { filename: string; content: string; language: string }[] => {
    const blocks: { filename: string; content: string; language: string }[] = [];
    const regex = /```(\w+)?(?:\s+(\S+))?\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const lang = match[1] || "text";
      const filename = match[2] || "";
      const content = match[3] || "";
      blocks.push({ filename, content: content.trimEnd(), language: lang });
    }
    return blocks;
  }, []);

  /* ─── Apply code blocks to files ─── */
  const applyCodeToFiles = useCallback((text: string) => {
    const blocks = extractCodeBlocks(text);
    for (const block of blocks) {
      if (block.filename) {
        // Named file — create or update
        const existing = files.find((f) => f.name === block.filename);
        if (existing) {
          const diff = computeDiff(existing.content, block.content);
          setTerminal((prev) => [...prev, {
            id: `diff-${Date.now()}-${Math.random()}`,
            type: "diff" as const,
            content: `Applied to ${block.filename}:\n${diff}`,
            timestamp: Date.now(),
          }]);
          updateFileContent(existing.id, block.content);
        } else {
          createFile(block.filename, block.content);
          setTerminal((prev) => [...prev, {
            id: `create-${Date.now()}-${Math.random()}`,
            type: "system" as const,
            content: `Created ${block.filename}`,
            timestamp: Date.now(),
          }]);
        }
      } else if (activeFile && blocks.length === 1) {
        // Single unnamed block — apply to active file
        const diff = computeDiff(activeFile.content, block.content);
        setTerminal((prev) => [...prev, {
          id: `diff-${Date.now()}`,
          type: "diff" as const,
          content: `Applied to ${activeFile.name}:\n${diff}`,
          timestamp: Date.now(),
        }]);
        updateFileContent(activeFile.id, block.content);
      }
    }
  }, [files, activeFile, extractCodeBlocks, updateFileContent, createFile]);

  /* ─── Send message to AI ─── */
  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput("");
    setLoading(true);

    // Build context: active file content + instruction
    const fileContext = activeFile
      ? `Current file: ${activeFile.name}\n\`\`\`${activeFile.language}\n${activeFile.content}\n\`\`\`\n\n`
      : "";

    const allFilesContext = files.length > 1
      ? `\nAll files in workspace:\n${files.map((f) => `- ${f.name}`).join("\n")}\n\n`
      : "";

    const fullPrompt = `${fileContext}${allFilesContext}User instruction: ${trimmed}`;

    // Add user entry to terminal
    const userEntry: TerminalEntry = {
      id: `user-${Date.now()}`,
      type: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    setTerminal((prev) => [...prev, userEntry]);

    // Prepare API call
    const provider = settings.activeProvider;
    const model = settings.activeModel;
    const apiKey = provider !== "demo" ? settings.apiKeys[provider as keyof ApiKeys] || "" : "";

    const systemPrompt = `${getCodeContext()}
${settings.systemPrompt ? `\nAdditional instructions: ${settings.systemPrompt}` : ""}`;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: fullPrompt },
          ],
          provider,
          model,
          apiKey,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setTerminal((prev) => [...prev, {
          id: `err-${Date.now()}`,
          type: "system",
          content: `Error: ${res.status} ${res.statusText}`,
          timestamp: Date.now(),
        }]);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let enforcement: EnforcementResult | undefined;
      let buffer = "";

      // Create assistant entry
      const assistantId = `assistant-${Date.now()}`;
      setTerminal((prev) => [...prev, {
        id: assistantId,
        type: "assistant",
        content: "",
        timestamp: Date.now(),
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);

            if (parsed.type === "enforcement" && parsed.stage === "pre") {
              enforcement = {
                pre: { signature: parsed.signature, cbf: parsed.cbf },
              };
              if (parsed.timing) enforcement.timing = parsed.timing;
            } else if (parsed.type === "enforcement" && parsed.stage === "post") {
              if (enforcement) {
                enforcement.post = { signature: parsed.signature, cbf: parsed.cbf, teepId: parsed.teepId };
                if (parsed.timing) {
                  enforcement.timing = { ...enforcement.timing, ...parsed.timing };
                }
                enforcement.agfHitType = parsed.agfHitType || enforcement.agfHitType;
              }
            } else if (parsed.type === "agf") {
              if (enforcement) {
                enforcement.agfHitType = parsed.hitType;
                if (parsed.timing) enforcement.timing = parsed.timing;
              }
              // Cache hit content
              if (parsed.content) {
                fullContent += parsed.content;
                setTerminal((prev) => prev.map((e) =>
                  e.id === assistantId ? { ...e, content: fullContent } : e
                ));
              }
            } else if (parsed.type === "delta" && parsed.content) {
              fullContent += parsed.content;
              setTerminal((prev) => prev.map((e) =>
                e.id === assistantId ? { ...e, content: fullContent } : e
              ));
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Finalize — update enforcement on the assistant entry
      if (enforcement) {
        setTerminal((prev) => prev.map((e) =>
          e.id === assistantId ? { ...e, enforcement } : e
        ));
      }

      // Apply any code blocks to files
      if (fullContent) {
        applyCodeToFiles(fullContent);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setTerminal((prev) => [...prev, {
          id: `err-${Date.now()}`,
          type: "system",
          content: `Error: ${(err as Error).message}`,
          timestamp: Date.now(),
        }]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, activeFile, files, settings, applyCodeToFiles]);

  /* ─── Key handler ─── */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  /* ─── Render ─── */
  return (
    <div className="flex h-full bg-background">
      {/* File Tree Panel */}
      <div className="w-52 shrink-0 border-r border-border bg-surface hidden md:flex flex-col">
        <FileTree
          files={files}
          activeFileId={activeFileId}
          onSelect={setActiveFileId}
          onDelete={deleteFile}
          onNewFile={handleNewFile}
        />
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab Bar */}
        <div className="h-9 flex items-center gap-0.5 px-2 border-b border-border bg-surface/50 overflow-x-auto shrink-0">
          {files.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFileId(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-t text-xs font-mono cursor-pointer whitespace-nowrap ${
                f.id === activeFileId
                  ? "bg-background text-foreground border border-border border-b-background -mb-px"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {f.name}
              {f.modified && <span className="text-accent-light text-[8px]">●</span>}
            </button>
          ))}
          <button
            onClick={handleNewFile}
            className="px-2 py-1 text-xs text-muted hover:text-foreground cursor-pointer"
          >
            +
          </button>
        </div>

        {/* Split: Editor (top) + Terminal (bottom) */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Code Editor */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeFile ? (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-3 py-1 bg-surface/30 border-b border-border text-[10px] font-mono text-muted">
                  <span>{activeFile.name} — {activeFile.language}</span>
                  <span>{activeFile.content.split("\n").length} lines</span>
                </div>
                <textarea
                  value={activeFile.content}
                  onChange={(e) => updateFileContent(activeFile.id, e.target.value)}
                  className="flex-1 w-full bg-background text-foreground font-mono text-sm p-4 resize-none outline-none leading-relaxed"
                  spellCheck={false}
                  style={{ tabSize: 2 }}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted text-sm">
                <div className="text-center">
                  <div className="text-3xl mb-2">{"\u{1F4BB}"}</div>
                  <div>No file open</div>
                  <div className="text-[10px] mt-1">Create a file or ask the AI to generate code</div>
                </div>
              </div>
            )}
          </div>

          {/* Terminal / Output Panel */}
          <div className="h-64 shrink-0 border-t border-border flex flex-col bg-surface/30">
            <div className="flex items-center px-3 py-1 border-b border-border bg-surface/50">
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Terminal</span>
              <span className="ml-auto text-[9px] font-mono text-muted">
                {loading ? "Processing..." : "Ready"}
              </span>
            </div>

            {/* Terminal entries */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs">
              {terminal.map((entry) => (
                <div key={entry.id} className="group">
                  {entry.type === "user" && (
                    <div className="flex gap-2">
                      <span className="text-accent-light shrink-0">{">"}</span>
                      <span className="text-foreground">{entry.content}</span>
                    </div>
                  )}
                  {entry.type === "assistant" && (
                    <div className="pl-2 border-l-2 border-accent/30">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] text-accent-light">AI</span>
                        <EnforcementMini enforcement={entry.enforcement} />
                      </div>
                      <pre className="text-muted whitespace-pre-wrap text-[11px] leading-relaxed">{entry.content || (loading ? "..." : "")}</pre>
                    </div>
                  )}
                  {entry.type === "system" && (
                    <div className="text-muted/60 text-[10px]">{entry.content}</div>
                  )}
                  {entry.type === "diff" && (
                    <pre className="text-[10px] leading-relaxed">
                      {entry.content.split("\n").map((line, i) => (
                        <div key={i} className={
                          line.startsWith("+") ? "text-success" :
                          line.startsWith("-") ? "text-danger" :
                          "text-muted/40"
                        }>
                          {line}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 p-2 border-t border-border bg-surface/50">
              <div className="text-accent-light font-mono text-xs shrink-0 py-1.5">{">"}</div>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeFile ? `Instruction for ${activeFile.name}...` : "Ask the AI to create or edit code..."}
                className="flex-1 bg-transparent text-foreground text-xs font-mono resize-none outline-none min-h-[28px] max-h-24 py-1.5"
                rows={1}
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className={`shrink-0 px-3 py-1.5 rounded text-xs font-mono cursor-pointer ${
                  loading || !input.trim()
                    ? "text-muted/30 bg-surface"
                    : "text-accent-light bg-accent/10 hover:bg-accent/20 border border-accent/30"
                }`}
              >
                {loading ? "..." : "Run"}
              </button>
              {loading && (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="shrink-0 px-2 py-1.5 rounded text-xs font-mono text-danger/70 hover:text-danger cursor-pointer"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
