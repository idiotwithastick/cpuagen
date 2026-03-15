"use client";

import { useState, useEffect, useCallback } from "react";

interface PsiState {
  cycle: number;
  S: number;
  delta_H_sem: number;
  S_CTS: number;
  psi_coherence: number;
  phi_phase: number;
  I_truth: number;
  E_meta: number;
  R_curv: number;
  lambda_flow: number;
  beta_T: number;
  kappa: number;
  sigma_noise: number;
  alpha: number;
  delta_S_adaptation: number;
  x?: number[];
  v?: number[];
  theta?: number[];
  time: number;
}

interface TeepEntry {
  id: string;
  sig: string;
  allSafe: boolean;
  content_hash: string;
  content: string;
  input_hash: string;
  created: number;
  hits: number;
  semanticMass: number;
  resonanceStrength: number;
}

interface EngineSnapshot {
  version: string;
  timestamp: number;
  psiState: PsiState;
  fisherWeights: Record<string, number>;
  morphicFieldStrength: number;
  totalResonanceEvents: number;
  counters: {
    teepCounter: number;
    cacheHits: number;
    cacheMisses: number;
    agfFullHits: number;
    agfBasinHits: number;
    agfJitSolves: number;
    agfApiCallsAvoided: number;
  };
  teeps: TeepEntry[];
}

