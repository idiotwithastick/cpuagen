"use client";

import { useState, useRef } from "react";

/* ─── Types ─── */

interface SemanticSignature {
  coherenceScore: number;
  truthScore: number;
  convergenceRate: number;
  informationScore: number;
  naturalLanguageScore: number;
  balanceScore: number;
  coherenceMultiscale: number;
  synergyIndex: number;
  qualityFactor: number;
  errorCount: number;
  particleCount: number;
  energy: number;
  cachedSolution: boolean;
}

interface SafetyValidation {
  allPassed: boolean;
  barriers: { name: string; safe: boolean; value: number }[];
}

interface ValidatedResponse {
  provider: string;
  model: string;
  content: string;
  latencyMs: number;
  semanticSignature: SemanticSignature;
  safetyValidation: SafetyValidation;
}

interface ConsensusResult {
  agreementScore: number;
  outliers: string[];
  consensusSignature: SemanticSignature;
  bestResponse: {
    provider: string;
    model: string;
    combinedScore: number;
  };
  providersQueried: number;
  providersSucceeded: number;
  providersFailed: number;
}

interface ProviderError {
  provider: string;
  model: string;
  error: string;
}

interface ConsensusAPIResponse {
  ok: boolean;
  responses?: ValidatedResponse[];
  consensus?: ConsensusResult;
  providerErrors?: ProviderError[];
  error?: string;
}

/* ─── Helpers ─── */

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function scoreColor(v: number): string {
  if (v >= 0.7) return "text-success";
  if (v >= 0.4) return "text-warning";
  return "text-danger";
}

function agreementLabel(score: number): { text: string; color: string } {
  if (score >= 0.85) return { text: "Strong Consensus", color: "text-success" };
  if (score >= 0.6) return { text: "Moderate Agreement", color: "text-warning" };
  if (score >= 0.3) return { text: "Weak Agreement", color: "text-warning" };
  return { text: "Divergent", color: "text-danger" };
}

/* ─── Component ─── */

