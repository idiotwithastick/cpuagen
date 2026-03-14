"use client";

import { useState, useRef, useCallback } from "react";

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
  steps: AutomationStep[];
  created_at: number;
}

export default function AutomatePage() {
  const [url, setUrl] = useState("https://");
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"natural" | "recorder" | "saved">("natural");
  const abortRef = useRef<AbortController | null>(null);

  const runAutomation = useCallback(async () => {
    if (!prompt.trim()) return;
    setRunning(true);
    setOutput("");
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `You are a browser automation assistant. The user wants you to automate web tasks.
Describe step-by-step what you would do, including:
- Navigation: go to URL
- Click: click element with selector
- Type: type text into input
- Wait: wait for element/condition
- Extract: get text/data from page
- Screenshot: capture the page

Format each step as: [ACTION] target — detail
Example: [NAVIGATE] https://example.com — open the page
[CLICK] button.submit — click the submit button
[TYPE] input#search — "search query"`,
            },
            { role: "user", content: `URL: ${url}\n\nTask: ${prompt}` },
          ],
          provider: "demo",
          model: "gemini-2.0-flash",
        }),
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
              }
            } catch { /* skip */ }
          }
        }
      }

      // Parse steps from result
      const stepMatches = result.matchAll(/\[(\w+)]\s*([^\n—]+)(?:\s*—\s*(.+))?/g);
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
  }, [prompt, url]);

  const saveRecording = () => {
    if (steps.length === 0) return;
    const rec: Recording = {
      id: `rec-${Date.now()}`,
      name: prompt.slice(0, 50) || "Untitled",
      steps,
      created_at: Date.now(),
    };
    setRecordings((prev) => [rec, ...prev]);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-semibold">Browser Automation</h1>
        <p className="text-sm text-muted mt-1">
          Automate web tasks with natural language — describe what you want done
        </p>
      </div>

      <div className="flex gap-2 px-6 pt-4">
        {(["natural", "recorder", "saved"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-accent/20 text-accent-light border border-accent/30"
                : "text-muted hover:text-foreground hover:bg-surface-light"
            }`}
          >
            {t === "natural" ? "Natural Language" : t === "recorder" ? "Step Recorder" : "Saved Automations"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {tab === "natural" && (
          <>
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
                <button
                  onClick={running ? () => abortRef.current?.abort() : runAutomation}
                  disabled={!prompt.trim() && !running}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors self-end ${
                    running
                      ? "bg-danger/20 text-danger border border-danger/30"
                      : "bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
                  }`}
                >
                  {running ? "Stop" : "Generate"}
                </button>
              </div>
            </div>

            {output && (
              <div className="bg-surface border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Automation Plan</h3>
                  {steps.length > 0 && (
                    <button
                      onClick={saveRecording}
                      className="px-3 py-1 text-xs rounded bg-accent/10 text-accent-light hover:bg-accent/20 transition-colors"
                    >
                      Save
                    </button>
                  )}
                </div>
                <pre className="text-xs text-muted whitespace-pre-wrap font-mono">{output}</pre>
              </div>
            )}

            {steps.length > 0 && (
              <div className="bg-surface border border-border rounded-lg p-4">
                <h3 className="text-sm font-medium mb-3">Parsed Steps</h3>
                <div className="space-y-2">
                  {steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-3 text-xs">
                      <span className="text-muted w-6">{i + 1}.</span>
                      <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent-light font-mono">
                        {step.action}
                      </span>
                      <span className="text-foreground font-mono">{step.target}</span>
                      {step.value && <span className="text-muted">— {step.value}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "recorder" && (
          <div className="text-center py-12 text-muted">
            <p className="text-4xl mb-4">🎥</p>
            <p className="text-lg mb-2">Step Recorder</p>
            <p className="text-sm">Record browser actions interactively. Coming soon — use Natural Language mode for now.</p>
          </div>
        )}

        {tab === "saved" && (
          <>
            {recordings.length === 0 && (
              <div className="text-center py-12 text-muted">
                <p className="text-lg mb-2">No saved automations</p>
                <p className="text-sm">Generate automation plans in Natural Language mode and save them here</p>
              </div>
            )}
            {recordings.map((rec) => (
              <div key={rec.id} className="bg-surface border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">{rec.name}</h3>
                  <span className="text-xs text-muted">
                    {rec.steps.length} steps · {new Date(rec.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="space-y-1">
                  {rec.steps.slice(0, 5).map((s, i) => (
                    <p key={i} className="text-xs text-muted font-mono">
                      [{s.action}] {s.target}
                    </p>
                  ))}
                  {rec.steps.length > 5 && (
                    <p className="text-xs text-muted">...and {rec.steps.length - 5} more</p>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