function Gauge({ label, value, max, color, unit }: { label: string; value: number; max: number; color: string; unit?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted font-mono uppercase">{label}</span>
        <span className={`text-xs font-mono font-bold ${color}`}>
          {typeof value === "number" ? value.toFixed(4) : value}{unit || ""}
        </span>
      </div>
      <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color.replace("text-", "bg-")}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3 text-center">
      <div className={`text-lg font-bold font-mono ${color || "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-muted font-mono uppercase mt-0.5">{label}</div>
      {sub && <div className="text-[9px] text-muted/60 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTeep, setSelectedTeep] = useState<TeepEntry | null>(null);
  const [teepFilter, setTeepFilter] = useState("");
  const [tab, setTab] = useState<"overview" | "teeps" | "fisher" | "psi" | "manifold" | "geometry" | "enforcement" | "lab" | "search">("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; content: string; distance: number; signature: { S: number; phi: number; I_truth: number } }[]>([]);
  const [searchSig, setSearchSig] = useState<{ n: number; S: number; dS: number; phi: number; I_truth: number; psi_coherence: number } | null>(null);
  const [searching, setSearching] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [engineData, setEngineData] = useState<any>(null);
  const [labInput, setLabInput] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [labResult, setLabResult] = useState<any>(null);
  const [labLoading, setLabLoading] = useState(false);
  const [ensembleInputs, setEnsembleInputs] = useState([
    { provider: "claude", content: "" },
    { provider: "gpt", content: "" },
    { provider: "gemini", content: "" },
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ensembleResult, setEnsembleResult] = useState<any>(null);
  const [ensembleLoading, setEnsembleLoading] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/teep");
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
        setError("");
      } else {
        setError(data.error || "Failed to fetch engine state");
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  const fetchEngine = useCallback(async () => {
    try {
      const res = await fetch("/api/engine");
      const data = await res.json();
      if (data.ok) setEngineData(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    fetchEngine();
  }, [fetchSnapshot, fetchEngine]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchSnapshot, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSnapshot]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted">Loading engine state...</p>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-2xl mb-3">{"\u{1F4CA}"}</p>
          <p className="text-danger text-sm font-medium mb-1">Engine State Unavailable</p>
          <p className="text-xs text-muted mb-3">{error || "The physics engine hasn\u0027t responded yet."}</p>
          <p className="text-[10px] text-muted/70 mb-4">
            The Dashboard shows real-time metrics from the CPUAGEN engine —
            validation scores, adaptive weights, knowledge cache, and more.
            It updates automatically once the engine is running.
          </p>
          <button onClick={fetchSnapshot} className="px-4 py-2 text-xs bg-accent/10 text-accent-light rounded-lg hover:bg-accent/20">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { psiState: psi, counters, fisherWeights, teeps } = snapshot;
  const totalCacheOps = counters.cacheHits + counters.cacheMisses;
  const hitRate = totalCacheOps > 0 ? ((counters.cacheHits / totalCacheOps) * 100).toFixed(1) : "0.0";
  const totalAgf = counters.agfFullHits + counters.agfBasinHits + counters.agfJitSolves;

  const filteredTeeps = teeps.filter((t) =>
    !teepFilter || t.content.toLowerCase().includes(teepFilter.toLowerCase()) || t.id.toLowerCase().includes(teepFilter.toLowerCase())
  );

  const fisherEntries = Object.entries(fisherWeights).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">CPUAGEN Engine Dashboard</h1>
          <p className="text-xs text-muted mt-0.5">
            v{snapshot.version} | Cycle {psi.cycle} | {teeps.length} cached entries | {new Date(snapshot.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 text-[10px] rounded-lg border transition-colors ${
              autoRefresh
                ? "bg-success/10 text-success border-success/20"
                : "bg-surface text-muted border-border hover:text-foreground"
            }`}
          >
            {autoRefresh ? "LIVE" : "PAUSED"}
          </button>
          <button
            onClick={fetchSnapshot}
            className="px-3 py-1.5 text-[10px] rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-light transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-6 pt-3">
        {(["overview", "teeps", "search", "fisher", "psi", "manifold", "geometry", "enforcement", "lab"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === t
                ? "bg-accent/20 text-accent-light border border-accent/30"
                : "text-muted hover:text-foreground hover:bg-surface-light"
            }`}
          >
            {t === "overview" ? "Overview" : t === "teeps" ? `Knowledge (${teeps.length})` : t === "search" ? "\uD83D\uDD0D Search" : t === "fisher" ? "Adaptive Weights" : t === "psi" ? "Engine State" : t === "manifold" ? "Coverage" : t === "geometry" ? "Geometry" : t === "enforcement" ? "Validation" : "Lab"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Top stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatCard label="Cycle" value={psi.cycle} color="text-accent-light" />
              <StatCard label="Cache Hit Rate" value={`${hitRate}%`} sub={`${counters.cacheHits}/${totalCacheOps}`} color="text-success" />
              <StatCard label="Cache Hits" value={counters.agfFullHits} color="text-success" />
              <StatCard label="Near Matches" value={counters.agfBasinHits} color="text-warning" />
              <StatCard label="Fresh Inferences" value={counters.agfJitSolves} color="text-accent-light" />
              <StatCard label="API Calls Saved" value={counters.agfApiCallsAvoided} color="text-success" />
            </div>

            {/* Core metrics */}
            <div>
              <h2 className="text-sm font-medium mb-3">Core Engine State</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Gauge label="Information Score" value={psi.S} max={10} color="text-accent-light" />
                <Gauge label="Coherence" value={psi.psi_coherence} max={1} color="text-success" />
                <Gauge label="Truth Score" value={psi.I_truth} max={1} color="text-warning" />
                <Gauge label="Complexity" value={psi.R_curv} max={5} color="text-accent-light" />
                <Gauge label="Semantic Delta" value={psi.delta_H_sem} max={1} color="text-danger" />
                <Gauge label="Phase Alignment" value={psi.phi_phase} max={6.283} color="text-success" />
                <Gauge label="Balance" value={psi.beta_T} max={2} color="text-warning" />
                <Gauge label="Flow Rate" value={psi.lambda_flow} max={1} color="text-accent-light" />
                <Gauge label="Noise Level" value={psi.sigma_noise} max={1} color="text-muted" />
              </div>
            </div>

            {/* Morphic field */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface border border-border rounded-lg p-4">
                <div className="text-[10px] text-muted font-mono uppercase mb-1">Knowledge Density</div>
                <div className="text-2xl font-bold font-mono text-accent-light">{(snapshot.morphicFieldStrength ?? 0).toFixed(4)}</div>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4">
                <div className="text-[10px] text-muted font-mono uppercase mb-1">Total Convergence Events</div>
                <div className="text-2xl font-bold font-mono text-warning">{snapshot.totalResonanceEvents}</div>
              </div>
            </div>

            {/* Top TEEPs preview */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium">Top Cached Entries by Relevance</h2>
                <button onClick={() => setTab("teeps")} className="text-[10px] text-accent-light hover:underline">
                  View all
                </button>
              </div>
              <div className="space-y-2">
                {teeps.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    onClick={() => { setSelectedTeep(t); setTab("teeps"); }}
                    className="bg-surface border border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-accent/30 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full ${t.allSafe ? "bg-success" : "bg-danger"}`} />
                    <span className="text-[10px] font-mono text-muted w-24 shrink-0">{t.id}</span>
                    <span className="text-xs text-foreground flex-1 truncate">{t.content.slice(0, 80)}</span>
                    <span className="text-[10px] font-mono text-accent-light">{(t.semanticMass ?? 0).toFixed(2)}</span>
                    <span className="text-[10px] font-mono text-muted">{t.hits} hits</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "teeps" && (
          <div className="space-y-4">
            {/* Search */}
            <input
              value={teepFilter}
              onChange={(e) => setTeepFilter(e.target.value)}
              placeholder="Search knowledge cache by ID or content..."
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none font-mono"
            />

            <div className="flex gap-4">
              {/* TEEP list */}
              <div className={`${selectedTeep ? "w-1/2" : "w-full"} space-y-2`}>
                {filteredTeeps.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTeep(t)}
                    className={`bg-surface border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedTeep?.id === t.id ? "border-accent/40 bg-accent/5" : "border-border hover:border-accent/20"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${t.allSafe ? "bg-success" : "bg-danger"}`} />
                      <span className="text-[10px] font-mono text-accent-light">{t.id}</span>
                      <span className="text-[10px] font-mono text-muted ml-auto">weight: {(t.semanticMass ?? 0).toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-foreground truncate">{t.content.slice(0, 120)}</p>
                    <div className="flex gap-3 mt-1.5 text-[9px] text-muted font-mono">
                      <span>{t.hits} hits</span>
                      <span>confidence: {(t.resonanceStrength ?? 0).toFixed(3)}</span>
                      <span>{new Date(t.created).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                {filteredTeeps.length === 0 && (
                  <p className="text-center text-sm text-muted py-8">No entries match filter</p>
                )}
              </div>

              {/* TEEP detail panel */}
              {selectedTeep && (
                <div className="w-1/2 bg-surface border border-border rounded-lg p-4 sticky top-0 h-fit max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium font-mono">{selectedTeep.id}</h3>
                    <button
                      onClick={() => setSelectedTeep(null)}
                      className="text-muted hover:text-foreground text-xs"
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] text-muted font-mono uppercase block mb-1">Status</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${selectedTeep.allSafe ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                        {selectedTeep.allSafe ? "ALL CHECKS PASSED" : "VALIDATION FAILED"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted font-mono uppercase block mb-1">Signature</span>
                      <code className="text-[10px] text-accent-light bg-background p-2 rounded block font-mono break-all">
                        {selectedTeep.sig}
                      </code>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-muted font-mono uppercase block mb-0.5">Relevance Weight</span>
                        <span className="text-sm font-bold font-mono text-accent-light">{(selectedTeep.semanticMass ?? 0).toFixed(4)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted font-mono uppercase block mb-0.5">Resonance</span>
                        <span className="text-sm font-bold font-mono text-warning">{(selectedTeep.resonanceStrength ?? 0).toFixed(4)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted font-mono uppercase block mb-0.5">Cache Hits</span>
                        <span className="text-sm font-bold font-mono text-success">{selectedTeep.hits}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted font-mono uppercase block mb-0.5">Created</span>
                        <span className="text-xs font-mono text-muted">{new Date(selectedTeep.created).toLocaleString()}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted font-mono uppercase block mb-1">Content</span>
                      <pre className="text-xs text-foreground bg-background p-3 rounded font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {selectedTeep.content}
                      </pre>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-muted font-mono uppercase block mb-0.5">Content Hash</span>
                        <code className="text-[9px] text-muted font-mono break-all">{selectedTeep.content_hash}</code>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted font-mono uppercase block mb-0.5">Input Hash</span>
                        <code className="text-[9px] text-muted font-mono break-all">{selectedTeep.input_hash}</code>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "search" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-lg font-semibold text-foreground">Knowledge Explorer</h2>
              <span className="text-[10px] font-mono text-muted bg-surface-light px-2 py-0.5 rounded">Semantic Search</span>
            </div>
            <p className="text-xs text-muted">
              Search the knowledge base by semantic meaning. Your query is analyzed and compared against all cached validated responses using adaptive distance metrics.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!searchQuery.trim() || searching) return;
                setSearching(true);
                setSearchResults([]);
                setSearchSig(null);
                try {
                  const res = await fetch("/api/teep/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: searchQuery.trim(), k: 15, maxDistance: 4.0 }),
                  });
                  const data = await res.json();
                  if (data.ok) {
                    setSearchResults(data.results);
                    setSearchSig(data.signature);
                  }
                } catch { /* ignore */ }
                setSearching(false);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search knowledge base by meaning... (e.g., 'machine learning', 'neural network', 'code optimization')"
                className="flex-1 px-4 py-2.5 rounded-lg bg-surface border border-border text-foreground placeholder:text-muted/50 font-mono text-sm focus:outline-none focus:border-accent/50 transition-colors"
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </form>

            {searchSig && (
              <div className="p-3 rounded-lg bg-surface border border-border text-[10px] font-mono">
                <span className="text-muted">Query signature: </span>
                <span className="text-accent-light">n={searchSig.n} | S={searchSig.S} | dS={searchSig.dS} | {"\u03C6"}={searchSig.phi} | I<sub>t</sub>={searchSig.I_truth} | {"\u03C8"}={searchSig.psi_coherence}</span>
                <span className="text-muted ml-3">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</span>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((r, i) => (
                  <div key={r.id} className="p-3 rounded-lg bg-surface border border-border hover:border-accent/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono text-accent-light">{r.id}</span>
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            r.distance < 0.5 ? "bg-success/10 text-success" :
                            r.distance < 1.5 ? "bg-warning/10 text-warning" :
                            "bg-muted/10 text-muted"
                          }`}>
                            d={r.distance}
                          </span>
                          <span className="text-[9px] font-mono text-muted">#{i + 1}</span>
                        </div>
                        <p className="text-xs text-foreground/80 font-mono leading-relaxed break-words">
                          {r.content}
                        </p>
                      </div>
                      <div className="text-right text-[9px] font-mono text-muted shrink-0">
                        <div>S={r.signature.S}</div>
                        <div>{"\u03C6"}={r.signature.phi}</div>
                        <div>I<sub>t</sub>={r.signature.I_truth}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchSig && searchResults.length === 0 && !searching && (
              <div className="text-center py-8 text-muted text-sm">
                No results found within similarity threshold. Try a broader query.
              </div>
            )}
          </div>
        )}

        {tab === "fisher" && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium">Adaptive Validation Weights</h2>
            <p className="text-xs text-muted">
              These weights determine how the engine prioritizes different dimensions of meaning.
              Higher weights indicate dimensions the system is more sensitive to — they self-tune as more queries are processed.
            </p>
            <div className="space-y-2">
              {fisherEntries.map(([key, val]) => {
                const maxWeight = fisherEntries[0]?.[1] || 1;
                const pct = (val / maxWeight) * 100;
                return (
                  <div key={key} className="bg-surface border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-foreground">{key}</span>
                      <span className="text-xs font-mono text-accent-light font-bold">{(val ?? 0).toFixed(6)}</span>
                    </div>
                    <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-light rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {fisherEntries.length === 0 && (
                <p className="text-center text-sm text-muted py-8">No adaptive weights available</p>
              )}
            </div>
          </div>
        )}

        {tab === "psi" && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium">Full Engine State Vector</h2>
            <p className="text-xs text-muted">
              The complete engine state. Each dimension tracks a different aspect of
              the validation and knowledge system.
            </p>

            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-light/50">
                    <th className="text-left px-4 py-2 font-mono text-muted">Dimension</th>
                    <th className="text-right px-4 py-2 font-mono text-muted">Value</th>
                    <th className="text-left px-4 py-2 font-mono text-muted">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["cycle", psi.cycle, "Processing cycle counter"],
                    ["info_score", psi.S, "Information content score"],
                    ["semantic_delta", psi.delta_H_sem, "Semantic change rate"],
                    ["isolation", psi.S_CTS, "Cross-talk suppression"],
                    ["coherence", psi.psi_coherence, "Response coherence"],
                    ["phase", psi.phi_phase, "Phase alignment"],
                    ["truth", psi.I_truth, "Truth confidence"],
                    ["complexity", psi.E_meta, "Cognitive complexity"],
                    ["curvature", psi.R_curv, "Solution space complexity"],
                    ["flow", psi.lambda_flow, "Processing flow rate"],
                    ["balance", psi.beta_T, "System balance"],
                    ["coupling", psi.kappa, "Inter-dimension coupling"],
                    ["noise", psi.sigma_noise, "Noise level"],
                    ["learning_rate", psi.alpha, "Adaptation rate"],
                    ["adaptation", psi.delta_S_adaptation, "Adaptive correction rate"],
                    ["time", psi.time, "Engine uptime"],
                  ].map(([dim, val, desc]) => (
                    <tr key={dim as string} className="border-b border-border/50 hover:bg-surface-light/30">
                      <td className="px-4 py-2 font-mono text-accent-light">{dim as string}</td>
                      <td className="px-4 py-2 font-mono text-right text-foreground">
                        {typeof val === "number" ? (val ?? 0).toFixed(6) : String(val ?? "")}
                      </td>
                      <td className="px-4 py-2 text-muted">{desc as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* State vectors */}
            {(psi.x || psi.v || psi.theta) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {psi.x && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Position Vector (x)</h3>
                    <div className="space-y-1">
                      {psi.x.map((val, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-xs font-mono text-muted">x[{i}]</span>
                          <span className="text-xs font-mono text-foreground">{val.toFixed(6)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {psi.v && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Velocity Vector (v)</h3>
                    <div className="space-y-1">
                      {psi.v.map((val, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-xs font-mono text-muted">v[{i}]</span>
                          <span className="text-xs font-mono text-foreground">{val.toFixed(6)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {psi.theta && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Angle Vector (theta)</h3>
                    <div className="space-y-1">
                      {psi.theta.map((val, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-xs font-mono text-muted">theta[{i}]</span>
                          <span className="text-xs font-mono text-foreground">{val.toFixed(6)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "manifold" && (
          <div className="space-y-6">
            <h2 className="text-sm font-medium">Semantic Manifold Coverage</h2>
            <p className="text-xs text-muted">
              The 5D semantic manifold tracks which regions of knowledge space have been explored.
              Coverage increases as more unique queries are processed and cached as TEEPs.
            </p>

            {engineData?.manifold ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Visited Cells" value={engineData.manifold.visitedCells} color="text-accent-light" />
                  <StatCard label="Total Possible" value={engineData.manifold.totalPossibleCells.toLocaleString()} color="text-muted" />
                  <StatCard label="Coverage" value={`${((engineData.manifold.coverageRatio ?? 0) * 100).toFixed(4)}%`} color="text-success" />
                  <StatCard label="Trajectory Length" value={engineData.manifold.trajectoryLength} color="text-warning" />
                </div>

                {/* Coverage progress bar */}
                <div className="bg-surface border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-muted uppercase">Manifold Exploration Progress</span>
                    <span className="text-xs font-mono text-accent-light font-bold">{((engineData.manifold.coverageRatio ?? 0) * 100).toFixed(4)}%</span>
                  </div>
                  <div className="h-3 bg-surface-light rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-success rounded-full transition-all duration-1000"
                      style={{ width: `${Math.max(0.5, engineData.manifold.coverageRatio * 100)}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-muted/60 mt-1">
                    {engineData.manifold.visitedCells} of {engineData.manifold.totalPossibleCells.toLocaleString()} cells visited in 5D grid
                  </p>
                </div>

                {/* Suggested exploration */}
                {engineData.manifold.suggestedExploration.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Frontier Cells (Suggested Exploration)</h3>
                    <div className="flex flex-wrap gap-2">
                      {engineData.manifold.suggestedExploration.map((cell: string, i: number) => (
                        <span key={i} className="px-2 py-1 text-[10px] font-mono bg-warning/10 text-warning border border-warning/20 rounded">
                          [{cell}]
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Holographic projection */}
                {engineData.holographic?.points?.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">
                      Holographic Boundary Projection ({engineData.holographic.points.length} points)
                    </h3>
                    <p className="text-[9px] text-muted/60 mb-3">
                      12D TEEP signatures projected onto 5D boundary via Fisher-weighted reduction.
                      Axes: {engineData.holographic.axes?.join(", ") || "S, phi, I_truth, psi_coherence, synergy"}
                    </p>
                    {/* 2D Scatter projection */}
                    {(() => {
                      const pts = engineData.holographic.points as Array<{ id?: string; coords: number[]; mass: number }>;
                      const axes = engineData.holographic.axes || ["d0", "d1"];
                      if (pts.length === 0) return null;
                      const xs = pts.map((p) => p.coords[0] || 0);
                      const ys = pts.map((p) => p.coords[1] || 0);
                      const minX = Math.min(...xs), maxX = Math.max(...xs);
                      const minY = Math.min(...ys), maxY = Math.max(...ys);
                      const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
                      const maxMass = Math.max(...pts.map((p) => p.mass), 0.01);
                      return (
                        <div className="relative w-full h-48 bg-background rounded-lg border border-border/30 mb-3 overflow-hidden">
                          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-muted/40">{axes[0]}</div>
                          <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-mono text-muted/40 -rotate-90">{axes[1]}</div>
                          {pts.slice(0, 50).map((pt, i) => {
                            const x = ((pt.coords[0] - minX) / rangeX) * 90 + 5;
                            const y = 95 - ((pt.coords[1] - minY) / rangeY) * 90;
                            const size = 4 + (pt.mass / maxMass) * 8;
                            const opacity = 0.4 + (pt.mass / maxMass) * 0.6;
                            return (
                              <div
                                key={i}
                                className="absolute rounded-full bg-accent"
                                style={{
                                  left: `${x}%`, top: `${y}%`,
                                  width: `${size}px`, height: `${size}px`,
                                  opacity,
                                  transform: "translate(-50%, -50%)",
                                }}
                                title={`${pt.id || `#${i+1}`} — mass: ${(pt.mass ?? 0).toFixed(2)}`}
                              />
                            );
                          })}
                        </div>
                      );
                    })()}

                    <details className="group">
                      <summary className="text-[9px] font-mono text-muted cursor-pointer hover:text-foreground">
                        Show data table ({engineData.holographic.points.length} points)
                      </summary>
                      <div className="overflow-x-auto mt-2">
                        <table className="w-full text-[10px] font-mono">
                          <thead>
                            <tr className="border-b border-border/50">
                              <th className="text-left px-2 py-1 text-muted">#</th>
                              {(engineData.holographic.axes || ["d0", "d1", "d2", "d3", "d4"]).map((a: string) => (
                                <th key={a} className="text-right px-2 py-1 text-muted">{a}</th>
                              ))}
                              <th className="text-right px-2 py-1 text-muted">Mass</th>
                            </tr>
                          </thead>
                          <tbody>
                            {engineData.holographic.points.slice(0, 20).map((pt: { coords: number[]; mass: number }, i: number) => (
                              <tr key={i} className="border-b border-border/30 hover:bg-surface-light/30">
                                <td className="px-2 py-1 text-muted">{i + 1}</td>
                                {pt.coords.map((c: number, j: number) => (
                                  <td key={j} className="text-right px-2 py-1 text-foreground">{(c ?? 0).toFixed(4)}</td>
                                ))}
                                <td className="text-right px-2 py-1 text-accent-light">{(pt.mass ?? 0).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                )}

                {/* Persistence & Trajectory Status */}
                <div className="bg-surface border border-border rounded-lg p-4">
                  <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Trajectory & Persistence</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div>
                      <span className="text-muted">Persistence ready: </span>
                      <span className={engineData.persistReady ? "text-green-400" : "text-muted/50"}>
                        {engineData.persistReady ? "YES" : "NO"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Trajectory points: </span>
                      <span className="text-foreground">{engineData.manifold.trajectoryLength}</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted/60 mt-2">
                    Each query through the Physics Lab records a trajectory point on the manifold.
                    Coverage increases as new grid cells are visited. Persistence commits state to D1 when thresholds are met.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-center text-sm text-muted py-8">Loading manifold data...</p>
            )}
          </div>
        )}

        {tab === "geometry" && (
          <div className="space-y-6">
            <h2 className="text-sm font-medium">Riemannian Geometry</h2>
            <p className="text-xs text-muted">
              Ricci curvature of the semantic manifold and quantum Fisher coherence matrix.
              High curvature indicates dense knowledge regions; off-diagonal Fisher elements indicate correlated dimensions.
            </p>

            {engineData?.ricci ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total Cells" value={engineData.ricci.totalCells} color="text-accent-light" />
                  <StatCard label="Max Curvature" value={(engineData.ricci.maxCurvature ?? 0).toFixed(4)} color="text-success" />
                  <StatCard label="Avg Curvature" value={(engineData.ricci.avgCurvature ?? 0).toFixed(4)} color="text-warning" />
                  <StatCard label="Off-Diag Fisher" value={engineData.fisher?.offDiagonalStrength?.toFixed(4) || "0"} color="text-accent-light" />
                </div>

                {/* Ricci curvature cells */}
                {engineData.ricci.cells.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">
                      Top Ricci Curvature Cells ({engineData.ricci.cells.length})
                    </h3>
                    <div className="space-y-2">
                      {engineData.ricci.cells.slice(0, 15).map((cell: { key: string; teepCount: number; totalMass: number; avgSynergy: number; ricciCurvature: number }, i: number) => {
                        const maxR = engineData.ricci.maxCurvature || 1;
                        const pct = Math.min(100, (cell.ricciCurvature / maxR) * 100);
                        return (
                          <div key={i} className="bg-surface-light/30 rounded p-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono text-muted">[{cell.key}]</span>
                              <div className="flex gap-3 text-[9px] font-mono">
                                <span className="text-muted">{cell.teepCount} TEEPs</span>
                                <span className="text-warning">mass={(cell.totalMass ?? 0).toFixed(1)}</span>
                                <span className="text-success">R={(cell.ricciCurvature ?? 0).toFixed(4)}</span>
                              </div>
                            </div>
                            <div className="h-1 bg-surface-light rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-accent to-warning rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Fisher Information Matrix Heatmap */}
                {engineData.fisher?.matrix?.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">
                      Fisher Information Matrix ({engineData.fisher.matrix.length}x{engineData.fisher.matrix.length})
                    </h3>
                    <p className="text-[9px] text-muted/60 mb-3">
                      Heatmap of the quantum Fisher information matrix g_F(psi). Diagonal = dimension variance. Off-diagonal = coupling strength.
                    </p>
                    {(() => {
                      const dims = ["S", "phi", "I_truth", "nat", "beta_T", "coh", "syn"];
                      const matrix = engineData.fisher.matrix as number[][];
                      const maxVal = Math.max(...matrix.flat().map(Math.abs), 0.001);
                      return (
                        <div className="overflow-x-auto">
                          <table className="border-collapse mx-auto">
                            <thead>
                              <tr>
                                <th className="w-8 h-6" />
                                {dims.slice(0, matrix.length).map((d) => (
                                  <th key={d} className="text-[8px] font-mono text-muted px-0.5 w-8 text-center">{d}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {matrix.map((row: number[], ri: number) => (
                                <tr key={ri}>
                                  <td className="text-[8px] font-mono text-muted pr-1 text-right">{dims[ri] || ri}</td>
                                  {row.map((val: number, ci: number) => {
                                    const intensity = Math.abs(val) / maxVal;
                                    const isDiag = ri === ci;
                                    const bg = isDiag
                                      ? `rgba(139, 92, 246, ${0.15 + intensity * 0.6})`
                                      : val > 0
                                        ? `rgba(34, 197, 94, ${intensity * 0.7})`
                                        : `rgba(239, 68, 68, ${intensity * 0.7})`;
                                    return (
                                      <td
                                        key={ci}
                                        className="w-8 h-8 text-center text-[7px] font-mono border border-border/30"
                                        style={{ backgroundColor: bg }}
                                        title={`${dims[ri] || ri} x ${dims[ci] || ci} = ${(val ?? 0).toFixed(4)}`}
                                      >
                                        {(val ?? 0).toFixed(2)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Fisher correlations */}
                {engineData.fisher?.topCorrelations?.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Top Fisher Metric Correlations</h3>
                    <p className="text-[9px] text-muted/60 mb-3">
                      Off-diagonal elements of the quantum Fisher information matrix.
                      Strong correlations indicate coupled thermodynamic dimensions.
                    </p>
                    <div className="space-y-2">
                      {engineData.fisher.topCorrelations.slice(0, 8).map((c: { dims: [string, string]; value: number }, i: number) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-[10px] font-mono text-accent-light min-w-[120px]">
                            {c.dims[0]} — {c.dims[1]}
                          </span>
                          <div className="flex-1 h-1.5 bg-surface-light rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent-light rounded-full"
                              style={{ width: `${Math.min(100, c.value * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-foreground min-w-[50px] text-right">{(c.value ?? 0).toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {engineData.ricci.cells.length === 0 && engineData.fisher?.topCorrelations?.length === 0 && (
                  <p className="text-center text-sm text-muted py-8">No geometry data yet — process queries to populate the manifold</p>
                )}
              </>
            ) : (
              <p className="text-center text-sm text-muted py-8">Loading geometry data...</p>
            )}
          </div>
        )}

        {tab === "enforcement" && (
          <div className="space-y-6">
            <h2 className="text-sm font-medium">Enforcement Metrics</h2>
            <p className="text-xs text-muted">
              Live metrics from the CPUAGEN validation engine — cache performance, lookup efficiency,
              knowledge density, spatial indexing, and inference acceleration activity.
            </p>

            {engineData?.metrics ? (
              <>
                {/* Core engine info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Engine Version" value={`v${engineData.metrics.version}`} color="text-accent-light" />
                  <StatCard label="Knowledge Cache" value={engineData.metrics.teepLedgerSize} color="text-accent-light" />
                  <StatCard label="Solution Index" value={engineData.metrics.basinIndexSize} color="text-warning" />
                  <StatCard label="Spatial Grid" value={engineData.metrics.spatialGridCells} color="text-muted" />
                </div>

                {/* Cache & AGF performance */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <div className="text-[10px] font-mono text-muted uppercase mb-3">Cache Performance</div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-lg font-bold font-mono text-success">{engineData.metrics.cacheHits}</div>
                        <div className="text-[9px] text-muted">Hits</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold font-mono text-danger">{engineData.metrics.cacheMisses}</div>
                        <div className="text-[9px] text-muted">Misses</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold font-mono text-accent-light">{((engineData.metrics.hitRate ?? 0) * 100).toFixed(1)}%</div>
                        <div className="text-[9px] text-muted">Hit Rate</div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 bg-surface-light rounded-full overflow-hidden">
                      <div className="h-full bg-success rounded-full" style={{ width: `${(engineData.metrics.hitRate ?? 0) * 100}%` }} />
                    </div>
                  </div>

                  <div className="bg-surface border border-border rounded-lg p-4">
                    <div className="text-[10px] font-mono text-muted uppercase mb-3">AGF Protocol</div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold font-mono text-success">{engineData.metrics.agf?.fullHits ?? 0}</div>
                        <div className="text-[9px] text-muted">Full Hits</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold font-mono text-warning">{engineData.metrics.agf?.basinHits ?? 0}</div>
                        <div className="text-[9px] text-muted">Basin Hits</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold font-mono text-accent-light">{engineData.metrics.agf?.jitSolves ?? 0}</div>
                        <div className="text-[9px] text-muted">JIT Solves</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold font-mono text-success">{engineData.metrics.agf?.apiCallsAvoided ?? 0}</div>
                        <div className="text-[9px] text-muted">API Calls Saved</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] font-mono text-center text-muted">
                      AGF hit rate: <span className="text-accent-light">{((engineData.metrics.agf?.hitRate ?? 0) * 100).toFixed(1)}%</span>
                      {" | "}{engineData.metrics.agf?.totalLookups ?? 0} total lookups
                    </div>
                  </div>
                </div>

                {/* Morphic resonance */}
                {engineData.metrics.morphic && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <div className="text-[10px] font-mono text-muted uppercase mb-3">Morphic Resonance Field</div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                      <div>
                        <div className="text-sm font-bold font-mono text-accent-light">{(engineData.metrics.morphic.fieldStrength ?? 0).toFixed(4)}</div>
                        <div className="text-[9px] text-muted">Field Strength</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-warning">{engineData.metrics.morphic.resonanceEvents ?? 0}</div>
                        <div className="text-[9px] text-muted">Resonance Events</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-success">{(engineData.metrics.morphic.basinThreshold ?? 0).toFixed(4)}</div>
                        <div className="text-[9px] text-muted">Basin Threshold</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-accent-light">{(engineData.metrics.morphic.totalSemanticMass ?? 0).toFixed(2)}</div>
                        <div className="text-[9px] text-muted">Total Mass</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-warning">{(engineData.metrics.morphic.heaviestTeepMass ?? 0).toFixed(4)}</div>
                        <div className="text-[9px] text-muted">Heaviest TEEP</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Holographic spatial index */}
                {engineData.metrics.holographic && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <div className="text-[10px] font-mono text-muted uppercase mb-3">Holographic Spatial Index (v14.0)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                      <div>
                        <div className="text-sm font-bold font-mono text-accent-light">{engineData.metrics.holographic.holoGridCells ?? 0}</div>
                        <div className="text-[9px] text-muted">Grid Cells</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-success">{engineData.metrics.holographic.holoLookupHits ?? 0}</div>
                        <div className="text-[9px] text-muted">Lookup Hits</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-danger">{engineData.metrics.holographic.holoLookupMisses ?? 0}</div>
                        <div className="text-[9px] text-muted">Lookup Misses</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-warning">{((engineData.metrics.holographic.holoHitRate ?? 0) * 100).toFixed(1)}%</div>
                        <div className="text-[9px] text-muted">Hit Rate</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] font-mono text-center text-muted">
                      Boundary TEEPs: {engineData.metrics.holographic.boundaryTeeps ?? 0}
                      {" | "}Cell reduction: {engineData.metrics.holographic.cellReduction ?? "—"}
                    </div>
                  </div>
                )}

                {/* Innovation metrics */}
                {engineData.metrics.innovations && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <div className="text-[10px] font-mono text-muted uppercase mb-3">Innovation Metrics (v13.0+)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                      <div>
                        <div className="text-sm font-bold font-mono text-accent-light">{engineData.metrics.innovations.bifurcationEvents ?? 0}</div>
                        <div className="text-[9px] text-muted">Bifurcation Events</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-warning">{engineData.metrics.innovations.machDiamondCount ?? 0}</div>
                        <div className="text-[9px] text-muted">Mach Diamonds</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-success">{engineData.metrics.innovations.trajectoryLength ?? 0}</div>
                        <div className="text-[9px] text-muted">Trajectory Points</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold font-mono text-accent-light">{engineData.metrics.cannon?.firings ?? 0}</div>
                        <div className="text-[9px] text-muted">Cannon Firings</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent TEEPs feed */}
                {engineData.recentTeeps?.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <div className="text-[10px] font-mono text-muted uppercase mb-3">Recent Solved Basins (State Vectors)</div>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {engineData.recentTeeps.map((teep: { id: string; hash: string; created: number; hits: number; semanticMass: number; resonanceStrength: number; sig: { n: number; S: number; dS: number; phi: number; I_truth: number; naturality: number; beta_T: number; psi_coherence: number; synergy: number; Q_quality: number; trigram_hash: number } }) => (
                        <div key={teep.id} className="py-2 border-b border-border last:border-0">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-accent-light">{teep.id}</span>
                            <span className="text-muted">
                              hits={teep.hits}
                              {teep.semanticMass != null && <>{" | "}m<sub>s</sub>={(teep.semanticMass ?? 0).toFixed(3)}</>}
                              {(teep.resonanceStrength ?? 0) > 0 && <>{" | "}R={(teep.resonanceStrength ?? 0).toFixed(3)}</>}
                            </span>
                          </div>
                          <div className="mt-1 grid grid-cols-4 gap-x-3 gap-y-0.5 text-[9px] font-mono">
                            <span className="text-blue-400/80">n={teep.sig.n}</span>
                            <span className="text-green-400/80">S={teep.sig.S}</span>
                            <span className={teep.sig.dS < 0 ? "text-green-400/80" : "text-red-400/80"}>dS={teep.sig.dS}</span>
                            <span className="text-accent-light/80">{"\u03C6"}={teep.sig.phi}</span>
                            <span className={teep.sig.I_truth >= 0.3 ? "text-green-400/80" : "text-red-400/80"}>I<sub>t</sub>={teep.sig.I_truth}</span>
                            <span className={teep.sig.naturality >= 0.2 ? "text-green-400/80" : "text-red-400/80"}>nat={teep.sig.naturality}</span>
                            <span className={Math.abs(teep.sig.beta_T - 1) < 0.5 ? "text-green-400/80" : "text-yellow-400/80"}>{"\u03B2"}<sub>T</sub>={teep.sig.beta_T}</span>
                            <span className={teep.sig.psi_coherence >= 0.1 ? "text-green-400/80" : "text-red-400/80"}>{"\u03C8"}<sub>c</sub>={teep.sig.psi_coherence}</span>
                            <span className={teep.sig.synergy >= 0.5 ? "text-green-400/80" : "text-red-400/80"}>syn={teep.sig.synergy}</span>
                            <span className="text-muted/60">Q={teep.sig.Q_quality}</span>
                            <span className="text-muted/40 col-span-2">hash={teep.sig.trigram_hash}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Export / Import */}
                <div className="bg-surface border border-border rounded-lg p-4">
                  <div className="text-[10px] font-mono text-muted uppercase mb-3">Engine State Persistence</div>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/teep");
                          const data = await res.json();
                          if (data.ok) {
                            const blob = new Blob([JSON.stringify(data.snapshot, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `cpuagen-engine-state-${new Date().toISOString().slice(0, 10)}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }
                        } catch { /* ignore */ }
                      }}
                      className="px-4 py-2 text-xs font-medium bg-accent/10 text-accent-light border border-accent/20 rounded-lg hover:bg-accent/20 cursor-pointer"
                    >
                      Export Engine State
                    </button>
                    <label className="px-4 py-2 text-xs font-medium bg-surface-light text-muted border border-border rounded-lg hover:text-foreground cursor-pointer">
                      Import Engine State
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const text = await file.text();
                            const snapshot = JSON.parse(text);
                            const res = await fetch("/api/teep", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ snapshot }),
                            });
                            const data = await res.json();
                            if (data.ok) {
                              fetchEngine();
                              fetchSnapshot();
                            }
                          } catch { /* ignore */ }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-[9px] text-muted/60 mt-2">
                    Export saves engine state, adaptive weights, knowledge density, and top 100 cached entries as JSON.
                    Import restores a previously exported state.
                  </p>
                </div>

                <div className="bg-surface/50 border border-border rounded-lg p-4">
                  <p className="text-xs text-muted leading-relaxed">
                    The Validation tab shows live operational metrics from the CPUAGEN engine.
                    Cache hits avoid redundant computation. Knowledge lookups match queries to previously validated solutions.
                    Knowledge density increases as the system accumulates repeated patterns.
                    Spatial indexing provides instant nearest-neighbor lookup across the knowledge base.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-center text-sm text-muted py-8">Loading enforcement metrics...</p>
            )}
          </div>
        )}

        {tab === "lab" && (
          <div className="space-y-6">
            <h2 className="text-sm font-medium">Validation Lab — Inference Pipeline</h2>
            <p className="text-xs text-muted">
              Enter any text to see the full CPUAGEN pipeline: semantic signature extraction,
              multi-barrier safety validation, 3-stage accelerated inference compression,
              optimal information compression, and multi-dimensional encoding.
            </p>

            {/* Input */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <textarea
                value={labInput}
                onChange={(e) => setLabInput(e.target.value)}
                placeholder="Enter text to analyze through the SSD-RCI physics pipeline..."
                className="w-full bg-transparent text-foreground text-sm font-mono resize-none outline-none min-h-[60px] placeholder:text-muted/50"
                rows={3}
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={async () => {
                    if (!labInput.trim() || labLoading) return;
                    setLabLoading(true);
                    try {
                      const res = await fetch("/api/engine", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: labInput }),
                      });
                      const data = await res.json();
                      if (data.ok) setLabResult(data);
                    } catch { /* ignore */ }
                    setLabLoading(false);
                  }}
                  disabled={!labInput.trim() || labLoading}
                  className="px-4 py-2 text-xs font-medium bg-accent/10 text-accent-light border border-accent/20 rounded-lg hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {labLoading ? "Processing..." : "Run Pipeline"}
                </button>
              </div>
            </div>

            {labResult && (
              <>
                {/* Thermosolve Signature */}
                <div className="bg-surface border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-mono text-muted uppercase">Thermosolve Signature</h3>
                    <button
                      onClick={() => { navigator.clipboard.writeText(JSON.stringify(labResult.signature, null, 2)); }}
                      className="text-[9px] font-mono text-muted hover:text-foreground px-2 py-0.5 rounded bg-surface-light/50 hover:bg-surface-light transition-colors"
                    >
                      Copy JSON
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {Object.entries(labResult.signature).map(([key, val]) => (
                      <div key={key} className="bg-surface-light/50 rounded p-2 text-center">
                        <div className="text-xs font-mono font-bold text-foreground">{typeof val === "number" ? (val as number).toFixed(4) : String(val)}</div>
                        <div className="text-[9px] font-mono text-muted">{key}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CBF Results */}
                <div className="bg-surface border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-[10px] font-mono text-muted uppercase">Control Barrier Functions</h3>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${labResult.cbf.allSafe ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                      {labResult.cbf.allSafe ? "ALL SAFE" : "BLOCKED"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
                    {labResult.cbf.barriers.map((b: { name: string; safe: boolean; value: number }) => (
                      <div key={b.name} className={`rounded p-2 text-center border ${b.safe ? "bg-success/5 border-success/20" : "bg-danger/5 border-danger/20"}`}>
                        <div className={`text-xs font-mono font-bold ${b.safe ? "text-success" : "text-danger"}`}>
                          {b.safe ? "\u2713" : "\u2717"}
                        </div>
                        <div className="text-[9px] font-mono text-muted">{b.name}</div>
                        <div className="text-[8px] font-mono text-muted/60">{(b.value ?? 0).toFixed(3)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Semantic Cannon — 3 stages */}
                <div className="bg-surface border border-border rounded-lg p-4">
                  <h3 className="text-[10px] font-mono text-muted uppercase mb-3">Semantic Cannon Pipeline</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { stage: labResult.cannon.stage1, label: "Stage 1: Cannon Fire", desc: "Golden conjugate entropy compression", color: "text-warning" },
                      { stage: labResult.cannon.stage2, label: "Stage 2: Cavitation", desc: "Semantic vacuum via golden collapse", color: "text-accent-light" },
                      { stage: labResult.cannon.stage3, label: "Stage 3: Mach Diamond", desc: "Flux lock — standing wave", color: "text-success" },
                    ].map(({ stage, label, desc, color }) => (
                      <div key={label} className="bg-surface-light/30 rounded-lg p-3 border border-border/50">
                        <div className={`text-xs font-bold font-mono ${color} mb-0.5`}>{label}</div>
                        <div className="text-[9px] text-muted mb-2">{desc}</div>
                        <div className="space-y-1 text-[10px] font-mono">
                          <div className="flex justify-between"><span className="text-muted">S</span><span className="text-foreground">{(stage.S ?? 0).toFixed(4)}</span></div>
                          <div className="flex justify-between"><span className="text-muted">phi</span><span className="text-foreground">{(stage.phi ?? 0).toFixed(4)}</span></div>
                          {stage.dS !== undefined && <div className="flex justify-between"><span className="text-muted">dS</span><span className={stage.dS === 0 ? "text-success font-bold" : "text-foreground"}>{stage.dS}</span></div>}
                          <div className="flex justify-between"><span className="text-muted">resonance</span><span className={`${color} font-bold`}>{(stage.resonance ?? 0).toFixed(2)}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[9px] text-muted/60 text-center">
                    Entropy: {(labResult.signature.S ?? 0).toFixed(4)} → {(labResult.cannon.stage1.S ?? 0).toFixed(4)} → {(labResult.cannon.stage2.S ?? 0).toFixed(4)} → {(labResult.cannon.stage3.S ?? 0).toFixed(4)} (flux locked at dS=0)
                  </div>
                </div>

                {/* Bekenstein + Holographic */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Bekenstein Compression</h3>
                    <p className="text-[9px] text-muted/60 mb-2">S_max = 2piRE — information bounded by Bekenstein limit</p>
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between"><span className="text-muted">S (compressed)</span><span className="text-foreground">{(labResult.bekenstein.S ?? 0).toFixed(4)}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Energy</span><span className="text-foreground">{(labResult.bekenstein.energy ?? 0).toFixed(4)}</span></div>
                    </div>
                  </div>
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Holographic Boundary</h3>
                    <p className="text-[9px] text-muted/60 mb-2">12D → 5D Fisher-weighted projection</p>
                    <div className="flex gap-2 mb-1">
                      {labResult.holographic.boundary.map((v: number, i: number) => (
                        <div key={i} className="flex-1 bg-surface-light/50 rounded p-1.5 text-center">
                          <div className="text-[10px] font-mono text-foreground">{(v ?? 0).toFixed(3)}</div>
                          <div className="text-[8px] text-muted">d{i}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[9px] font-mono text-muted text-center">
                      reconstruction error: {(labResult.holographic.reconstructionError ?? 0).toFixed(6)}
                    </div>
                  </div>
                </div>

                {/* Holographic Decode Round-Trip */}
                {labResult.decoded && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Holographic Decode (Round-Trip)</h3>
                    <p className="text-[9px] text-muted/60 mb-2">5D boundary → recovered semantic coordinates</p>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      {Object.entries(labResult.decoded).map(([k, v]: [string, unknown]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-muted">{k}</span>
                          <span className="text-foreground">{typeof v === "number" ? (v as number).toFixed(4) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mach Diamond Detection */}
                {labResult.machDiamonds && labResult.machDiamonds.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Mach Diamond Detection</h3>
                    <p className="text-[9px] text-muted/60 mb-2">Resonance stability patterns found</p>
                    <div className="space-y-1">
                      {labResult.machDiamonds.map((d: { key: string; strength: number; location: string }, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-accent">◇</span>
                          <span className="text-foreground">{d.key}</span>
                          <span className="text-muted">@ {d.location}</span>
                          <span className="ml-auto text-accent">{((d.strength ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TEEP Chain Trace */}
                {labResult.chain && labResult.chain.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">TEEP Chain Trace</h3>
                    <p className="text-[9px] text-muted/60 mb-2">Causal DAG from this TEEP</p>
                    <div className="space-y-1">
                      {labResult.chain.map((t: { id: string; direction: string }, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono">
                          <span className={t.direction === "forward" ? "text-green-400" : "text-blue-400"}>
                            {t.direction === "forward" ? "→" : "←"}
                          </span>
                          <span className="text-foreground">{t.id}</span>
                          <span className="text-muted/50 text-[9px]">{t.direction}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Similar TEEPs */}
                {labResult.nearestTeeps && labResult.nearestTeeps.length > 0 && (
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Similar TEEPs (Nearest Neighbors)</h3>
                    <div className="space-y-1.5">
                      {labResult.nearestTeeps.map((t: { id: string; content: string; distance: number }, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-accent-light">{t.id}</span>
                          <span className="text-muted truncate flex-1">{t.content}</span>
                          <span className="text-warning shrink-0">d={t.distance}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Persistence Status */}
                <div className="flex items-center gap-2 text-xs font-mono mt-2">
                  <span className="text-muted">Persistence ready:</span>
                  <span className={labResult.persistReady ? "text-green-400" : "text-muted/50"}>
                    {labResult.persistReady ? "YES — state will be committed" : "NO — no pending state"}
                  </span>
                </div>
              </>
            )}

            {/* ── Ensemble Compare ── */}
            <div className="mt-8 pt-6 border-t border-border/50">
              <h2 className="text-sm font-medium mb-1">Ensemble Thermosolve — Multi-Provider Comparison</h2>
              <p className="text-xs text-muted mb-4">
                Enter response text from different providers to compute a consensus thermosolve signature.
                The ensemble measures agreement across providers and identifies outliers.
              </p>
              <div className="space-y-3">
                {ensembleInputs.map((inp, idx) => (
                  <div key={idx} className="bg-surface border border-border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <select
                        value={inp.provider}
                        onChange={(e) => {
                          const next = [...ensembleInputs];
                          next[idx] = { ...next[idx], provider: e.target.value };
                          setEnsembleInputs(next);
                        }}
                        className="bg-surface-light text-foreground text-xs border border-border rounded px-2 py-1 font-mono"
                      >
                        <option value="claude">Claude</option>
                        <option value="gpt">GPT</option>
                        <option value="gemini">Gemini</option>
                        <option value="grok">Grok</option>
                        <option value="llama">Llama</option>
                      </select>
                      {idx >= 2 && (
                        <button
                          onClick={() => setEnsembleInputs(ensembleInputs.filter((_, i) => i !== idx))}
                          className="text-xs text-muted hover:text-red-400 ml-auto cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <textarea
                      value={inp.content}
                      onChange={(e) => {
                        const next = [...ensembleInputs];
                        next[idx] = { ...next[idx], content: e.target.value };
                        setEnsembleInputs(next);
                      }}
                      placeholder={`Paste ${inp.provider}'s response here...`}
                      className="w-full bg-transparent text-foreground text-xs font-mono resize-none outline-none min-h-[40px] placeholder:text-muted/50"
                      rows={2}
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  {ensembleInputs.length < 6 && (
                    <button
                      onClick={() => setEnsembleInputs([...ensembleInputs, { provider: "grok", content: "" }])}
                      className="px-3 py-1.5 text-xs text-muted border border-border/50 rounded-lg hover:bg-surface-light cursor-pointer"
                    >
                      + Add Provider
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const filled = ensembleInputs.filter((i) => i.content.trim());
                      if (filled.length < 2) return;
                      setEnsembleLoading(true);
                      try {
                        const res = await fetch("/api/engine", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ inputs: filled }),
                        });
                        const data = await res.json();
                        if (data.ok) setEnsembleResult(data.ensemble);
                      } catch { /* ignore */ }
                      setEnsembleLoading(false);
                    }}
                    disabled={ensembleInputs.filter((i) => i.content.trim()).length < 2 || ensembleLoading}
                    className="px-4 py-1.5 text-xs font-medium bg-accent/10 text-accent-light border border-accent/20 rounded-lg hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ml-auto"
                  >
                    {ensembleLoading ? "Computing..." : "Run Ensemble"}
                  </button>
                </div>
              </div>

              {/* Ensemble Results */}
              {ensembleResult && (
                <div className="mt-4 space-y-3">
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <h3 className="text-[10px] font-mono text-muted uppercase mb-2">Consensus Signature</h3>
                    <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                      {Object.entries(ensembleResult.consensus || {}).map(([k, v]: [string, unknown]) => (
                        <div key={k} className="bg-surface-light/50 rounded p-2 text-center">
                          <div className="text-foreground">{typeof v === "number" ? (v as number).toFixed(4) : String(v)}</div>
                          <div className="text-[8px] text-muted">{k}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div>
                      <span className="text-muted">Agreement: </span>
                      <span className={ensembleResult.agreement > 0.8 ? "text-green-400" : ensembleResult.agreement > 0.5 ? "text-yellow-400" : "text-red-400"}>
                        {((ensembleResult.agreement ?? 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    {ensembleResult.outliers?.length > 0 && (
                      <div>
                        <span className="text-muted">Outliers: </span>
                        <span className="text-red-400">{ensembleResult.outliers.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
