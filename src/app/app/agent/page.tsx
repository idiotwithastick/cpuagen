"use client";

import { useState, useRef, useEffect } from "react";
import { withAdminToken } from "@/lib/admin";
import { migrateSettings, DEFAULT_SETTINGS } from "@/lib/types";
import type { Settings } from "@/lib/types";

interface AgentStepUI {
  iteration: number;
  phase: string;
  toolCalls?: Array<{ name: string; args: unknown }>;
  toolResults?: Array<{ name: string; content: string; error?: string }>;
  elapsed_ms: number;
}

interface EnforcementBadge {
  allSafe: boolean;
  barrierCount: number;
  safeCount: number;
}

export default function AgentPage() {
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStepUI[]>([]);
  const [output, setOutput] = useState("");
  const [enforcement, setEnforcement] = useState<EnforcementBadge | null>(null);
  const [agentComplete, setAgentComplete] = useState<{
    success: boolean;
    totalIterations: number;
    totalToolCalls: number;
    totalElapsed_ms: number;
    error?: string;
  } | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [maxIter, setMaxIter] = useState(10);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("cpuagen-settings") || "{}");
      setSettings(migrateSettings(raw));
    } catch { /* defaults */ }
  }, []);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: "smooth" });
  }, [steps, output]);

  const runAgent = async () => {
    if (!query.trim() || running) return;
    setRunning(true);
    setSteps([]);
    setOutput("");
    setEnforcement(null);
    setAgentComplete(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withAdminToken({
          query: query.trim(),
          provider: settings.activeProvider,
          model: settings.activeModel,
          apiKey: settings.activeProvider !== "demo" ? settings.apiKeys[settings.activeProvider as keyof typeof settings.apiKeys] || "" : "",
          maxIterations: maxIter,
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
            if (parsed.type === "enforcement") {
              setEnforcement({
                allSafe: parsed.pre?.cbf?.allSafe ?? true,
                barrierCount: parsed.pre?.cbf?.barrierCount ?? 9,
                safeCount: parsed.pre?.cbf?.safeCount ?? 9,
              });
            } else if (parsed.type === "agent_step") {
              setSteps((prev) => [...prev, {
                iteration: parsed.iteration,
                phase: parsed.phase,
                toolCalls: parsed.toolCalls,
                toolResults: parsed.toolResults,
                elapsed_ms: parsed.elapsed_ms,
              }]);
            } else if (parsed.type === "delta") {
              fullOutput += parsed.content;
              setOutput(fullOutput);
            } else if (parsed.type === "agent_complete") {
              setAgentComplete({
                success: parsed.success,
                totalIterations: parsed.totalIterations,
                totalToolCalls: parsed.totalToolCalls,
                totalElapsed_ms: parsed.totalElapsed_ms,
                error: parsed.error,
              });
            } else if (parsed.type === "error") {
              setOutput(`Error: ${parsed.message}`);
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setOutput(`Error: ${(e as Error).message}`);
      }
    }
    setRunning(false);
  };

  const phaseColor = (phase: string) => {
    switch (phase) {
      case "PLAN": return "text-blue-400";
      case "EXECUTE": return "text-yellow-400";
      case "OBSERVE": return "text-cyan-400";
      case "DECIDE": return "text-purple-400";
      case "COMPLETE": return "text-green-400";
      case "ERROR": return "text-red-400";
      default: return "text-muted";
    }
  };

  const hasValidProvider = ["openai", "anthropic", "google", "xai"].includes(settings.activeProvider);

  // ─── Topic Randomizer ───
  const RANDOM_TOPICS: { category: string; icon: string; topics: string[] }[] = [
    {
      category: "Research",
      icon: "\uD83D\uDD2C",
      topics: [
        "Research the latest developments in quantum error correction and summarize the top 3 approaches with their pros and cons",
        "Search for the current state of nuclear fusion energy and calculate the projected cost per kWh compared to solar",
        "Find and summarize the top 5 most cited machine learning papers from the last 6 months",
        "Research the current status of mRNA vaccine technology beyond COVID — what diseases are being targeted?",
        "Look up the latest breakthroughs in room-temperature superconductors and evaluate their credibility",
        "Research the environmental impact of cryptocurrency mining — find current energy consumption stats and compare to countries",
        "Find the latest advances in CRISPR gene editing for treating genetic diseases in humans",
        "Research the current state of brain-computer interfaces — compare Neuralink, Synchron, and academic approaches",
      ],
    },
    {
      category: "Calculate",
      icon: "\uD83E\uDDEE",
      topics: [
        "Calculate the orbital mechanics for a Hohmann transfer orbit from Earth to Mars. Include delta-v requirements and travel time.",
        "Compute the compound interest on $10,000 invested at various rates (3%, 5%, 7%, 10%) over 10, 20, and 30 years. Show a comparison table.",
        "Calculate the Shannon entropy of the English alphabet based on letter frequencies, then compare to a perfectly uniform distribution",
        "Compute the Fibonacci sequence up to n=50, then calculate the ratio of consecutive terms to demonstrate golden ratio convergence",
        "Calculate Earth's escape velocity from first principles using G, M, and R. Then compare to escape velocities of other planets.",
        "Solve the birthday problem: compute the probability of shared birthdays for groups of 5, 10, 23, 50, and 100 people",
        "Calculate the information-theoretic limits of a 5G channel at 100MHz bandwidth with various SNR values using Shannon's formula",
        "Compute the eigenvalues of a 3x3 matrix [[2,1,0],[1,3,1],[0,1,2]] and verify by checking the characteristic polynomial",
      ],
    },
    {
      category: "Code & Run",
      icon: "\uD83D\uDCBB",
      topics: [
        "Write and execute a Monte Carlo simulation to estimate pi using 1 million random points",
        "Code a binary search tree with insert, search, delete, and in-order traversal. Test it with 20 random numbers.",
        "Implement the Sieve of Eratosthenes to find all primes up to 10,000. Count them and verify against known results.",
        "Write a function that converts Roman numerals to integers and back. Test edge cases like MCMXCIV and 3999.",
        "Implement a basic LRU cache with O(1) get and put operations. Test with a sequence of 50 operations.",
        "Code a maze generator using recursive backtracking, then solve it with A* pathfinding. Output the maze as ASCII art.",
        "Write a function to detect if a string has all unique characters using 3 different approaches (brute force, set, bit manipulation) and benchmark them",
        "Implement quicksort, mergesort, and heapsort. Generate 10,000 random numbers and benchmark all three.",
      ],
    },
    {
      category: "Multi-Step",
      icon: "\uD83D\uDD04",
      topics: [
        "Fetch the current weather for Tokyo, calculate the heat index, then search for historical weather data to determine if today is above or below average",
        "Search for the top 10 programming languages by popularity, fetch their Wikipedia pages, and compile a comparison table of paradigms, typing, and year created",
        "Find the current price of gold, calculate how many ounces $50,000 would buy, then research the 10-year price trend",
        "Search for the ISS current location, calculate its orbital period, then find when it will next pass over New York",
        "Research 5 different sorting algorithms, implement them in code, benchmark each on arrays of 1000 elements, and rank by performance",
        "Fetch current cryptocurrency prices for BTC, ETH, and SOL, calculate 30-day returns, then search for analyst predictions",
        "Find the population of the 10 largest US cities, calculate population density for each, then search for their cost-of-living indices",
        "Research the latest SpaceX launch, calculate the orbital parameters, then search for the payload details and mission outcome",
      ],
    },
  ];

  const rollRandomTopic = () => {
    const allTopics = RANDOM_TOPICS.flatMap((cat) => cat.topics);
    const randomIndex = Math.floor(Math.random() * allTopics.length);
    setQuery(allTopics[randomIndex]);
  };

  const rollCategoryTopic = (categoryIdx: number) => {
    const topics = RANDOM_TOPICS[categoryIdx].topics;
    const randomIndex = Math.floor(Math.random() * topics.length);
    setQuery(topics[randomIndex]);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-sm font-semibold">Agent Loop</h1>
        <p className="text-[10px] text-muted">
          Tier 2 multi-turn agent with tool calling — plan, execute, observe, decide
        </p>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
        {/* Provider notice */}
        {!hasValidProvider && (
          <div className="px-3 py-2 rounded-lg border border-yellow-500/30 bg-yellow-950/20 text-[11px] text-yellow-400">
            Agent Loop requires OpenAI, Anthropic, Google, or xAI provider (tool calling).
            Current provider: <span className="font-mono">{settings.activeProvider}</span>.
            Change in <a href="/app/settings" className="underline">Settings</a>.
          </div>
        )}

        {/* Input area */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && runAgent()}
              placeholder="Describe a multi-step task for the agent..."
              disabled={running}
              className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none disabled:opacity-50"
            />
            <div className="flex items-center gap-1">
              <label className="text-[9px] text-muted">Max:</label>
              <select
                value={maxIter}
                onChange={(e) => setMaxIter(Number(e.target.value))}
                className="bg-surface border border-border rounded text-[10px] text-foreground px-1 py-1.5"
              >
                {[3, 5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <button
              onClick={running ? () => abortRef.current?.abort() : runAgent}
              disabled={!query.trim() && !running}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                running
                  ? "bg-danger/20 text-danger border border-danger/30"
                  : "bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
              }`}
            >
              {running ? "Stop" : "Run Agent"}
            </button>
          </div>
          {/* Tool inventory */}
          <div className="flex gap-1 flex-wrap">
            {["web_search", "calculator", "code_execute", "file_generate", "fetch_url", "datetime"].map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-surface-light text-muted border border-border">
                {t}
              </span>
            ))}
          </div>

          {/* Topic Randomizer */}
          <div className="flex items-center gap-2">
            <button
              onClick={rollRandomTopic}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-40 cursor-pointer"
              title="Roll a random topic"
            >
              <span className="text-sm">{"\uD83C\uDFB2"}</span>
              Random Topic
            </button>
            <div className="flex gap-1">
              {RANDOM_TOPICS.map((cat, idx) => (
                <button
                  key={cat.category}
                  onClick={() => rollCategoryTopic(idx)}
                  disabled={running}
                  className="px-2 py-1 rounded text-[9px] text-muted hover:text-foreground bg-surface-light hover:bg-surface-light/80 transition-colors disabled:opacity-40 cursor-pointer"
                  title={`Random ${cat.category} topic`}
                >
                  {cat.icon} {cat.category}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Enforcement badge */}
        {enforcement && (
          <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-[10px] font-mono border ${enforcement.allSafe ? "border-green-500/20 bg-green-950/20" : "border-red-500/30 bg-red-950/30"}`}>
            <span className={enforcement.allSafe ? "text-green-400" : "text-red-400"}>
              {enforcement.allSafe ? "\u2713" : "\u2717"} Safety {enforcement.safeCount}/{enforcement.barrierCount}
            </span>
          </div>
        )}

        {/* Steps + Output */}
        <div ref={outputRef} className="flex-1 overflow-y-auto space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="bg-surface/50 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span>
                  <span className="text-muted">iter {step.iteration}</span>
                  {" "}
                  <span className={phaseColor(step.phase)}>{step.phase}</span>
                </span>
                <span className="text-muted">{step.elapsed_ms}ms</span>
              </div>
              {step.toolCalls && step.toolCalls.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {step.toolCalls.map((tc, j) => (
                    <div key={j} className="text-[10px] font-mono">
                      <span className="text-yellow-400">{tc.name}</span>
                      <span className="text-muted">(</span>
                      <span className="text-foreground/70">{JSON.stringify(tc.args).slice(0, 120)}</span>
                      <span className="text-muted">)</span>
                    </div>
                  ))}
                </div>
              )}
              {step.toolResults && step.toolResults.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {step.toolResults.map((tr, j) => (
                    <div key={j} className="text-[10px] font-mono">
                      <span className={tr.error ? "text-red-400" : "text-cyan-400"}>{tr.name}</span>
                      <span className="text-muted">: </span>
                      <span className="text-foreground/60">{(tr.error || tr.content).slice(0, 200)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Final output */}
          {output && (
            <div className="bg-surface border border-border rounded-lg p-4">
              <div className="text-[10px] font-mono text-muted uppercase mb-2">Agent Output</div>
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{output}</pre>
            </div>
          )}

          {/* Completion summary */}
          {agentComplete && (
            <div className={`flex items-center gap-4 px-3 py-2 rounded-lg text-[10px] font-mono border ${agentComplete.success ? "border-green-500/20 bg-green-950/20 text-green-400" : "border-red-500/30 bg-red-950/30 text-red-400"}`}>
              <span>{agentComplete.success ? "\u2713 Complete" : "\u2717 Failed"}</span>
              <span className="text-muted">{agentComplete.totalIterations} iterations</span>
              <span className="text-muted">{agentComplete.totalToolCalls} tool calls</span>
              <span className="text-muted">{agentComplete.totalElapsed_ms}ms total</span>
              {agentComplete.error && <span className="text-red-400">{agentComplete.error}</span>}
            </div>
          )}

          {/* Empty state */}
          {steps.length === 0 && !output && !running && (
            <div className="text-center py-12 text-muted max-w-lg mx-auto px-4">
              <p className="text-2xl mb-3">{"\u{1F916}"}</p>
              <p className="text-sm font-medium text-foreground mb-1">Multi-Turn Agent Loop</p>
              <p className="text-[11px] mb-5">
                Give the agent a multi-step task. It will plan, use tools, observe results,
                and iterate until it has a complete answer.
              </p>

              <div className="text-left space-y-2 mb-5">
                <div className="flex gap-2 items-start bg-surface/50 border border-border rounded-lg p-2.5">
                  <span className="text-[11px] font-bold text-accent-light shrink-0">1.</span>
                  <span className="text-[11px]"><strong>Describe your task</strong> in the input box below — be specific about what you need</span>
                </div>
                <div className="flex gap-2 items-start bg-surface/50 border border-border rounded-lg p-2.5">
                  <span className="text-[11px] font-bold text-accent-light shrink-0">2.</span>
                  <span className="text-[11px]"><strong>The agent will use tools</strong> automatically: web search, calculator, code execution, file generation, URL fetching, and date/time</span>
                </div>
                <div className="flex gap-2 items-start bg-surface/50 border border-border rounded-lg p-2.5">
                  <span className="text-[11px] font-bold text-accent-light shrink-0">3.</span>
                  <span className="text-[11px]"><strong>Watch it work</strong> — each step shows the tool used, the result, and the agent&apos;s reasoning</span>
                </div>
              </div>

              <p className="text-[10px] text-muted mb-3">Try an example:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  { label: "Research", q: "Search the web for the latest news about AI safety research and summarize the top 3 findings" },
                  { label: "Calculate", q: "What is the compound interest on $10,000 at 7% annual rate over 30 years, compounded monthly? Show your work." },
                  { label: "Code + Run", q: "Write a JavaScript function that finds all prime numbers up to 1000, then execute it and tell me how many there are." },
                  { label: "Multi-step", q: "What time is it in Tokyo, London, and New York right now? Calculate the time differences between them." },
                ].map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => setQuery(ex.q)}
                    className="px-2.5 py-1.5 text-[10px] rounded-lg border border-border bg-surface/50 text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              <p className="text-[9px] text-muted/60 mt-4">Select provider, model &amp; max iterations in the header. Set API keys in Settings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
