"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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

interface AutomationStep {
  id: string;
  action: string;
  target: string;
  value?: string;
  status: "pending" | "running" | "done" | "error";
  result?: string;
}

interface Recording {
  id: string;
  name: string;
  url: string;
  prompt: string;
  steps: AutomationStep[];
  created_at: number;
  lastRun?: number;
  runCount: number;
}

interface ExecutionLog {
  stepIndex: number;
  status: "running" | "done" | "error";
  result: string;
  elapsed_ms: number;
}

const TEMPLATES = [
  { label: "Scrape prices", prompt: "Navigate to the page, find all product prices, and extract them into a table with product name and price", icon: "\uD83D\uDCB0" },
  { label: "Fill a form", prompt: "Fill out the form on the page with the provided details, verify each field, and submit", icon: "\uD83D\uDCDD" },
  { label: "Extract data", prompt: "Extract all text content, links, and structured data from the page into JSON format", icon: "\uD83D\uDCCA" },
  { label: "Screenshot flow", prompt: "Navigate through the main pages and take a screenshot of each for documentation", icon: "\uD83D\uDCF8" },
  { label: "Monitor changes", prompt: "Check the page content, compare with previous version, and report any changes found", icon: "\uD83D\uDD0D" },
  { label: "Login + action", prompt: "Log into the site, navigate to the dashboard, and export the most recent report", icon: "\uD83D\uDD10" },
];

const STORAGE_KEY = "cpuagen-automations";

