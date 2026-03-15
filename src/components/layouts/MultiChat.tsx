"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Settings, ApiKeys, EnforcementResult } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";
import { withAdminToken } from "@/lib/admin";
import { getCoreContext } from "@/lib/system-context";

/* ─── Types ─── */

interface MultiChatProps {
  settings: Settings;
  onCodeGenerated: (filename: string, content: string, language: string) => void;
}

interface CellConfig {
  id: string;
  provider: string;       // "demo" | "anthropic" | "openai" | "google" | "xai"
  model: string;
  displayName: string;
  modelDisplayName: string;
}

interface CellState {
  content: string;
  status: "idle" | "streaming" | "done" | "error";
  enforcement?: EnforcementResult;
  startTime?: number;
  endTime?: number;
  error?: string;
}

interface ComparisonSummary {
  fastest?: { name: string; ms: number };
  mostDetailed?: { name: string; words: number };
  allEnforced: boolean;
}

/* ─── Helpers ─── */

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function extractCodeBlocks(text: string): { filename: string; content: string; language: string }[] {
  const blocks: { filename: string; content: string; language: string }[] = [];
  const regex = /```(\w+)?\s*([\w.\-/]+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const language = match[1] || "text";
    const filename = match[2] || `snippet.${language}`;
    const content = match[3].trim();
    if (content) blocks.push({ filename, content, language });
  }
  return blocks;
}

/* ─── Build cell configs from available providers ─── */

function buildCellConfigs(settings: Settings): CellConfig[] {
  const cells: CellConfig[] = [];

  // Demo provider always produces two cells
  const demoGemini: CellConfig = {
    id: "demo-gemini",
    provider: "demo",
    model: "gemini-2.0-flash",
    displayName: "Google Gemini",
    modelDisplayName: "gemini-2.0-flash",
  };
  const demoGpt: CellConfig = {
    id: "demo-gpt",
    provider: "demo",
    model: "gpt-4o-mini",
    displayName: "OpenAI GPT",
    modelDisplayName: "gpt-4o-mini",
  };

  // Check which providers have API keys
  const keyed: CellConfig[] = [];
  const keyProviders: (keyof ApiKeys)[] = ["anthropic", "openai", "google", "xai"];
  for (const pid of keyProviders) {
    if (settings.apiKeys[pid]) {
      const prov = PROVIDERS.find((p) => p.id === pid);
      if (prov) {
        keyed.push({
          id: `keyed-${pid}`,
          provider: pid,
          model: prov.defaultModel,
          displayName: prov.name,
          modelDisplayName: prov.models.find((m) => m.id === prov.defaultModel)?.name || prov.defaultModel,
        });
      }
    }
  }

  // If we have keyed providers, use them + fill with demo to reach at least 2
  if (keyed.length >= 2) {
    cells.push(...keyed.slice(0, 6));
  } else if (keyed.length === 1) {
    cells.push(keyed[0]);
    cells.push(demoGemini, demoGpt);
  } else {
    // No API keys — demo only
    cells.push(demoGemini, demoGpt);
  }

  return cells.slice(0, 6);
}

/* ─── Enforcement Mini Badge ─── */

function EnforcementBadge({ enforcement, elapsed }: { enforcement?: EnforcementResult; elapsed?: number }) {
  if (!enforcement) return null;
  const allSafe = enforcement.pre.cbf.allSafe && (enforcement.post?.cbf.allSafe ?? true);
  const hitType = enforcement.agfHitType;
  const ms = elapsed ?? enforcement.timing?.total_ms;
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono ${
      allSafe ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
    }`}>
      <span>{allSafe ? "\u2713" : "\u2717"}</span>
      <span>{hitType === "FULL_HIT" ? "\u26A1" : hitType === "BASIN_HIT" ? "\u26A1" : "\u{1F9EA}"}</span>
      {ms !== undefined && <span>{ms}ms</span>}
    </div>
  );
}

