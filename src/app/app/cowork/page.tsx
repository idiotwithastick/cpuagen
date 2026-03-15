"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getAdminToken } from "@/lib/admin";
import { getCoworkContext } from "@/lib/system-context";
import { migrateSettings, DEFAULT_SETTINGS } from "@/lib/types";
import type { Settings } from "@/lib/types";

interface AgentEnforcement {
  allSafe: boolean;
  barrierCount: number;
  safeCount: number;
  agfHitType?: string;
  timing?: number;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  status: "idle" | "working" | "done" | "error";
  output: string;
  provider: string;
  enforcement?: AgentEnforcement;
}

interface Task {
  id: string;
  description: string;
  assignee: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
}

/** Detect if content contains code blocks — extract first one for preview */
function extractCodeBlock(text: string): { code: string; lang: string } | null {
  const match = text.match(/```(\w*)\n([\s\S]*?)```/);
  if (!match) return null;
  return { lang: match[1] || "text", code: match[2].trim() };
}

/** Check if code is previewable HTML */
function isHtmlPreviewable(code: string, lang: string): boolean {
  const htmlLangs = ["html", "htm", "svg"];
  if (htmlLangs.includes(lang.toLowerCase())) return true;
  const trimmed = code.trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<svg");
}

/** Download text as a file */
function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Guess file extension from language or content */
function guessExtension(lang: string, content: string): string {
  const map: Record<string, string> = {
    html: "html", htm: "html", svg: "svg", css: "css",
    javascript: "js", js: "js", typescript: "ts", ts: "ts",
    tsx: "tsx", jsx: "jsx", python: "py", py: "py",
    rust: "rs", go: "go", java: "java", json: "json",
    yaml: "yaml", yml: "yml", sql: "sql", sh: "sh",
    bash: "sh", markdown: "md", md: "md", text: "txt",
  };
  if (map[lang.toLowerCase()]) return map[lang.toLowerCase()];
  if (content.trim().startsWith("<!doctype") || content.trim().startsWith("<html")) return "html";
  return "txt";
}

