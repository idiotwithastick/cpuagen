"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Settings, ApiKeys, EnforcementResult } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";
import { withAdminToken } from "@/lib/admin";
import { getCoreContext } from "@/lib/system-context";

/* ─── Types ─── */

interface ArenaChatProps {
  settings: Settings;
  onCodeGenerated: (filename: string, content: string, language: string) => void;
}

interface ArenaEnforcementInfo {
  enforcement?: EnforcementResult;
  timing?: number;
  agfHitType?: string;
}

interface ArenaRound {
  modelA: string;
  modelB: string;
  providerA: string;
  providerB: string;
  winner: "A" | "B" | "tie";
}

interface PanelState {
  content: string;
  loading: boolean;
  done: boolean;
  enforcement?: ArenaEnforcementInfo;
}

interface CurrentRound {
  prompt: string;
  modelA: string;
  modelB: string;
  providerA: string;
  providerB: string;
  panelA: PanelState;
  panelB: PanelState;
  voted: boolean;
  winner?: "A" | "B" | "tie";
}

/* ─── Helpers ─── */

function getAvailableProviderModels(settings: Settings): { provider: string; model: string; label: string }[] {
  const available: { provider: string; model: string; label: string }[] = [];

  for (const prov of PROVIDERS) {
    if (prov.id === "demo") {
      for (const m of prov.models) {
        available.push({ provider: "demo", model: m.id, label: `${m.name} (Demo)` });
      }
    } else {
      const key = settings.apiKeys[prov.id as keyof ApiKeys];
      if (key && key.trim()) {
        for (const m of prov.models) {
          available.push({ provider: prov.id, model: m.id, label: `${m.name}` });
        }
      }
    }
  }

  return available;
}

function pickTwoRandom(items: { provider: string; model: string; label: string }[]): [typeof items[0], typeof items[0]] {
  if (items.length < 2) {
    // Fallback: duplicate first item with different label
    return [items[0], items[0]];
  }
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  // Prefer picking different models
  for (let i = 1; i < shuffled.length; i++) {
    if (shuffled[i].model !== shuffled[0].model || shuffled[i].provider !== shuffled[0].provider) {
      return [shuffled[0], shuffled[i]];
    }
  }
  return [shuffled[0], shuffled[1]];
}

const CODE_BLOCK_RE = /```(\w+)?\s+([\w./-]+)\n([\s\S]*?)```/g;

function extractCodeBlocks(content: string): { language: string; filename: string; code: string }[] {
  const blocks: { language: string; filename: string; code: string }[] = [];
  let match;
  while ((match = CODE_BLOCK_RE.exec(content)) !== null) {
    const lang = match[1] || "text";
    const filename = match[2] || `file.${lang}`;
    blocks.push({ language: lang, filename, code: match[3] });
  }
  return blocks;
}

/* ─── Enforcement mini badge ─── */