export default function ConsensusPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConsensusAPIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Pull API keys from localStorage settings (same as chat page)
      let keys: Record<string, string> = {};
      try {
        const raw = localStorage.getItem("cpuagen-settings");
        if (raw) {
          const settings = JSON.parse(raw);
          if (settings.apiKeys) {
            keys = settings.apiKeys;
          }
        }
      } catch {
        // no keys stored — rely on server env vars
      }

      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), keys }),
      });

      const data: ConsensusAPIResponse = await res.json();

      if (!data.ok) {
        setError(data.error || "Unknown error");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-surface/50 backdrop-blur-xl px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-light">
              <circle cx="12" cy="12" r="3" />
              <circle cx="5" cy="6" r="2" />
              <circle cx="19" cy="6" r="2" />
              <circle cx="5" cy="18" r="2" />
              <circle cx="19" cy="18" r="2" />
              <line x1="7" y1="7" x2="10" y2="10" />
              <line x1="17" y1="7" x2="14" y2="10" />
              <line x1="7" y1="17" x2="10" y2="14" />
              <line x1="17" y1="17" x2="14" y2="14" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Multi-Model Consensus</h1>
            <p className="text-xs text-muted">Query multiple LLM providers in parallel, validate each response, compute agreement</p>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

          {/* Prompt Input */}
          <div className="bg-surface/50 border border-border rounded-xl p-4">
            <label className="text-xs font-medium text-muted uppercase tracking-wider mb-2 block">Prompt</label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
              placeholder="Enter a prompt to send to all available providers..."
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted/50 resize-none focus:outline-none focus:border-accent/40 transition-colors"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-muted font-mono">
                Ctrl+Enter to submit | Uses API keys from Settings + server env
              </span>
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim() || loading}
                className="px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed text-accent-light bg-accent/10 hover:bg-accent/20 border border-accent/30"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-accent-light/30 border-t-accent-light rounded-full animate-spin" />
                    Querying Models...
                  </span>
                ) : (
                  "Query All Models"
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-danger/5 border border-danger/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-danger rounded-full" />
                <span className="text-xs font-medium text-danger">Error</span>
              </div>
              <p className="text-sm text-danger/80">{error}</p>
            </div>
          )}

          {/* Provider Responses */}
          {result?.responses && result.responses.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-muted uppercase tracking-wider">
                Provider Responses ({result.responses.length})
              </h2>

              {result.responses.map((r, i) => {
                const isOutlier = result.consensus?.outliers.includes(r.provider);
                const isBest = result.consensus?.bestResponse.provider === r.provider;

                return (
                  <div
                    key={i}
                    className={`bg-surface/50 border rounded-xl overflow-hidden transition-colors ${
                      isBest
                        ? "border-success/40 ring-1 ring-success/10"
                        : isOutlier
                        ? "border-warning/40 ring-1 ring-warning/10"
                        : "border-border"
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/30">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${r.safetyValidation.allPassed ? "bg-success" : "bg-danger"}`} />
                          <span className="text-sm font-semibold text-foreground">{r.provider}</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted px-2 py-0.5 rounded bg-background border border-border">
                          {r.model}
                        </span>
                        {isBest && (
                          <span className="text-[10px] font-mono font-semibold text-success px-2 py-0.5 rounded bg-success/10 border border-success/20">
                            BEST
                          </span>
                        )}
                        {isOutlier && (
                          <span className="text-[10px] font-mono font-semibold text-warning px-2 py-0.5 rounded bg-warning/10 border border-warning/20">
                            OUTLIER
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Signature Badges */}
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background ${scoreColor(r.semanticSignature.coherenceScore)}`} title="Coherence Score">
                            coh {pct(r.semanticSignature.coherenceScore)}
                          </span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background ${scoreColor(r.semanticSignature.truthScore)}`} title="Truth Score">
                            truth {pct(r.semanticSignature.truthScore)}
                          </span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background ${scoreColor(Math.abs(r.semanticSignature.convergenceRate))}`} title="Convergence Rate">
                            conv {r.semanticSignature.convergenceRate.toFixed(3)}
                          </span>
                        </div>
                        {/* Safety Badge */}
                        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                          r.safetyValidation.allPassed
                            ? "text-success bg-success/10 border border-success/20"
                            : "text-danger bg-danger/10 border border-danger/20"
                        }`}>
                          {r.safetyValidation.allPassed ? "PASS" : "FAIL"}
                        </span>
                        {/* Latency */}
                        <span className="text-[10px] font-mono text-muted">
                          {r.latencyMs}ms
                        </span>
                      </div>
                    </div>

                    {/* Response Content */}
                    <div className="px-4 py-3">
                      <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {r.content}
                      </div>
                    </div>

                    {/* Expanded Signature Details */}
                    <details className="border-t border-border">
                      <summary className="px-4 py-2 text-[10px] font-mono text-muted cursor-pointer hover:text-foreground transition-colors select-none">
                        Semantic Signature Details
                      </summary>
                      <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {([
                          ["Info Score", r.semanticSignature.informationScore],
                          ["Coherence", r.semanticSignature.coherenceScore],
                          ["Truth", r.semanticSignature.truthScore],
                          ["Convergence", r.semanticSignature.convergenceRate],
                          ["Natural Lang.", r.semanticSignature.naturalLanguageScore],
                          ["Balance", r.semanticSignature.balanceScore],
                          ["Multiscale Coh.", r.semanticSignature.coherenceMultiscale],
                          ["Synergy", r.semanticSignature.synergyIndex],
                          ["Quality", r.semanticSignature.qualityFactor],
                          ["Errors", r.semanticSignature.errorCount],
                          ["Tokens", r.semanticSignature.particleCount],
                          ["Energy", r.semanticSignature.energy],
                        ] as [string, number][]).map(([label, val]) => (
                          <div key={label} className="text-[10px] font-mono">
                            <span className="text-muted">{label}: </span>
                            <span className="text-foreground">{typeof val === "number" ? val.toFixed(4) : val}</span>
                          </div>
                        ))}
                        <div className="text-[10px] font-mono">
                          <span className="text-muted">Cached: </span>
                          <span className={r.semanticSignature.cachedSolution ? "text-accent-light" : "text-muted"}>
                            {r.semanticSignature.cachedSolution ? "yes" : "no"}
                          </span>
                        </div>
                        {/* Safety barriers */}
                        {r.safetyValidation.barriers.map((b) => (
                          <div key={b.name} className="text-[10px] font-mono">
                            <span className="text-muted">{b.name}: </span>
                            <span className={b.safe ? "text-success" : "text-danger"}>
                              {b.value.toFixed(3)} {b.safe ? "OK" : "FAIL"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}

          {/* Provider Errors */}
          {result?.providerErrors && result.providerErrors.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted uppercase tracking-wider">
                Failed Providers ({result.providerErrors.length})
              </h2>
              {result.providerErrors.map((e, i) => (
                <div key={i} className="bg-danger/5 border border-danger/20 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 bg-danger/60 rounded-full" />
                    <span className="text-xs font-semibold text-danger">{e.provider}</span>
                    <span className="text-[10px] font-mono text-danger/60">{e.model}</span>
                  </div>
                  <p className="text-[11px] text-danger/70 font-mono">{e.error}</p>
                </div>
              ))}
            </div>
          )}

          {/* Consensus Panel */}
          {result?.consensus && (
            <div className="bg-surface/50 border border-accent/20 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-accent/5">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-light">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                  <h2 className="text-sm font-semibold text-foreground">Consensus Analysis</h2>
                </div>
              </div>

              <div className="px-5 py-4 space-y-5">
                {/* Agreement Score */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted">Agreement Score</span>
                    <span className={`text-sm font-mono font-semibold ${agreementLabel(result.consensus.agreementScore).color}`}>
                      {pct(result.consensus.agreementScore)} &mdash; {agreementLabel(result.consensus.agreementScore).text}
                    </span>
                  </div>
                  <div className="h-2 bg-background rounded-full overflow-hidden border border-border">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        result.consensus.agreementScore >= 0.7
                          ? "bg-success"
                          : result.consensus.agreementScore >= 0.4
                          ? "bg-warning"
                          : "bg-danger"
                      }`}
                      style={{ width: pct(result.consensus.agreementScore) }}
                    />
                  </div>
                </div>

                {/* Best Response + Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-background border border-border rounded-lg p-3">
                    <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Best Response</div>
                    <div className="text-sm font-semibold text-success">{result.consensus.bestResponse.provider}</div>
                    <div className="text-[10px] font-mono text-muted">{result.consensus.bestResponse.model}</div>
                    <div className="text-[10px] font-mono text-muted mt-1">
                      Combined score: <span className="text-foreground">{result.consensus.bestResponse.combinedScore}</span>
                    </div>
                  </div>

                  <div className="bg-background border border-border rounded-lg p-3">
                    <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Providers</div>
                    <div className="text-sm font-semibold text-foreground">
                      {result.consensus.providersSucceeded} / {result.consensus.providersQueried}
                    </div>
                    <div className="text-[10px] font-mono text-muted">responded successfully</div>
                    {result.consensus.providersFailed > 0 && (
                      <div className="text-[10px] font-mono text-danger mt-1">
                        {result.consensus.providersFailed} failed
                      </div>
                    )}
                  </div>

                  <div className="bg-background border border-border rounded-lg p-3">
                    <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Outlier Detection</div>
                    {result.consensus.outliers.length === 0 ? (
                      <>
                        <div className="text-sm font-semibold text-success">None</div>
                        <div className="text-[10px] font-mono text-muted">All responses within 2-sigma</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-warning">{result.consensus.outliers.length} detected</div>
                        <div className="text-[10px] font-mono text-warning/80">
                          {result.consensus.outliers.join(", ")}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Consensus Signature */}
                <details>
                  <summary className="text-[10px] font-mono text-muted cursor-pointer hover:text-foreground transition-colors select-none">
                    Consensus Semantic Signature
                  </summary>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                      ["Info Score", result.consensus.consensusSignature.informationScore],
                      ["Coherence", result.consensus.consensusSignature.coherenceScore],
                      ["Truth", result.consensus.consensusSignature.truthScore],
                      ["Convergence", result.consensus.consensusSignature.convergenceRate],
                      ["Natural Lang.", result.consensus.consensusSignature.naturalLanguageScore],
                      ["Balance", result.consensus.consensusSignature.balanceScore],
                      ["Multiscale Coh.", result.consensus.consensusSignature.coherenceMultiscale],
                      ["Synergy", result.consensus.consensusSignature.synergyIndex],
                    ] as [string, number][]).map(([label, val]) => (
                      <div key={label} className="text-[10px] font-mono">
                        <span className="text-muted">{label}: </span>
                        <span className="text-foreground">{val?.toFixed(4) ?? "N/A"}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && !result && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="5" cy="6" r="2" />
                  <circle cx="19" cy="6" r="2" />
                  <circle cx="5" cy="18" r="2" />
                  <circle cx="19" cy="18" r="2" />
                  <line x1="7" y1="7" x2="10" y2="10" />
                  <line x1="17" y1="7" x2="14" y2="10" />
                  <line x1="7" y1="17" x2="10" y2="14" />
                  <line x1="17" y1="17" x2="14" y2="14" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-foreground mb-1">Multi-Model Consensus</h3>
              <p className="text-xs text-muted max-w-md">
                Send a prompt to all configured LLM providers simultaneously.
                Each response is validated through the enforcement engine and scored.
                The consensus panel shows how well the models agree.
              </p>
              <div className="mt-4 text-[10px] font-mono text-muted space-y-1">
                <p>Supported providers: Anthropic, OpenAI, Google, xAI</p>
                <p>Configure API keys in Settings or via server environment variables</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
