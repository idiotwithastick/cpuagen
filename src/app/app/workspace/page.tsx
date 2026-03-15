"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import type { VFSNode } from "@/lib/vfs";
import { writeFile, createFileWithPath, getFileByPath } from "@/lib/vfs";
import { withAdminToken } from "@/lib/admin";
import { getCoreContext } from "@/lib/system-context";
import { migrateSettings, DEFAULT_SETTINGS } from "@/lib/types";
import type { Settings } from "@/lib/types";

interface EnforcementBadge {
  allSafe: boolean;
  barrierCount: number;
  safeCount: number;
  agfHitType?: string;
  timing?: number;
}

const FileTree = dynamic(() => import("@/components/FileTree"), { ssr: false });
const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), { ssr: false });

/** Map VFS language strings to Monaco editor language IDs */
function monacoLang(lang: string): string {
  const map: Record<string, string> = {
    typescript: "typescript", tsx: "typescript", javascript: "javascript", jsx: "javascript",
    python: "python", rust: "rust", go: "go", java: "java",
    html: "html", css: "css", scss: "scss", json: "json",
    yaml: "yaml", toml: "ini", markdown: "markdown", text: "plaintext",
    sql: "sql", bash: "shell", xml: "xml", svg: "xml",
    c: "c", cpp: "cpp", ruby: "ruby", php: "php",
    swift: "swift", kotlin: "kotlin", r: "r", lua: "lua",
    zig: "plaintext", dockerfile: "dockerfile",
  };
  return map[lang] || "plaintext";
}