function EnforcementMini({ info }: { info?: ArenaEnforcementInfo }) {
  if (!info?.enforcement) return null;
  const e = info.enforcement;
  const allSafe = e.pre.cbf.allSafe && (e.post?.cbf.allSafe ?? true);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono ${
      allSafe ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
    }`}>
      {allSafe ? "\u2713 SAFE" : "\u2717 UNSAFE"}
      {e.agfHitType === "FULL_HIT" ? " \u26A1" : e.agfHitType === "JIT_SOLVE" ? " JIT" : ""}
      {e.timing?.total_ms !== undefined && ` ${e.timing.total_ms}ms`}
    </span>
  );
}

/* ─── Response Panel ─── */

function ResponsePanel({
  label,
  panel,
  revealed,
  actualModel,
  isWinner,
}: {
  label: string;
  panel: PanelState;
  revealed: boolean;
  actualModel: string;
  isWinner: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [panel.content]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 border border-border rounded-lg overflow-hidden">
      {/* Panel header */}
      <div className={`h-9 flex items-center justify-between px-3 border-b border-border shrink-0 ${
        revealed && isWinner ? "bg-success/10" : "bg-surface/50"
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            panel.loading ? "bg-accent-light animate-pulse" : panel.done ? "bg-success" : "bg-muted/30"
          }`} />
          <span className="text-xs font-mono font-semibold text-foreground">{label}</span>
          {revealed && isWinner && (
            <span className="text-[9px] font-mono text-success animate-pulse">WINNER</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {revealed ? (
            <span className="text-[10px] font-mono text-accent-light">{actualModel}</span>
          ) : (
            <span className="text-[10px] font-mono text-muted italic">hidden</span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {!panel.content && !panel.loading && (
          <div className="flex items-center justify-center h-full text-muted text-xs">
            Waiting for prompt...
          </div>
        )}
        {panel.loading && !panel.content && (
          <div className="flex items-center gap-2 text-muted text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-light animate-pulse" />
            Thinking...
          </div>
        )}
        {panel.content && (
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">
            {panel.content}
          </pre>
        )}
        {revealed && panel.enforcement && (
          <div className="mt-3 pt-2 border-t border-border">
            <EnforcementMini info={panel.enforcement} />
          </div>
        )}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}

/* ─── Main Arena Component ─── */

export default function ArenaChat({ settings, onCodeGenerated }: ArenaChatProps) {
  const [rounds, setRounds] = useState<ArenaRound[]>([]);
  const [scores, setScores] = useState({ a: 0, b: 0, ties: 0 });
  const [currentRound, setCurrentRound] = useState<CurrentRound | null>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortARef = useRef<AbortController | null>(null);
  const abortBRef = useRef<AbortController | null>(null);

  const bothDone = currentRound?.panelA.done && currentRound?.panelB.done;
  const canVote = bothDone && !currentRound?.voted;
  const isActive = currentRound && !currentRound.voted;

  /* ─── SSE stream helper ─── */
  const streamPanel = useCallback(async (
    prompt: string,
    provider: string,
    model: string,
    apiKey: string,
    abortRef: React.MutableRefObject<AbortController | null>,
    updatePanel: (updater: (prev: PanelState) => PanelState) => void,
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;

    const systemPrompt = `${getCoreContext()}\n\n# ARENA MODE\nYou are competing in a blind arena comparison. Give your best, most helpful response. The user will judge quality without knowing which model you are. Be concise and excellent.\n${settings.systemPrompt ? `\nAdditional instructions: ${settings.systemPrompt}` : ""}`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withAdminToken({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          provider,
          model,
          apiKey,
        })),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        updatePanel((prev) => ({ ...prev, content: `Error: ${res.status}`, done: true, loading: false }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let enforcement: EnforcementResult | undefined;

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
              updatePanel((prev) => ({ ...prev, content: fullContent }));
            }
          } catch { /* skip */ }
        }
      }

      updatePanel((prev) => ({
        ...prev,
        content: fullContent,
        done: true,
        loading: false,
        enforcement: enforcement ? { enforcement, timing: enforcement.timing?.total_ms, agfHitType: enforcement.agfHitType } : undefined,
      }));
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        updatePanel((prev) => ({ ...prev, content: `Error: ${(err as Error).message}`, done: true, loading: false }));
      } else {
        updatePanel((prev) => ({ ...prev, done: true, loading: false }));
      }
    } finally {
      abortRef.current = null;
    }
  }, [settings]);

  /* ─── Send prompt to both models ─── */
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isActive) return;

    const available = getAvailableProviderModels(settings);
    if (available.length === 0) return;

    const [pickA, pickB] = pickTwoRandom(available);

    const newRound: CurrentRound = {
      prompt: text,
      modelA: pickA.model,
      modelB: pickB.model,
      providerA: pickA.provider,
      providerB: pickB.provider,
      panelA: { content: "", loading: true, done: false },
      panelB: { content: "", loading: true, done: false },
      voted: false,
    };

    setCurrentRound(newRound);
    setInput("");

    const apiKeyA = pickA.provider !== "demo" ? settings.apiKeys[pickA.provider as keyof ApiKeys] || "" : "";
    const apiKeyB = pickB.provider !== "demo" ? settings.apiKeys[pickB.provider as keyof ApiKeys] || "" : "";

    // Stream both panels simultaneously
    streamPanel(
      text,
      pickA.provider,
      pickA.model,
      apiKeyA,
      abortARef,
      (updater) => setCurrentRound((prev) => prev ? { ...prev, panelA: updater(prev.panelA) } : prev),
    );

    streamPanel(
      text,
      pickB.provider,
      pickB.model,
      apiKeyB,
      abortBRef,
      (updater) => setCurrentRound((prev) => prev ? { ...prev, panelB: updater(prev.panelB) } : prev),
    );
  }, [input, isActive, settings, streamPanel]);

  /* ─── Vote ─── */
  const handleVote = useCallback((winner: "A" | "B" | "tie") => {
    if (!currentRound || currentRound.voted) return;

    // Extract code blocks from winning response
    const winnerContent = winner === "A" ? currentRound.panelA.content :
                          winner === "B" ? currentRound.panelB.content :
                          currentRound.panelA.content; // On tie, check A
    const blocks = extractCodeBlocks(winnerContent);
    for (const block of blocks) {
      onCodeGenerated(block.filename, block.code, block.language);
    }
    // Also check other panel on tie
    if (winner === "tie") {
      const blocksB = extractCodeBlocks(currentRound.panelB.content);
      for (const block of blocksB) {
        onCodeGenerated(block.filename, block.code, block.language);
      }
    }

    setCurrentRound((prev) => prev ? { ...prev, voted: true, winner } : prev);
    setRounds((prev) => [...prev, {
      modelA: currentRound.modelA,
      modelB: currentRound.modelB,
      providerA: currentRound.providerA,
      providerB: currentRound.providerB,
      winner,
    }]);
    setScores((prev) => ({
      a: prev.a + (winner === "A" ? 1 : 0),
      b: prev.b + (winner === "B" ? 1 : 0),
      ties: prev.ties + (winner === "tie" ? 1 : 0),
    }));
  }, [currentRound, onCodeGenerated]);

  /* ─── Next Round ─── */
  const handleNextRound = useCallback(() => {
    abortARef.current?.abort();
    abortBRef.current?.abort();
    setCurrentRound(null);
    inputRef.current?.focus();
  }, []);

  /* ─── Keyboard ─── */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ─── Model label lookup ─── */
  const getModelLabel = (provider: string, model: string): string => {
    const prov = PROVIDERS.find((p: { id: string }) => p.id === provider);
    const m = prov?.models.find((md: { id: string; name: string }) => md.id === model);
    const provLabel = prov?.name || provider;
    const modelLabel = m?.name || model;
    return `${modelLabel} (${provLabel})`;
  };

  const totalRounds = rounds.length;
  const revealed = currentRound?.voted ?? false;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ─── Arena Header ─── */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-border bg-gradient-to-r from-accent/10 to-danger/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{"\u2694\uFE0F"} Arena Mode</span>
          {totalRounds > 0 && (
            <span className="text-[10px] font-mono text-muted">
              Rounds: {totalRounds}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {totalRounds > 0 && (
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-accent-light">A:{scores.a}</span>
              <span className="text-muted">|</span>
              <span className="text-danger">B:{scores.b}</span>
              <span className="text-muted">|</span>
              <span className="text-warning">T:{scores.ties}</span>
            </div>
          )}
          {currentRound?.voted && (
            <button
              onClick={handleNextRound}
              className="px-3 py-1 rounded text-[10px] font-mono text-accent-light bg-accent/10 hover:bg-accent/20 border border-accent/30 cursor-pointer"
            >
              Next Round
            </button>
          )}
        </div>
      </div>

      {/* ─── Prompt display (when round is active) ─── */}
      {currentRound && (
        <div className="px-4 py-2 border-b border-border bg-surface/30 shrink-0">
          <div className="text-[9px] font-mono text-muted mb-1">PROMPT</div>
          <div className="text-xs text-foreground font-mono truncate">{currentRound.prompt}</div>
        </div>
      )}

      {/* ─── Side-by-side panels ─── */}
      <div className="flex-1 flex gap-2 p-2 min-h-0">
        {currentRound ? (
          <>
            <ResponsePanel
              label="Model A"
              panel={currentRound.panelA}
              revealed={revealed}
              actualModel={getModelLabel(currentRound.providerA, currentRound.modelA)}
              isWinner={currentRound.winner === "A"}
            />
            <ResponsePanel
              label="Model B"
              panel={currentRound.panelB}
              revealed={revealed}
              actualModel={getModelLabel(currentRound.providerB, currentRound.modelB)}
              isWinner={currentRound.winner === "B"}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <div className="text-4xl mb-3">{"\u2694\uFE0F"}</div>
              <div className="text-sm text-muted font-mono">Blind Arena Comparison</div>
              <div className="text-[10px] text-muted/60 mt-2 max-w-xs">
                Send a prompt below. Two randomly-selected models will compete head-to-head.
                Vote for the best response, then reveal who won.
              </div>
              {totalRounds > 0 && (
                <div className="mt-4 text-[10px] font-mono text-muted/80">
                  {totalRounds} round{totalRounds !== 1 ? "s" : ""} completed
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Vote buttons (after both done) ─── */}
      {canVote && (
        <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-border bg-surface/50 shrink-0">
          <button
            onClick={() => handleVote("A")}
            className="px-5 py-2.5 rounded-lg text-sm font-mono font-semibold bg-accent/15 text-accent-light border border-accent/30 hover:bg-accent/25 hover:border-accent/50 cursor-pointer transition-colors"
          >
            {"\uD83D\uDC48"} A is Better
          </button>
          <button
            onClick={() => handleVote("tie")}
            className="px-5 py-2.5 rounded-lg text-sm font-mono font-semibold bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 hover:border-warning/50 cursor-pointer transition-colors"
          >
            {"\uD83E\uDD1D"} Tie
          </button>
          <button
            onClick={() => handleVote("B")}
            className="px-5 py-2.5 rounded-lg text-sm font-mono font-semibold bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 hover:border-danger/50 cursor-pointer transition-colors"
          >
            B is Better {"\uD83D\uDC49"}
          </button>
        </div>
      )}

      {/* ─── Tie reveal bar ─── */}
      {revealed && currentRound?.winner === "tie" && (
        <div className="flex items-center justify-center px-4 py-2 border-t border-border bg-warning/5 shrink-0">
          <span className="text-[10px] font-mono text-warning">
            {"\uD83E\uDD1D"} Tie &mdash; {getModelLabel(currentRound.providerA, currentRound.modelA)} vs {getModelLabel(currentRound.providerB, currentRound.modelB)}
          </span>
        </div>
      )}

      {/* ─── Round history (compact) ─── */}
      {rounds.length > 0 && !currentRound && (
        <div className="px-4 py-2 border-t border-border bg-surface/30 shrink-0 max-h-28 overflow-y-auto">
          <div className="text-[9px] font-mono text-muted mb-1">HISTORY</div>
          <div className="space-y-1">
            {rounds.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                <span className="text-muted">R{i + 1}</span>
                <span className={r.winner === "A" ? "text-success" : "text-muted/60"}>
                  {getModelLabel(r.providerA, r.modelA)}
                </span>
                <span className="text-muted">vs</span>
                <span className={r.winner === "B" ? "text-success" : "text-muted/60"}>
                  {getModelLabel(r.providerB, r.modelB)}
                </span>
                <span className="text-muted">&rarr;</span>
                <span className={
                  r.winner === "A" ? "text-accent-light" :
                  r.winner === "B" ? "text-danger" :
                  "text-warning"
                }>
                  {r.winner === "tie" ? "Tie" : r.winner === "A" ? "A wins" : "B wins"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Input bar ─── */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-border bg-surface/50 shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isActive ? "Round in progress..." : "Send a prompt to the arena..."}
          className="flex-1 bg-transparent text-foreground text-xs font-mono resize-none outline-none min-h-[32px] max-h-24 py-2"
          rows={1}
          disabled={!!isActive}
        />
        <button
          onClick={handleSend}
          disabled={!!isActive || !input.trim()}
          className={`shrink-0 px-4 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${
            isActive || !input.trim()
              ? "text-muted/30 cursor-not-allowed"
              : "text-accent-light bg-accent/10 hover:bg-accent/20 border border-accent/30"
          }`}
        >
          Send
        </button>
      </div>
    </div>
  );
}