export default function AutomatePage() {
  const [url, setUrl] = useState("https://");
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [tab, setTab] = useState<"natural" | "execute" | "saved">("natural");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [enforcement, setEnforcement] = useState<EnforcementBadge | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load settings + saved recordings from localStorage
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("cpuagen-settings") || "{}");
      setSettings(migrateSettings(raw));
    } catch { /* use defaults */ }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) setRecordings(saved);
    } catch { /* ignore */ }
  }, []);

  // Persist recordings to localStorage
  const persistRecordings = useCallback((recs: Recording[]) => {
    setRecordings(recs);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(recs)); } catch { /* ignore */ }
  }, []);

  const runAutomation = useCallback(async () => {
    if (!prompt.trim()) return;
    setRunning(true);
    setOutput("");
    setEnforcement(null);
    setSteps([]);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withAdminToken({
          messages: [
            {
              role: "system",
              content: getCoreContext() + `\n\n# AUTOMATE MODE — BROWSER AUTOMATION INTERFACE\n\nYou are operating in CPUAGEN's Automate mode — a browser automation planning environment. The user wants you to automate web tasks.\nDescribe step-by-step what you would do, including:\n- Navigation: go to URL\n- Click: click element with selector\n- Type: type text into input\n- Wait: wait for element/condition\n- Extract: get text/data from page\n- Screenshot: capture the page\n- Fetch: retrieve data from an API\n- Assert: verify a condition is true\n\nFormat each step as: [ACTION] target — detail\nExample: [NAVIGATE] https://example.com — open the page\n[CLICK] button.submit — click the submit button\n[TYPE] input#search — "search query"\n[FETCH] /api/data — GET request for JSON data\n[ASSERT] .result-count — contains at least 1 result`,
            },
            { role: "user", content: `URL: ${url}\n\nTask: ${prompt}` },
          ],
          provider: settings.activeProvider,
          model: settings.activeModel,
          apiKey: settings.activeProvider !== "demo" ? settings.apiKeys[settings.activeProvider as keyof typeof settings.apiKeys] || "" : "",
        })),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result = "";

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
                result += parsed.content;
                setOutput(result);
              } else if (parsed.type === "enforcement") {
                const e = parsed;
                setEnforcement({
                  allSafe: e.pre?.cbf?.allSafe ?? true,
                  barrierCount: e.pre?.cbf?.barrierCount ?? 9,
                  safeCount: e.pre?.cbf?.safeCount ?? 9,
                  agfHitType: e.pre?.agf?.hitType,
                  timing: e.pre?.timing,
                });
              }
            } catch { /* skip */ }
          }
        }
      }

      // Parse steps from result
      const stepMatches = result.matchAll(/\[(\w+)]\s*([^\n\u2014]+)(?:\s*\u2014\s*(.+))?/g);
      const parsed: AutomationStep[] = [];
      for (const match of stepMatches) {
        parsed.push({
          id: `step-${parsed.length}`,
          action: match[1],
          target: match[2].trim(),
          value: match[3]?.trim(),
          status: "pending",
        });
      }
      if (parsed.length > 0) setSteps(parsed);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setOutput("Error: " + (e as Error).message);
      }
    }
    setRunning(false);
  }, [prompt, url, settings]);

  // Execute parsed steps via Agent Loop
  const executeSteps = useCallback(async () => {
    if (steps.length === 0 || executing) return;
    setExecuting(true);
    setExecutionLogs([]);
    setTab("execute");
    abortRef.current = new AbortController();

    // Build a task description from the steps
    const stepsDesc = steps.map((s, i) =>
      `Step ${i + 1}: [${s.action}] ${s.target}${s.value ? ` — ${s.value}` : ""}`
    ).join("\n");

    const agentQuery = `Execute the following automation plan. For each step, use the appropriate tool (fetch_url for NAVIGATE/FETCH, code_execute for data processing, web_search for lookups). Report the result of each step.\n\nTarget URL: ${url}\n\n${stepsDesc}`;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withAdminToken({
          query: agentQuery,
          provider: settings.activeProvider,
          model: settings.activeModel,
          apiKey: settings.activeProvider !== "demo" ? settings.apiKeys[settings.activeProvider as keyof typeof settings.apiKeys] || "" : "",
          maxIterations: Math.max(steps.length + 2, 10),
        })),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) { setExecuting(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let stepIdx = 0;
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
            if (parsed.type === "agent_step") {
              // Map agent steps to our execution log
              if (parsed.phase === "EXECUTE" && parsed.toolResults) {
                for (const tr of parsed.toolResults) {
                  const log: ExecutionLog = {
                    stepIndex: Math.min(stepIdx, steps.length - 1),
                    status: tr.error ? "error" : "done",
                    result: tr.content || "",
                    elapsed_ms: parsed.elapsed_ms || 0,
                  };
                  setExecutionLogs(prev => [...prev, log]);
                  setSteps(prev => prev.map((s, i) =>
                    i === stepIdx ? { ...s, status: tr.error ? "error" : "done", result: tr.content?.slice(0, 200) } : s
                  ));
                  stepIdx++;
                }
              } else if (parsed.phase === "PLAN" && stepIdx < steps.length) {
                // Mark current step as running
                setSteps(prev => prev.map((s, i) =>
                  i === stepIdx ? { ...s, status: "running" } : s
                ));
              }
            } else if (parsed.type === "delta") {
              fullOutput += parsed.content;
              setOutput(fullOutput);
            } else if (parsed.type === "agent_complete") {
              // Mark remaining steps done
              setSteps(prev => prev.map(s =>
                s.status === "pending" || s.status === "running" ? { ...s, status: "done" } : s
              ));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setOutput("Execution error: " + (e as Error).message);
      }
    }
    setExecuting(false);
  }, [steps, executing, url, settings]);

  const saveRecording = () => {
    if (steps.length === 0) return;
    const rec: Recording = {
      id: `rec-${Date.now()}`,
      name: prompt.slice(0, 50) || "Untitled",
      url,
      prompt,
      steps: steps.map(s => ({ ...s, status: "pending", result: undefined })),
      created_at: Date.now(),
      runCount: 0,
    };
    persistRecordings([rec, ...recordings]);
  };

  const deleteRecording = (id: string) => {
    persistRecordings(recordings.filter(r => r.id !== id));
  };

  const loadRecording = (rec: Recording) => {
    setUrl(rec.url || "https://");
    setPrompt(rec.prompt || rec.name);
    setSteps(rec.steps.map(s => ({ ...s, status: "pending", result: undefined })));
    setOutput("");
    setExecutionLogs([]);
    setTab("natural");
  };

  const rerunRecording = (rec: Recording) => {
    setUrl(rec.url || "https://");
    setPrompt(rec.prompt || rec.name);
    setSteps(rec.steps.map(s => ({ ...s, status: "pending", result: undefined })));
    setOutput("");
    setExecutionLogs([]);
    // Update run count
    persistRecordings(recordings.map(r =>
      r.id === rec.id ? { ...r, lastRun: Date.now(), runCount: (r.runCount || 0) + 1 } : r
    ));
    setTab("execute");
    // Execute will start after state settles
    setTimeout(() => {
      const btn = document.getElementById("execute-btn");
      if (btn) btn.click();
    }, 100);
  };

  const stepStatusIcon = (status: string) => {
    switch (status) {
      case "done": return "\u2705";
      case "error": return "\u274C";
      case "running": return "\u23F3";
      default: return "\u25CB";
    }
  };

  const stepStatusColor = (status: string) => {
    switch (status) {
      case "done": return "text-success";
      case "error": return "text-danger";
      case "running": return "text-warning";
      default: return "text-muted";
    }
  };

  const hasValidProvider = ["openai", "anthropic", "google", "xai"].includes(settings.activeProvider);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold">Browser Automation</h1>
              <p className="text-xs text-muted mt-0.5">
                Plan, save, and execute web automation tasks with AI-powered tool calling
              </p>
            </div>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer ${showHelp ? "bg-accent/20 text-accent-light border-accent/30" : "text-muted border-border hover:border-accent/30 hover:text-accent-light"}`}
              title="How to use Automate"
            >
              HOW TO ?
            </button>
          </div>
          {steps.length > 0 && !executing && (
            <button
              onClick={executeSteps}
              disabled={!hasValidProvider}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-success/20 text-success border border-success/30 hover:bg-success/30 transition-colors disabled:opacity-50"
            >
              {"\u25B6"} Execute Plan ({steps.length} steps)
            </button>
          )}
          {executing && (
            <button
              onClick={() => abortRef.current?.abort()}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30 transition-colors"
            >
              Stop Execution
            </button>
          )}
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="px-6 py-3 bg-surface/80 border-b border-border space-y-1.5 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-foreground">How to Use Browser Automation</span>
            <button onClick={() => setShowHelp(false)} className="text-muted hover:text-foreground text-[10px] cursor-pointer">&times;</button>
          </div>
          <p className="text-muted"><strong>1. Plan tab</strong> — Enter a target URL and describe what you want automated (e.g., &quot;scrape all product prices&quot;). Use a template to get started fast.</p>
          <p className="text-muted"><strong>2. Generate Plan</strong> — The AI creates step-by-step actions (navigate, click, extract, etc.). Review and edit the steps.</p>
          <p className="text-muted"><strong>3. Execute tab</strong> — Run the plan. The agent executes each step using tool calling and shows progress in real time.</p>
          <p className="text-muted"><strong>4. Saved tab</strong> — Plans are saved automatically. Re-run, edit, or delete saved automations anytime.</p>
          <p className="text-[10px] text-muted/60">Requires a configured AI provider (OpenAI, Anthropic, Google, or xAI). Set API keys in Settings.</p>
        </div>
      )}

      <div className="flex gap-1 px-6 pt-3">
        {(["natural", "execute", "saved"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === t
                ? "bg-accent/20 text-accent-light border border-accent/30"
                : "text-muted hover:text-foreground hover:bg-surface-light"
            }`}
          >
            {t === "natural" ? "Plan" : t === "execute" ? `Execute${executionLogs.length > 0 ? ` (${executionLogs.length})` : ""}` : `Saved (${recordings.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Provider notice */}
        {!hasValidProvider && (
          <div className="px-3 py-2 rounded-lg border border-yellow-500/30 bg-yellow-950/20 text-[11px] text-yellow-400">
            Automation requires a configured AI provider.
            Current: <span className="font-mono">{settings.activeProvider}</span>.
            Change in <a href="/app/settings" className="underline">Settings</a>.
          </div>
        )}

        {tab === "natural" && (
          <>
            {/* Quick templates */}
            <div className="flex gap-2 flex-wrap">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setPrompt(t.prompt)}
                  className="px-2.5 py-1.5 text-[10px] rounded-lg border border-border bg-surface/50 text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Target URL"
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none font-mono"
              />
              <div className="flex gap-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the task... (e.g., 'Log in with username admin, go to settings, and export the report as CSV')"
                  rows={3}
                  className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none resize-none"
                />
                <div className="flex flex-col gap-2 self-end">
                  <button
                    onClick={running ? () => abortRef.current?.abort() : runAutomation}
                    disabled={!prompt.trim() && !running}
                    className={`px-6 py-2 rounded-lg text-xs font-medium transition-colors ${
                      running
                        ? "bg-danger/20 text-danger border border-danger/30"
                        : "bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
                    }`}
                  >
                    {running ? "Stop" : "Generate Plan"}
                  </button>
                </div>
              </div>
            </div>

            {enforcement && (
              <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-[10px] font-mono border ${enforcement.allSafe ? "border-green-500/20 bg-green-950/20" : "border-red-500/30 bg-red-950/30"}`}>
                <span className={enforcement.allSafe ? "text-green-400" : "text-red-400"}>
                  {enforcement.allSafe ? "\u2713" : "\u2717"} CBF {enforcement.safeCount}/{enforcement.barrierCount}
                </span>
                {enforcement.agfHitType && (
                  <span className="text-[#a1a1aa]">
                    {enforcement.agfHitType === "FULL" || enforcement.agfHitType === "BASIN" ? "\u26A1" : "\uD83E\uDDE0"}{" "}
                    {enforcement.agfHitType}
                  </span>
                )}
                {enforcement.timing != null && (
                  <span className="text-[#a1a1aa]">{enforcement.timing}ms</span>
                )}
              </div>
            )}

            {output && (
              <div className="bg-surface border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Automation Plan</h3>
                  <div className="flex gap-2">
                    {steps.length > 0 && (
                      <>
                        <button
                          onClick={saveRecording}
                          className="px-3 py-1 text-xs rounded bg-accent/10 text-accent-light hover:bg-accent/20 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={executeSteps}
                          disabled={!hasValidProvider || executing}
                          className="px-3 py-1 text-xs rounded bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-50"
                        >
                          {"\u25B6"} Execute
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <pre className="text-xs text-muted whitespace-pre-wrap font-mono">{output}</pre>
              </div>
            )}

            {steps.length > 0 && (
              <div className="bg-surface border border-border rounded-lg p-4">
                <h3 className="text-sm font-medium mb-3">Parsed Steps ({steps.length})</h3>
                <div className="space-y-2">
                  {steps.map((step, i) => (
                    <div key={step.id} className={`flex items-center gap-3 text-xs ${stepStatusColor(step.status)}`}>
                      <span className="w-5 text-center">{stepStatusIcon(step.status)}</span>
                      <span className="text-muted w-6">{i + 1}.</span>
                      <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent-light font-mono text-[10px]">
                        {step.action}
                      </span>
                      <span className="text-foreground font-mono flex-1 truncate">{step.target}</span>
                      {step.value && <span className="text-muted truncate max-w-[200px]">{step.value}</span>}
                      {step.result && (
                        <span className="text-[9px] text-muted/60 truncate max-w-[150px]" title={step.result}>
                          {step.result}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "execute" && (
          <div className="space-y-4">
            {steps.length === 0 && !executing && (
              <div className="text-center py-12 text-muted">
                <p className="text-2xl mb-3">{"\u2699\uFE0F"}</p>
                <p className="text-sm mb-2">No automation plan loaded</p>
                <p className="text-[11px]">Generate a plan in the Plan tab, then execute it here.</p>
              </div>
            )}

            {steps.length > 0 && (
              <>
                {/* Step execution timeline */}
                <div className="bg-surface border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium">Execution Progress</h3>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-muted">
                      <span>{steps.filter(s => s.status === "done").length}/{steps.length} complete</span>
                      {executing && <span className="w-1.5 h-1.5 bg-warning rounded-full animate-pulse" />}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-surface-light rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-success rounded-full transition-all duration-500"
                      style={{ width: `${(steps.filter(s => s.status === "done").length / steps.length) * 100}%` }}
                    />
                  </div>

                  <div className="space-y-2">
                    {steps.map((step, i) => (
                      <div key={step.id} className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
                        step.status === "running" ? "bg-warning/5 border border-warning/20" :
                        step.status === "done" ? "bg-success/5" :
                        step.status === "error" ? "bg-danger/5" : ""
                      }`}>
                        <span className="w-5 text-center mt-0.5">{stepStatusIcon(step.status)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted">Step {i + 1}</span>
                            <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent-light font-mono text-[10px]">
                              {step.action}
                            </span>
                            <span className="text-xs font-mono text-foreground truncate">{step.target}</span>
                          </div>
                          {step.value && (
                            <p className="text-[10px] text-muted mt-0.5">{step.value}</p>
                          )}
                          {step.result && (
                            <pre className="text-[10px] text-muted/70 mt-1 font-mono whitespace-pre-wrap max-h-20 overflow-y-auto">
                              {step.result}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Execution logs */}
                {executionLogs.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-sm font-medium mb-3">Execution Logs</h3>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {executionLogs.map((log, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] font-mono">
                          <span className={log.status === "error" ? "text-danger" : "text-success"}>
                            {log.status === "error" ? "\u2717" : "\u2713"}
                          </span>
                          <span className="text-muted">Step {log.stepIndex + 1}</span>
                          <span className="text-foreground/70 flex-1 truncate">{log.result.slice(0, 150)}</span>
                          <span className="text-muted shrink-0">{log.elapsed_ms}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agent output */}
                {output && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-sm font-medium mb-2">Agent Summary</h3>
                    <pre className="text-xs text-muted whitespace-pre-wrap font-mono">{output}</pre>
                  </div>
                )}

                {!executing && steps.some(s => s.status !== "pending") && (
                  <div className="flex gap-2">
                    <button
                      id="execute-btn"
                      onClick={executeSteps}
                      disabled={!hasValidProvider}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-accent/20 text-accent-light border border-accent/30 hover:bg-accent/30 transition-colors disabled:opacity-50"
                    >
                      Re-run
                    </button>
                    <button
                      onClick={saveRecording}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-surface border border-border text-muted hover:text-foreground hover:bg-surface-light transition-colors"
                    >
                      Save to Library
                    </button>
                  </div>
                )}

                {!executing && steps.every(s => s.status === "pending") && (
                  <button
                    id="execute-btn"
                    onClick={executeSteps}
                    disabled={!hasValidProvider}
                    className="w-full py-3 rounded-lg text-sm font-medium bg-success/20 text-success border border-success/30 hover:bg-success/30 transition-colors disabled:opacity-50"
                  >
                    {"\u25B6"} Execute All {steps.length} Steps
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {tab === "saved" && (
          <>
            {recordings.length === 0 && (
              <div className="text-center py-12 text-muted">
                <p className="text-2xl mb-3">{"\uD83D\uDCBE"}</p>
                <p className="text-sm mb-2">No saved automations</p>
                <p className="text-[11px]">Generate automation plans in the Plan tab and save them here for reuse</p>
              </div>
            )}
            <div className="space-y-3">
              {recordings.map((rec) => (
                <div key={rec.id} className="bg-surface border border-border rounded-lg p-4 hover:border-accent/20 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-sm">{rec.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted font-mono">
                        {rec.steps.length} steps
                        {rec.runCount > 0 && ` \u00B7 ${rec.runCount} runs`}
                      </span>
                      <span className="text-[10px] text-muted">
                        {new Date(rec.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {rec.url && rec.url !== "https://" && (
                    <p className="text-[10px] font-mono text-accent-light/60 mb-2 truncate">{rec.url}</p>
                  )}
                  <div className="space-y-1 mb-3">
                    {rec.steps.slice(0, 4).map((s, i) => (
                      <p key={i} className="text-[10px] text-muted font-mono">
                        [{s.action}] {s.target}
                      </p>
                    ))}
                    {rec.steps.length > 4 && (
                      <p className="text-[10px] text-muted">...and {rec.steps.length - 4} more</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadRecording(rec)}
                      className="px-3 py-1.5 text-[10px] rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-light transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => rerunRecording(rec)}
                      disabled={!hasValidProvider}
                      className="px-3 py-1.5 text-[10px] rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors disabled:opacity-50"
                    >
                      {"\u25B6"} Run
                    </button>
                    <button
                      onClick={() => deleteRecording(rec.id)}
                      className="px-3 py-1.5 text-[10px] rounded-lg text-danger/60 hover:text-danger hover:bg-danger/5 transition-colors ml-auto"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