/* ─── Code Block Chip ─── */

function CodeChip({ filename, language, onClick }: { filename: string; language: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-[10px] font-mono text-accent hover:bg-accent/20 cursor-pointer transition-colors"
    >
      <span>{"\u{1F4C4}"}</span>
      <span>{filename}</span>
      <span className="text-muted">({language})</span>
    </button>
  );
}

/* ─── Single Panel Cell ─── */

function PanelCell({
  config,
  state,
  onCodeGenerated,
}: {
  config: CellConfig;
  state: CellState;
  onCodeGenerated: (filename: string, content: string, language: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const codeBlocks = state.content ? extractCodeBlocks(state.content) : [];

  useEffect(() => {
    if (state.status === "streaming") {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [state.content, state.status]);

  const elapsed = state.startTime && state.endTime ? state.endTime - state.startTime : undefined;

  return (
    <div className={`flex flex-col bg-surface border border-border rounded-lg overflow-hidden min-h-0 ${
      state.status === "streaming"
        ? "border-l-2 border-l-accent animate-pulse"
        : state.status === "done"
          ? "border-l-2 border-l-success"
          : state.status === "error"
            ? "border-l-2 border-l-danger"
            : ""
    }`}>
      {/* Cell header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface/80 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            state.status === "streaming" ? "bg-accent animate-pulse"
              : state.status === "done" ? "bg-success"
                : state.status === "error" ? "bg-danger"
                  : "bg-muted/30"
          }`} />
          <span className="text-xs font-semibold text-accent">{config.displayName}</span>
        </div>
        <span className="text-[9px] font-mono text-muted">{config.modelDisplayName}</span>
      </div>

      {/* Response area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 min-h-[120px] max-h-[400px]">
        {state.status === "idle" && (
          <div className="flex items-center justify-center h-full text-muted/40 text-xs font-mono">
            Waiting for prompt...
          </div>
        )}
        {state.status === "error" && (
          <div className="text-danger text-xs font-mono">
            {state.error || "Request failed"}
          </div>
        )}
        {(state.status === "streaming" || state.status === "done") && (
          <pre className="whitespace-pre-wrap text-[11px] font-mono leading-relaxed text-foreground">
            {state.content}
            {state.status === "streaming" && (
              <span className="inline-block w-1.5 h-3.5 bg-accent/60 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </pre>
        )}
      </div>

      {/* Footer: enforcement + code chips */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-surface/50 shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {codeBlocks.map((block, i) => (
            <CodeChip
              key={i}
              filename={block.filename}
              language={block.language}
              onClick={() => onCodeGenerated(block.filename, block.content, block.language)}
            />
          ))}
        </div>
        <EnforcementBadge enforcement={state.enforcement} elapsed={elapsed} />
      </div>
    </div>
  );
}

/* ─── Comparison Summary Bar ─── */

function ComparisonBar({ cells, states }: { cells: CellConfig[]; states: Record<string, CellState> }) {
  const allDone = cells.every((c) => states[c.id]?.status === "done" || states[c.id]?.status === "error");
  if (!allDone) return null;

  const completed = cells.filter((c) => states[c.id]?.status === "done");
  if (completed.length === 0) return null;

  let fastest: { name: string; ms: number } | undefined;
  let mostDetailed: { name: string; words: number } | undefined;
  let allEnforced = true;

  for (const cell of completed) {
    const st = states[cell.id];
    const elapsed = st.startTime && st.endTime ? st.endTime - st.startTime : undefined;
    const words = wordCount(st.content);
    const safe = st.enforcement
      ? (st.enforcement.pre.cbf.allSafe && (st.enforcement.post?.cbf.allSafe ?? true))
      : false;

    if (!safe) allEnforced = false;
    if (elapsed !== undefined && (!fastest || elapsed < fastest.ms)) {
      fastest = { name: cell.displayName, ms: elapsed };
    }
    if (!mostDetailed || words > mostDetailed.words) {
      mostDetailed = { name: cell.displayName, words };
    }
  }

  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2 bg-surface/80 border-t border-border text-[10px] font-mono text-muted flex-wrap">
      {fastest && (
        <span>Fastest: <span className="text-accent">{fastest.name}</span> ({fastest.ms}ms)</span>
      )}
      {mostDetailed && (
        <span>Most detailed: <span className="text-accent">{mostDetailed.name}</span> ({mostDetailed.words} words)</span>
      )}
      <span className={allEnforced ? "text-success" : "text-danger"}>
        {allEnforced ? "All \u2713 enforced" : "Some barriers failed"}
      </span>
    </div>
  );
}

/* ─── Main Component ─── */

export default function MultiChat({ settings, onCodeGenerated }: MultiChatProps) {
  const [input, setInput] = useState("");
  const [cells] = useState<CellConfig[]>(() => buildCellConfigs(settings));
  const [cellStates, setCellStates] = useState<Record<string, CellState>>(() => {
    const init: Record<string, CellState> = {};
    for (const c of buildCellConfigs(settings)) {
      init[c.id] = { content: "", status: "idle" };
    }
    return init;
  });
  const [isRunning, setIsRunning] = useState(false);
  const abortRefs = useRef<Record<string, AbortController>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Rebuild cells when settings change
  const activeCells = cells.length > 0 ? cells : buildCellConfigs(settings);

  const activeCount = activeCells.length;

  /* ─── Stream a single cell ─── */
  const streamCell = useCallback(async (
    cell: CellConfig,
    prompt: string,
    systemPrompt: string,
  ) => {
    const controller = new AbortController();
    abortRefs.current[cell.id] = controller;

    const startTime = Date.now();

    setCellStates((prev) => ({
      ...prev,
      [cell.id]: { content: "", status: "streaming", startTime, enforcement: undefined, error: undefined },
    }));

    const apiKey = cell.provider !== "demo"
      ? settings.apiKeys[cell.provider as keyof ApiKeys] || ""
      : "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withAdminToken({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          provider: cell.provider,
          model: cell.model,
          apiKey,
        })),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setCellStates((prev) => ({
          ...prev,
          [cell.id]: { ...prev[cell.id], status: "error", error: `HTTP ${res.status}`, endTime: Date.now() },
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let enforcement: EnforcementResult | undefined;
      let buffer = "";

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
              enforcement = { pre: { signature: parsed.signature, cbf: parsed.cbf } };
              if (parsed.timing) enforcement.timing = parsed.timing;
            } else if (parsed.type === "enforcement" && parsed.stage === "post") {
              if (enforcement) {
                enforcement.post = { signature: parsed.signature, cbf: parsed.cbf, teepId: parsed.teepId };
                if (parsed.timing) enforcement.timing = { ...enforcement.timing, ...parsed.timing };
                enforcement.agfHitType = parsed.agfHitType || enforcement.agfHitType;
              }
            } else if (parsed.type === "agf") {
              if (enforcement) {
                enforcement.agfHitType = parsed.hitType;
                if (parsed.timing) enforcement.timing = parsed.timing;
              }
            } else if (parsed.type === "delta" && parsed.content) {
              fullContent += parsed.content;
              setCellStates((prev) => ({
                ...prev,
                [cell.id]: { ...prev[cell.id], content: fullContent },
              }));
            } else if (parsed.type === "error") {
              setCellStates((prev) => ({
                ...prev,
                [cell.id]: { ...prev[cell.id], status: "error", error: parsed.message, endTime: Date.now() },
              }));
              return;
            }
          } catch { /* skip malformed SSE */ }
        }
      }

      const endTime = Date.now();
      setCellStates((prev) => ({
        ...prev,
        [cell.id]: {
          ...prev[cell.id],
          content: fullContent,
          status: "done",
          enforcement,
          endTime,
        },
      }));
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setCellStates((prev) => ({
          ...prev,
          [cell.id]: { ...prev[cell.id], status: "done", endTime: Date.now() },
        }));
      } else {
        setCellStates((prev) => ({
          ...prev,
          [cell.id]: { ...prev[cell.id], status: "error", error: (err as Error).message, endTime: Date.now() },
        }));
      }
    } finally {
      delete abortRefs.current[cell.id];
    }
  }, [settings]);

  /* ─── Broadcast prompt to all cells ─── */
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isRunning) return;

    setInput("");
    setIsRunning(true);

    const systemPrompt = [
      getCoreContext(),
      "",
      "# MULTI MODE -- SIMULTANEOUS MULTI-PROVIDER RESPONSE",
      "",
      "You are one of multiple LLMs responding simultaneously to the same prompt through CPUAGEN.",
      "Be concise and direct. The user is comparing responses across providers.",
      "Every response passes through CPUAGEN's enforcement pipeline independently.",
      settings.systemPrompt ? `\nAdditional instructions: ${settings.systemPrompt}` : "",
    ].join("\n");

    // Fire all streams simultaneously
    const promises = activeCells.map((cell) => streamCell(cell, text, systemPrompt));

    Promise.allSettled(promises).then(() => {
      setIsRunning(false);
    });
  }, [input, isRunning, activeCells, streamCell, settings.systemPrompt]);

  /* ─── Stop all streams ─── */
  const handleStopAll = useCallback(() => {
    for (const ctrl of Object.values(abortRefs.current)) {
      ctrl.abort();
    }
  }, []);

  /* ─── Keyboard submit ─── */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ─── Grid columns ─── */
  const gridClass = activeCount <= 2
    ? "grid-cols-1 md:grid-cols-2"
    : activeCount <= 4
      ? "grid-cols-1 md:grid-cols-2"
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border bg-gradient-to-r from-accent/10 via-success/5 to-accent/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{"\u{1F310}"} Multi Mode</span>
            <span className="text-[10px] font-mono text-muted">
              {activeCount} provider{activeCount !== 1 ? "s" : ""} active
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                onClick={handleStopAll}
                className="px-2 py-1 rounded text-[10px] font-mono text-danger border border-danger/30 hover:bg-danger/10 cursor-pointer"
              >
                Stop All
              </button>
            )}
            <button
              onClick={() => {
                const reset: Record<string, CellState> = {};
                for (const c of activeCells) {
                  reset[c.id] = { content: "", status: "idle" };
                }
                setCellStates(reset);
              }}
              className="px-2 py-1 rounded text-[10px] font-mono text-muted hover:text-foreground cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className={`flex-1 overflow-y-auto p-3 min-h-0`}>
        <div className={`grid ${gridClass} gap-3 auto-rows-fr`}>
          {activeCells.map((cell) => (
            <PanelCell
              key={cell.id}
              config={cell}
              state={cellStates[cell.id] || { content: "", status: "idle" }}
              onCodeGenerated={onCodeGenerated}
            />
          ))}
        </div>
      </div>

      {/* Comparison summary */}
      <ComparisonBar cells={activeCells} states={cellStates} />

      {/* Input bar */}
      <div className="shrink-0 flex items-end gap-2 p-3 border-t border-border bg-surface/50">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Broadcast to ${activeCount} providers simultaneously...`}
          className="flex-1 bg-transparent text-foreground text-xs font-mono resize-none outline-none min-h-[32px] max-h-24 py-2 px-1"
          rows={1}
          disabled={isRunning}
        />
        <button
          onClick={handleSend}
          disabled={isRunning || !input.trim()}
          className={`shrink-0 px-4 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${
            isRunning || !input.trim()
              ? "text-muted/30 border border-border"
              : "text-accent bg-accent/10 hover:bg-accent/20 border border-accent/30"
          }`}
        >
          {isRunning ? "Streaming..." : "Send"}
        </button>
      </div>
    </div>
  );
}