export default function CoworkPage() {
  const [agents, setAgents] = useState<Agent[]>([
    { id: "architect", name: "Architect", role: "System design and architecture decisions", status: "idle", output: "", provider: "claude" },
    { id: "coder", name: "Coder", role: "Write implementation code", status: "idle", output: "", provider: "gpt" },
    { id: "reviewer", name: "Reviewer", role: "Code review and quality assurance", status: "idle", output: "", provider: "gemini" },
  ]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewAgent, setPreviewAgent] = useState<string>("");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setAdminToken(getAdminToken());
    try {
      const raw = JSON.parse(localStorage.getItem("cpuagen-settings") || "{}");
      setSettings(migrateSettings(raw));
    } catch { /* use defaults */ }
  }, []);

  const addAgent = () => {
    const id = `agent-${Date.now()}`;
    setAgents((prev) => [
      ...prev,
      { id, name: `Agent ${prev.length + 1}`, role: "General purpose", status: "idle", output: "", provider: "demo" },
    ]);
  };

  const removeAgent = (id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
  };

  const updateAgent = (id: string, updates: Partial<Agent>) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const orchestrate = useCallback(async () => {
    if (!goal.trim()) return;
    setRunning(true);
    setLog([]);
    setTasks([]);
    abortRef.current = new AbortController();

    const addLog = (msg: string) => setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    try {
      addLog("Starting orchestration...");

      // Step 1: Architect decomposes the goal
      const architect = agents.find((a) => a.id === "architect") || agents[0];
      updateAgent(architect.id, { status: "working", output: "" });
      addLog(`${architect.name} is decomposing the goal...`);

      const archRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: getCoworkContext("Architect") + "\n\nDecompose the user's goal into 3-5 concrete tasks. Format each as:\nTASK: <description>\nASSIGN: <Coder|Reviewer|Architect>\n",
            },
            { role: "user", content: goal },
          ],
          provider: settings.activeProvider,
          model: settings.activeModel,
          apiKey: settings.activeProvider !== "demo" ? settings.apiKeys[settings.activeProvider as keyof typeof settings.apiKeys] || "" : "",
          ...(adminToken ? { adminToken } : {}),
        }),
        signal: abortRef.current.signal,
      });

      const reader = archRes.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let archOutput = "";

      if (reader) {
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
                archOutput += parsed.content;
                updateAgent(architect.id, { output: archOutput });
              }
              if (parsed.type === "enforcement") {
                const pre = parsed.pre;
                const post = parsed.post;
                const allSafe = pre?.cbf?.allSafe && (post?.cbf?.allSafe ?? true);
                const preBarriers = pre?.cbf ? Object.keys(pre.cbf).filter((k: string) => k !== "allSafe") : [];
                const preSafe = preBarriers.filter((k: string) => pre.cbf[k]?.safe);
                updateAgent(architect.id, {
                  enforcement: {
                    allSafe,
                    barrierCount: preBarriers.length,
                    safeCount: preSafe.length,
                    agfHitType: parsed.agfHitType,
                    timing: parsed.timing?.total_enforcement_ms,
                  },
                });
              }
            } catch { /* skip */ }
          }
        }
      }

      updateAgent(architect.id, { status: "done" });
      addLog(`${architect.name} completed decomposition`);

      // Parse tasks
      const taskRegex = /TASK:\s*([^\n]+)(?:\nASSIGN:\s*([^\n]+))?/g;
      const taskMatches = archOutput.matchAll(taskRegex);
      const parsedTasks: Task[] = [];
      for (const match of taskMatches) {
        parsedTasks.push({
          id: `task-${parsedTasks.length}`,
          description: match[1].trim(),
          assignee: (match[2]?.trim() || "Coder").toLowerCase(),
          status: "pending",
        });
      }
      setTasks(parsedTasks);
      addLog(`${parsedTasks.length} tasks created`);

      // Step 2: Execute tasks
      for (const task of parsedTasks) {
        const agent = agents.find((a) => a.name.toLowerCase() === task.assignee) || agents[1] || agents[0];
        updateAgent(agent.id, { status: "working" });
        addLog(`${agent.name} working on: ${task.description.slice(0, 60)}...`);

        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: "in_progress" } : t))
        );

        const taskRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: getCoworkContext(agent.role) + "\n\nComplete this task concisely." },
              { role: "user", content: task.description },
            ],
            provider: settings.activeProvider,
            model: settings.activeModel,
            apiKey: settings.activeProvider !== "demo" ? settings.apiKeys[settings.activeProvider as keyof typeof settings.apiKeys] || "" : "",
            ...(adminToken ? { adminToken } : {}),
          }),
          signal: abortRef.current.signal,
        });

        const taskReader = taskRes.body?.getReader();
        let taskBuffer = "";
        let taskOutput = "";

        if (taskReader) {
          while (true) {
            const { done, value } = await taskReader.read();
            if (done) break;
            taskBuffer += decoder.decode(value, { stream: true });
            const tLines = taskBuffer.split("\n");
            taskBuffer = tLines.pop() || "";
            for (const line of tLines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6);
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                if (parsed.type === "delta") {
                  taskOutput += parsed.content;
                  updateAgent(agent.id, { output: taskOutput });
                }
                if (parsed.type === "enforcement") {
                  const pre = parsed.pre;
                  const post = parsed.post;
                  const allSafe = pre?.cbf?.allSafe && (post?.cbf?.allSafe ?? true);
                  const preBarriers = pre?.cbf ? Object.keys(pre.cbf).filter((k: string) => k !== "allSafe") : [];
                  const preSafe = preBarriers.filter((k: string) => pre.cbf[k]?.safe);
                  updateAgent(agent.id, {
                    enforcement: {
                      allSafe,
                      barrierCount: preBarriers.length,
                      safeCount: preSafe.length,
                      agfHitType: parsed.agfHitType,
                      timing: parsed.timing?.total_enforcement_ms,
                    },
                  });
                }
              } catch { /* skip */ }
            }
          }
        }

        updateAgent(agent.id, { status: "done" });
        // Store FULL result — no truncation
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, status: "completed", result: taskOutput } : t
          )
        );
        addLog(`${agent.name} completed task`);
      }

      addLog("All tasks completed!");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        addLog(`Error: ${(e as Error).message}`);
      }
    }
    setRunning(false);
  }, [goal, agents, adminToken]);

  // Download all deliverables as a combined file
  const downloadAllDeliverables = () => {
    const sections: string[] = [];
    sections.push(`# Cowork Deliverables\n# Goal: ${goal}\n# Generated: ${new Date().toISOString()}\n`);

    for (const agent of agents) {
      if (agent.output) {
        sections.push(`\n${"=".repeat(60)}\n# Agent: ${agent.name} (${agent.role})\n${"=".repeat(60)}\n`);
        sections.push(agent.output);
      }
    }

    downloadFile(sections.join("\n"), `cowork-deliverables-${Date.now()}.txt`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Cowork — Multi-Agent Workspace</h1>
            <p className="text-sm text-muted mt-1">
              Multiple AI agents collaborating on tasks — architect, code, review in parallel
            </p>
          </div>
          {agents.some((a) => a.output) && !running && (
            <button
              onClick={downloadAllDeliverables}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition-colors"
            >
              Download All
            </button>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl w-[90vw] max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium">Preview — {previewAgent}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const block = extractCodeBlock(previewContent);
                    if (block) {
                      const ext = guessExtension(block.lang, block.code);
                      downloadFile(block.code, `${previewAgent.toLowerCase().replace(/\s+/g, "-")}-output.${ext}`);
                    } else {
                      downloadFile(previewContent, `${previewAgent.toLowerCase().replace(/\s+/g, "-")}-output.txt`);
                    }
                  }}
                  className="px-3 py-1 rounded text-xs bg-accent/10 text-accent-light hover:bg-accent/20 transition-colors"
                >
                  Download
                </button>
                <button
                  onClick={() => setPreviewContent(null)}
                  className="px-3 py-1 rounded text-xs text-muted hover:text-foreground hover:bg-surface-light transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {(() => {
                const block = extractCodeBlock(previewContent);
                if (block && isHtmlPreviewable(block.code, block.lang)) {
                  return (
                    <iframe
                      srcDoc={block.code}
                      className="w-full h-full border-0 bg-white"
                      sandbox="allow-scripts"
                      title="Preview"
                    />
                  );
                }
                return (
                  <pre className="p-4 text-xs font-mono text-muted whitespace-pre-wrap overflow-y-auto h-full">
                    {previewContent}
                  </pre>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Agents & Goal */}
        <div className="w-72 border-r border-border flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-medium mb-3">Agents</h2>
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="bg-surface rounded-lg p-3 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <input
                      value={agent.name}
                      onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                      className="bg-transparent text-sm font-medium w-24 focus:outline-none"
                    />
                    <span className={`w-2 h-2 rounded-full ${
                      agent.status === "working" ? "bg-warning animate-pulse" :
                      agent.status === "done" ? "bg-success" :
                      agent.status === "error" ? "bg-danger" : "bg-muted"
                    }`} />
                  </div>
                  <input
                    value={agent.role}
                    onChange={(e) => updateAgent(agent.id, { role: e.target.value })}
                    className="bg-transparent text-xs text-muted w-full focus:outline-none"
                  />
                  {agents.length > 1 && (
                    <button
                      onClick={() => removeAgent(agent.id)}
                      className="text-[10px] text-danger mt-1 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addAgent}
              className="w-full mt-2 py-2 text-xs text-muted hover:text-foreground border border-dashed border-border rounded-lg hover:bg-surface-light transition-colors"
            >
              + Add Agent
            </button>
          </div>

          <div className="p-4 flex-1">
            <h2 className="text-sm font-medium mb-2">Goal</h2>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe the project goal... (e.g., 'Build a REST API for a todo app with authentication')"
              rows={5}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none resize-none"
            />
            <button
              onClick={running ? () => abortRef.current?.abort() : orchestrate}
              disabled={!goal.trim() && !running}
              className={`w-full mt-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                running
                  ? "bg-danger/20 text-danger border border-danger/30"
                  : "bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
              }`}
            >
              {running ? "Stop" : "Start Cowork"}
            </button>
          </div>
        </div>

        {/* Right: Output & Tasks */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tasks */}
          {tasks.length > 0 && (
            <div className="p-4 border-b border-border">
              <h2 className="text-sm font-medium mb-2">Tasks</h2>
              <div className="space-y-1">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      task.status === "completed" ? "bg-success" :
                      task.status === "in_progress" ? "bg-warning animate-pulse" :
                      task.status === "failed" ? "bg-danger" : "bg-muted"
                    }`} />
                    <span className="text-foreground flex-1">{task.description.slice(0, 80)}</span>
                    <span className="text-muted">{task.assignee}</span>
                    {task.status === "completed" && task.result && (
                      <button
                        onClick={() => {
                          setPreviewContent(task.result!);
                          setPreviewAgent(`Task: ${task.description.slice(0, 30)}`);
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] text-accent-light hover:bg-accent/10 transition-colors"
                      >
                        View
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent Outputs */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {agents.filter((a) => a.output).map((agent) => (
              <div key={agent.id} className="bg-surface border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${
                    agent.status === "working" ? "bg-warning animate-pulse" :
                    agent.status === "done" ? "bg-success" : "bg-muted"
                  }`} />
                  <h3 className="text-sm font-medium flex-1">{agent.name}</h3>
                  {agent.status === "done" && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setPreviewContent(agent.output);
                          setPreviewAgent(agent.name);
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-mono text-success hover:bg-success/10 transition-colors"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => {
                          const block = extractCodeBlock(agent.output);
                          if (block) {
                            const ext = guessExtension(block.lang, block.code);
                            downloadFile(block.code, `${agent.name.toLowerCase()}-output.${ext}`);
                          } else {
                            downloadFile(agent.output, `${agent.name.toLowerCase()}-output.txt`);
                          }
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-mono text-accent-light hover:bg-accent/10 transition-colors"
                      >
                        Download
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(agent.output);
                          } catch {
                            const ta = document.createElement("textarea");
                            ta.value = agent.output;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand("copy");
                            document.body.removeChild(ta);
                          }
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-mono text-muted hover:text-foreground hover:bg-surface-light transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
                <pre className="text-xs text-muted whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                  {agent.output}
                </pre>
                {agent.enforcement && (
                  <div className={`mt-2 px-2 py-1 rounded text-[9px] font-mono flex items-center gap-2 ${
                    agent.enforcement.allSafe ? "bg-success/5 border border-success/20 text-success" : "bg-danger/5 border border-danger/20 text-danger"
                  }`}>
                    <span>{agent.enforcement.allSafe ? "\u2713" : "\u2717"} CBF {agent.enforcement.safeCount}/{agent.enforcement.barrierCount}</span>
                    {agent.enforcement.agfHitType && (
                      <span className="text-muted">
                        {agent.enforcement.agfHitType === "FULL_HIT" ? "\u26A1 CACHE" : agent.enforcement.agfHitType === "BASIN_HIT" ? "\u26A1 BASIN" : "\uD83E\uDDEA JIT"}
                      </span>
                    )}
                    {agent.enforcement.timing !== undefined && (
                      <span className="text-muted">{agent.enforcement.timing}ms</span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {agents.every((a) => !a.output) && !running && (
              <div className="text-center py-12 text-muted">
                <p className="text-4xl mb-4">{"\uD83E\uDD1D"}</p>
                <p className="text-lg mb-2">Multi-Agent Cowork</p>
                <p className="text-sm">Define agents, set a goal, and watch them collaborate</p>
              </div>
            )}
          </div>

          {/* Log */}
          {log.length > 0 && (
            <div className="border-t border-border p-3 max-h-32 overflow-y-auto">
              <div className="space-y-0.5">
                {log.map((l, i) => (
                  <p key={i} className="text-[10px] text-muted font-mono">{l}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