export default function WorkspacePage() {
  const [activeFile, setActiveFile] = useState<VFSNode | null>(null);
  const [openFiles, setOpenFiles] = useState<VFSNode[]>([]);
  const [code, setCode] = useState("");
  const [lang, setLang] = useState("");
  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "chat">("editor");
  const [chatInput, setChatInput] = useState("");
  const [chatOutput, setChatOutput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [treeRefresh, setTreeRefresh] = useState(0);
  const [modified, setModified] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [enforcement, setEnforcement] = useState<EnforcementBadge | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("cpuagen-settings") || "{}");
      setSettings(migrateSettings(raw));
    } catch { /* use defaults */ }
  }, []);

  // Open a file from the tree
  const handleOpenFile = useCallback((node: VFSNode) => {
    setActiveFile(node);
    setCode(node.content || "");
    setLang(node.language || "text");
    setModified(false);

    // Add to open tabs if not already there
    setOpenFiles((prev) => {
      if (prev.some((f) => f.id === node.id)) return prev;
      return [...prev, node];
    });
  }, []);

  // Save current file
  const handleSave = useCallback(async () => {
    if (!activeFile) return;
    await writeFile(activeFile.id, code);
    setModified(false);
    setTreeRefresh((k) => k + 1);
  }, [activeFile, code]);

  // Handle code changes
  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    setModified(true);
  }, []);

  // Close a tab
  const closeTab = (id: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.id !== id));
    if (activeFile?.id === id) {
      const remaining = openFiles.filter((f) => f.id !== id);
      if (remaining.length > 0) {
        handleOpenFile(remaining[remaining.length - 1]);
      } else {
        setActiveFile(null);
        setCode("");
        setLang("");
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // Chat with AI about workspace files
  const handleChat = async () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    setChatOutput("");
    setEnforcement(null);
    abortRef.current = new AbortController();

    // Build context from open files
    const fileContexts = openFiles.map((f) => `[File: ${f.name}]\n${f.content || "(empty)"}`).join("\n\n---\n\n");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withAdminToken({
          messages: [
            {
              role: "system",
              content: getCoreContext() + `\n\n# WORKSPACE MODE — FILE EDITING INTERFACE\n\nYou are operating in CPUAGEN's Workspace mode with access to the user's virtual file system. Here are the files currently open:\n\n${fileContexts}\n\nWhen the user asks you to create or modify files, output the complete file content in a code block with the filename as a comment on the first line. For example:\n\`\`\`typescript\n// filename: src/utils.ts\nconst foo = "bar";\n\`\`\`\n\nBe precise and output complete, working code.`,
            },
            { role: "user", content: chatInput },
          ],
          provider: settings.activeProvider,
          model: settings.activeModel,
          apiKey: settings.activeProvider !== "demo" ? settings.apiKeys[settings.activeProvider as keyof typeof settings.apiKeys] || "" : "",
        })),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let fullOutput = "";

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
            if (parsed.type === "delta") {
              fullOutput += parsed.content;
              setChatOutput(fullOutput);
            } else if (parsed.type === "enforcement") {
              setEnforcement({
                allSafe: parsed.pre?.cbf?.allSafe ?? true,
                barrierCount: parsed.pre?.cbf?.barrierCount ?? 9,
                safeCount: parsed.pre?.cbf?.safeCount ?? 9,
                agfHitType: parsed.pre?.agf?.hitType,
                timing: parsed.pre?.timing,
              });
            }
          } catch { /* skip */ }
        }
      }

      // Auto-detect file outputs and offer to save them
      const codeBlockRegex = /```(\w+)\n\/\/ filename: (.+)\n([\s\S]*?)```/g;
      let match;
      while ((match = codeBlockRegex.exec(fullOutput)) !== null) {
        const filePath = match[2].trim();
        const fileContent = match[3].trim();
        // Auto-save to VFS
        const existing = await getFileByPath(filePath);
        if (existing) {
          await writeFile(existing.id, fileContent);
          // Refresh if it's the active file
          if (activeFile?.id === existing.id) {
            setCode(fileContent);
            setModified(false);
          }
        } else {
          const newFile = await createFileWithPath(filePath, fileContent);
          handleOpenFile(newFile);
        }
      }

      setTreeRefresh((k) => k + 1);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setChatOutput(`Error: ${(e as Error).message}`);
      }
    }
    setChatLoading(false);
  };

  // Check if current code is previewable
  const isPreviewable = lang === "html" || lang === "htm" || lang === "svg" || lang === "markdown" || lang === "md" ||
    code.trim().startsWith("<!doctype") || code.trim().startsWith("<html") || code.trim().startsWith("<svg");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold">Workspace</h1>
          <p className="text-[10px] text-muted">Virtual file system with AI coding assistant</p>
        </div>
        <div className="flex items-center gap-2">
          {activeFile && modified && (
            <button
              onClick={handleSave}
              className="px-2 py-1 text-[10px] bg-accent/10 text-accent-light border border-accent/20 rounded hover:bg-accent/20"
            >
              Save (Ctrl+S)
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File Tree Sidebar */}
        <div className="w-56 border-r border-border flex-shrink-0 overflow-hidden">
          <FileTree onOpenFile={handleOpenFile} refreshKey={treeRefresh} />
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center border-b border-border bg-surface/30">
            {/* Open file tabs */}
            <div className="flex-1 flex overflow-x-auto">
              {openFiles.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center gap-1 px-3 py-1.5 text-[11px] border-r border-border cursor-pointer select-none ${
                    activeFile?.id === file.id
                      ? "bg-background text-foreground"
                      : "bg-surface/50 text-muted hover:text-foreground"
                  }`}
                  onClick={() => handleOpenFile(file)}
                >
                  <span className="font-mono">{file.name}</span>
                  {activeFile?.id === file.id && modified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(file.id); }}
                    className="ml-1 text-muted hover:text-foreground text-[10px]"
                  >
                    \u2715
                  </button>
                </div>
              ))}
            </div>

            {/* View toggles */}
            <div className="flex items-center gap-0.5 px-2">
              <button
                onClick={() => setActiveTab("editor")}
                className={`px-2 py-1 text-[10px] rounded ${activeTab === "editor" ? "bg-accent/10 text-accent-light" : "text-muted hover:text-foreground"}`}
              >
                Editor
              </button>
              {isPreviewable && (
                <button
                  onClick={() => setActiveTab("preview")}
                  className={`px-2 py-1 text-[10px] rounded ${activeTab === "preview" ? "bg-success/10 text-success" : "text-muted hover:text-foreground"}`}
                >
                  Preview
                </button>
              )}
              <button
                onClick={() => setActiveTab("chat")}
                className={`px-2 py-1 text-[10px] rounded ${activeTab === "chat" ? "bg-accent/10 text-accent-light" : "text-muted hover:text-foreground"}`}
              >
                AI Chat
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "editor" && activeFile ? (
              <MonacoEditor
                height="100%"
                language={monacoLang(lang)}
                value={code}
                onChange={(v) => handleCodeChange(v || "")}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  lineNumbers: "on",
                  renderLineHighlight: "line",
                  padding: { top: 8 },
                  automaticLayout: true,
                }}
              />
            ) : activeTab === "editor" && !activeFile ? (
              <div className="flex items-center justify-center h-full text-muted overflow-y-auto">
                <div className="max-w-lg w-full px-6 py-8">
                  <div className="text-center mb-6">
                    <p className="text-3xl mb-2">{"\u{1F4C1}"}</p>
                    <h2 className="text-lg font-semibold text-foreground mb-1">Welcome to Workspace</h2>
                    <p className="text-xs text-muted">Your virtual coding environment with AI assistance</p>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="bg-surface border border-border rounded-lg p-3">
                      <div className="flex items-start gap-3">
                        <span className="text-base mt-0.5">{"\u{1F4C4}"}</span>
                        <div>
                          <h3 className="text-xs font-semibold text-foreground mb-0.5">1. Create or Open a File</h3>
                          <p className="text-[11px] text-muted leading-relaxed">
                            Use the <strong>file tree on the left</strong> to browse your virtual files. Click the <strong>+</strong> button
                            at the top of the sidebar to create a new file. Give it a name with an extension (like <code className="text-accent-light bg-accent/10 px-1 rounded">notes.md</code> or <code className="text-accent-light bg-accent/10 px-1 rounded">script.py</code>).
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface border border-border rounded-lg p-3">
                      <div className="flex items-start gap-3">
                        <span className="text-base mt-0.5">{"\u270F\uFE0F"}</span>
                        <div>
                          <h3 className="text-xs font-semibold text-foreground mb-0.5">2. Edit with the Code Editor</h3>
                          <p className="text-[11px] text-muted leading-relaxed">
                            Click any file to open it in the <strong>Monaco code editor</strong> (same one used in VS Code).
                            It auto-detects the language from the file extension. Press <kbd className="px-1 py-0.5 text-[10px] bg-surface-light rounded border border-border">Ctrl+S</kbd> to save your changes.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface border border-border rounded-lg p-3">
                      <div className="flex items-start gap-3">
                        <span className="text-base mt-0.5">{"\uD83E\uDD16"}</span>
                        <div>
                          <h3 className="text-xs font-semibold text-foreground mb-0.5">3. Ask AI for Help</h3>
                          <p className="text-[11px] text-muted leading-relaxed">
                            Click the <strong>AI Chat</strong> tab in the top-right corner. The AI can see all your open files and can
                            <strong> create new files</strong> or <strong>modify existing ones</strong> directly. Just describe what you want:
                          </p>
                          <div className="mt-1.5 space-y-1">
                            {[
                              "\"Create a Python script that sorts a CSV file\"",
                              "\"Add error handling to my script.js\"",
                              "\"Explain what this code does\"",
                            ].map((ex) => (
                              <p key={ex} className="text-[10px] text-accent-light/70 font-mono italic">{ex}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface border border-border rounded-lg p-3">
                      <div className="flex items-start gap-3">
                        <span className="text-base mt-0.5">{"\uD83D\uDC41\uFE0F"}</span>
                        <div>
                          <h3 className="text-xs font-semibold text-foreground mb-0.5">4. Preview Your Work</h3>
                          <p className="text-[11px] text-muted leading-relaxed">
                            For HTML and SVG files, a <strong>Preview</strong> tab appears automatically so you can see your page rendered live.
                            Markdown files also get a formatted preview.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 text-center">
                    <p className="text-[11px] text-accent-light/80">
                      {"\uD83D\uDCA1"} <strong>Tip:</strong> Everything stays in your browser. Your files are saved to local storage
                      and persist between sessions. No account or server needed.
                    </p>
                  </div>
                </div>
              </div>
            ) : activeTab === "preview" ? (
              <div className="h-full bg-white">
                {(lang === "markdown" || lang === "md") ? (
                  <div className="p-4 prose prose-sm max-w-none text-gray-800">
                    <pre className="whitespace-pre-wrap text-sm">{code}</pre>
                  </div>
                ) : (
                  <iframe
                    srcDoc={code}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts"
                    title="Preview"
                  />
                )}
              </div>
            ) : (
              /* AI Chat Tab */
              <div className="flex flex-col h-full">
                {/* Chat output */}
                <div className="flex-1 overflow-y-auto p-4">
                  {enforcement && (
                    <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-[10px] font-mono border mb-3 ${enforcement.allSafe ? "border-green-500/20 bg-green-950/20" : "border-red-500/30 bg-red-950/30"}`}>
                      <span className={enforcement.allSafe ? "text-green-400" : "text-red-400"}>
                        {enforcement.allSafe ? "✓" : "✗"} Safety {enforcement.safeCount}/{enforcement.barrierCount}
                      </span>
                      {enforcement.agfHitType && (
                        <span className="text-[#a1a1aa]">
                          {enforcement.agfHitType === "FULL" || enforcement.agfHitType === "BASIN" ? "⚡" : "🧠"}{" "}
                          {enforcement.agfHitType === "FULL" ? "CACHED" : enforcement.agfHitType === "BASIN" ? "NEAR MATCH" : enforcement.agfHitType}
                        </span>
                      )}
                      {enforcement.timing != null && (
                        <span className="text-[#a1a1aa]">{enforcement.timing}ms</span>
                      )}
                    </div>
                  )}
                  {chatOutput ? (
                    <pre className="text-xs font-mono text-muted whitespace-pre-wrap">{chatOutput}</pre>
                  ) : (
                    <div className="text-center py-12 text-muted">
                      <p className="text-sm mb-1">AI Coding Assistant</p>
                      <p className="text-xs">Ask the AI to create, modify, or explain your workspace files</p>
                      <p className="text-[10px] mt-2">The AI can see all open files and write directly to your workspace</p>
                    </div>
                  )}
                </div>
                {/* Chat input */}
                <div className="border-t border-border p-3">
                  <div className="flex gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChat()}
                      placeholder="Ask the AI to create or modify files..."
                      disabled={chatLoading}
                      className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none disabled:opacity-50"
                    />
                    <button
                      onClick={chatLoading ? () => abortRef.current?.abort() : handleChat}
                      disabled={!chatInput.trim() && !chatLoading}
                      className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                        chatLoading
                          ? "bg-danger/20 text-danger border border-danger/30"
                          : "bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
                      }`}
                    >
                      {chatLoading ? "Stop" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
