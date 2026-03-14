"use client";

import { useState, useRef, useCallback } from "react";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: "idle" | "working" | "done" | "error";
  output: string;
  provider: string;
}

interface Task {
  id: string;
  description: string;
  assignee: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
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
  const abortRef = useRef<AbortController | null>(null);

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
              content: "You are an architect agent. Decompose the user's goal into 3-5 concrete tasks. Format each as:\nTASK: <description>\nASSIGN: <Coder|Reviewer|Architect>\n",
            },
            { role: "user", content: goal },
          ],
          provider: "demo",
          model: "gemini-2.0-flash",
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

      // Step 2: Execute tasks (simulate agent delegation)
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
              { role: "system", content: `You are a ${agent.role} agent. Complete this task concisely.` },
              { role: "user", content: task.description },
            ],
            provider: "demo",
            model: "gemini-2.0-flash",
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
              } catch { /* skip */ }
            }
          }
        }

        updateAgent(agent.id, { status: "done" });
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, status: "completed", result: taskOutput.slice(0, 200) } : t
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
  }, [goal, agents]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-semibold">Cowork — Multi-Agent Workspace</h1>
        <p className="text-sm text-muted mt-1">
          Multiple AI agents collaborating on tasks — architect, code, review in parallel
        </p>
      </div>

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
                    <span className="text-foreground">{task.description.slice(0, 80)}</span>
                    <span className="text-muted ml-auto">{task.assignee}</span>
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
                  <h3 className="text-sm font-medium">{agent.name}</h3>
                </div>
                <pre className="text-xs text-muted whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                  {agent.output}
                </pre>
              </div>
            ))}

            {agents.every((a) => !a.output) && !running && (
              <div className="text-center py-12 text-muted">
                <p className="text-4xl mb-4">🤝</p>
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
