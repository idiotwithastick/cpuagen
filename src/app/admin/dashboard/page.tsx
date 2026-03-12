"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SecurityEvent {
  type: string;
  ip: string;
  timestamp: number;
  details?: string;
}

interface DashboardData {
  lockout: {
    siteLocked: boolean;
    adminLocked: boolean;
    siteLockTime?: number;
    adminLockTime?: number;
    totalSiteFailures: number;
    totalAdminFailures: number;
    recentEvents: SecurityEvent[];
    siteFailsByIp: Record<string, number>;
    adminFailsByIp: Record<string, number>;
  };
  enforcement: {
    totalRequests: number;
    totalPassed: number;
    totalBlocked: number;
    barrierFailCounts: Record<string, number>;
    lastRequestTime?: number;
    teepsCached: number;
  };
  events: SecurityEvent[];
  serverTime: number;
  requestIp: string;
  physics?: {
    psiState: {
      cycle: number;
      S: number;
      psi_coherence: number;
      I_truth: number;
      beta_T: number;
      kappa: number;
      phi_phase: number;
      E_meta: number;
      R_curv: number;
      lambda_flow: number;
    };
    teepLedger: {
      size: number;
      basinIndexSize: number;
      cacheHits: number;
      cacheMisses: number;
      hitRate: number;
    };
    spatialGridCells?: number;
    agf: {
      fullHits: number;
      basinHits: number;
      jitSolves: number;
      apiCallsAvoided: number;
      totalLookups: number;
      hitRate: number;
    };
    morphic?: {
      fieldStrength: number;
      resonanceEvents: number;
      dynamicFisherWeights: Record<string, number>;
      basinThreshold: number;
      totalSemanticMass: number;
      heaviestTeepMass: number;
      totalResonanceAccum: number;
    };
    recentTeeps: Array<{
      id: string;
      hash: string;
      created: number;
      hits: number;
      contentPreview?: string;
      semanticMass?: number;
      resonanceStrength?: number;
      sig: { n: number; S: number; phi: number; I_truth: number };
    }>;
  };
  earlyAccess?: {
    stats: { total: number; granted: number; pending: number; redeemed: number };
    ledger: Array<{
      email: string;
      timestamp: number;
      passcode: string;
      passcodeUsed: boolean;
      passcodeSentAt?: number;
      accessGranted: boolean;
    }>;
  };
  meta: {
    signature: {
      n: number; S: number; phi: number; dS: number;
      I_truth?: number; naturality?: number; beta_T?: number;
      psi_coherence?: number; synergy?: number;
    };
    cbf: { allSafe: boolean };
  };
}

function StatusDot({ active, color = "green" }: { active: boolean; color?: string }) {
  const c = active
    ? color === "red" ? "bg-red-500" : color === "yellow" ? "bg-yellow-500" : "bg-green-500"
    : "bg-gray-600";
  return <span className={`inline-block w-2 h-2 rounded-full ${c} ${active ? "animate-pulse" : ""}`} />;
}

function Card({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <div className={`rounded-xl border ${danger ? "border-red-500/30 bg-red-950/20" : "border-[#1e1e2e] bg-[#0c0c12]"} p-4`}>
      <h3 className={`text-xs font-mono tracking-wider mb-3 ${danger ? "text-red-400" : "text-[#71717a]"}`}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <div className="text-lg font-bold font-mono text-[#e4e4e7]">{value}</div>
      <div className="text-[10px] text-[#71717a]">{label}</div>
      {sub && <div className="text-[9px] text-[#71717a]/60 font-mono">{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const router = useRouter();

  const token = typeof window !== "undefined" ? sessionStorage.getItem("cpuagen-admin-token") : null;

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          sessionStorage.removeItem("cpuagen-admin-token");
          router.push("/admin");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const d = await res.json();

      // v12.1: Merge client-side metrics from localStorage
      // Solves Vercel serverless isolation: /api/chat and /api/admin/stats
      // run in different instances. Chat saves metrics via SSE → localStorage.
      try {
        const stored = localStorage.getItem("cpuagen-enforcement-metrics");
        if (stored) {
          const clientMetrics = JSON.parse(stored);
          const m = clientMetrics.metrics;
          if (m && d.physics) {
            // Use client-side data if it has more TEEPs (server restarted = 0)
            if (m.teepLedgerSize > (d.physics.teepLedger?.size || 0)) {
              d.physics.teepLedger = {
                size: m.teepLedgerSize,
                basinIndexSize: m.basinIndexSize,
                cacheHits: m.cacheHits,
                cacheMisses: m.cacheMisses,
                hitRate: m.hitRate,
              };
              d.physics.spatialGridCells = m.spatialGridCells;
              d.physics.agf = m.agf;
              if (m.morphic) d.physics.morphic = m.morphic;
              if (m.psiState) d.physics.psiState = m.psiState;
            }
            // Always use client recent TEEPs if available (server has none)
            if (clientMetrics.recentTeeps?.length > 0 &&
                (!d.physics.recentTeeps || d.physics.recentTeeps.length === 0)) {
              d.physics.recentTeeps = clientMetrics.recentTeeps;
            }
            // Update teepsCached in enforcement section too
            if (m.teepLedgerSize > (d.enforcement?.teepsCached || 0)) {
              d.enforcement.teepsCached = m.teepLedgerSize;
            }
          }
        }
      } catch {
        // localStorage read failed, use server data as-is
      }

      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [token, router]);

  useEffect(() => {
    if (!token) {
      router.push("/admin");
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [token, router, fetchData]);

  const handleAction = async (action: string) => {
    if (!token) return;
    setActionLoading(action);
    try {
      const res = await fetch("/api/admin/lockout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch {
      // ignore
    }
    setActionLoading("");
  };

  const handleEarlyAccessAction = async (action: string, email: string) => {
    if (!token) return;
    setActionLoading(`${action}:${email}`);
    try {
      await fetch("/api/admin/stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, email }),
      });
      await fetchData();
    } catch {
      // ignore
    }
    setActionLoading("");
  };

  const handleLogout = () => {
    sessionStorage.removeItem("cpuagen-admin-token");
    router.push("/admin");
  };

  if (!token) return null;

  if (error) {
    return (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => router.push("/admin")} className="text-sm text-[#71717a] hover:text-white cursor-pointer">
            Back to login
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center">
        <div className="text-[#71717a] font-mono text-sm animate-pulse">Loading enforcement data...</div>
      </div>
    );
  }

  const { lockout, enforcement, events, requestIp, meta, physics } = data;

  return (
    <div className="min-h-screen bg-[#050508] text-[#e4e4e7]">
      {/* Header */}
      <div className="border-b border-[#1e1e2e] bg-[#0c0c12]/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-red-900/30 border border-red-500/30 flex items-center justify-center">
              <span className="text-red-400 text-xs font-bold">A</span>
            </div>
            <span className="font-semibold text-sm">CPUAGEN Admin</span>
            <span className="text-[10px] font-mono text-red-400/60 px-1.5 py-0.5 rounded bg-red-950/30 border border-red-500/20">
              SSD-RCI
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono text-[#71717a]">IP: {requestIp}</span>
            <a href="/app/chat" className="text-xs text-[#71717a] hover:text-white transition-colors">
              Chat
            </a>
            <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer">
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Lockout Status Banner */}
        {(lockout.siteLocked || lockout.adminLocked) && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <StatusDot active color="red" />
                <div>
                  <div className="text-sm font-semibold text-red-400">
                    {lockout.adminLocked ? "ADMIN LOCKOUT — SITE DOWN" : "SITE LOCKED"}
                  </div>
                  <div className="text-xs text-red-400/60 font-mono">
                    {lockout.siteLockTime && `Locked at ${new Date(lockout.siteLockTime).toLocaleString()}`}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {lockout.siteLocked && (
                  <button
                    onClick={() => handleAction("unlock_site")}
                    disabled={!!actionLoading}
                    className="px-3 py-1.5 rounded-lg bg-green-900/50 border border-green-500/30 text-green-400 text-xs font-mono hover:bg-green-900/70 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {actionLoading === "unlock_site" ? "..." : "Unlock Site"}
                  </button>
                )}
                {lockout.adminLocked && (
                  <button
                    onClick={() => handleAction("unlock_all")}
                    disabled={!!actionLoading}
                    className="px-3 py-1.5 rounded-lg bg-green-900/50 border border-green-500/30 text-green-400 text-xs font-mono hover:bg-green-900/70 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {actionLoading === "unlock_all" ? "..." : "Unlock All"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Top Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="ENFORCEMENT REQUESTS">
            <Metric label="Total Processed" value={enforcement.totalRequests} />
          </Card>
          <Card title="BARRIERS PASSED">
            <Metric
              label="Pass Rate"
              value={enforcement.totalRequests > 0
                ? `${Math.round((enforcement.totalPassed / enforcement.totalRequests) * 100)}%`
                : "N/A"
              }
              sub={`${enforcement.totalPassed} passed / ${enforcement.totalBlocked} blocked`}
            />
          </Card>
          <Card title="TEEP CACHE">
            <Metric label="Responses Cached" value={enforcement.teepsCached} sub="Permanent knowledge store" />
          </Card>
          <Card title="SECURITY STATUS" danger={lockout.siteLocked || lockout.adminLocked}>
            <div className="flex items-center gap-2">
              <StatusDot active={!lockout.siteLocked} color={lockout.siteLocked ? "red" : "green"} />
              <span className={`text-sm font-mono ${lockout.siteLocked ? "text-red-400" : "text-green-400"}`}>
                {lockout.siteLocked ? "LOCKED" : "OPERATIONAL"}
              </span>
            </div>
            <div className="text-[10px] text-[#71717a] mt-1 font-mono">
              Site fails: {lockout.totalSiteFailures}/5 | Admin fails: {lockout.totalAdminFailures}/3
            </div>
          </Card>
        </div>

        {/* Middle Row: Enforcement + Lockout Details */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Enforcement Pipeline */}
          <Card title="SSD-RCI AGF ENFORCEMENT PIPELINE">
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-1">
                {["INBOUND", "CBF", "AGF LOOKUP", "JIT/HIT", "OUTBOUND"].map((stage, i) => (
                  <div key={stage} className="text-center">
                    <div className={`text-[9px] font-mono tracking-wider mb-1 ${i === 2 ? "text-green-400" : i === 1 || i === 4 ? "text-purple-400" : "text-[#71717a]"}`}>
                      {stage}
                    </div>
                    <div className={`h-1 rounded ${i === 2 ? "bg-green-500/50" : i === 1 || i === 4 ? "bg-purple-500/50" : "bg-[#1e1e2e]"}`} />
                  </div>
                ))}
              </div>
              <div className="text-[10px] font-mono text-[#71717a] space-y-1">
                <div className="flex justify-between">
                  <span>8 Control Barrier Functions</span>
                  <span className="text-green-400">ALL ACTIVE</span>
                </div>
                <div className="flex justify-between">
                  <span>AGF Cache-First Protocol</span>
                  <span className="text-green-400">ENFORCED</span>
                </div>
                <div className="flex justify-between">
                  <span>Basin Proximity (Fisher Metric)</span>
                  <span className="text-green-400">ACTIVE</span>
                </div>
                <div className="flex justify-between">
                  <span>LLM = JIT Solver (miss only)</span>
                  <span className="text-green-400">CORRECT</span>
                </div>
              </div>

              {/* Live thermosolve signature from this request */}
              <div className="mt-3 pt-3 border-t border-[#1e1e2e]">
                <div className="text-[9px] font-mono text-[#71717a]/60 mb-1">LIVE THERMOSOLVE SIGNATURE</div>
                <div className="text-[10px] font-mono text-purple-400 space-y-0.5">
                  <div>n={meta.signature.n} | S={meta.signature.S} | dS={meta.signature.dS} | phi={meta.signature.phi}</div>
                  <div>I_truth={meta.signature.I_truth ?? "—"} | nat={meta.signature.naturality ?? "—"} | beta_T={meta.signature.beta_T ?? "—"}</div>
                  <div>psi_coh={meta.signature.psi_coherence ?? "—"} | synergy={meta.signature.synergy ?? "—"}</div>
                </div>
                <div className="text-[10px] font-mono text-green-400/80 mt-1">
                  CBF: {meta.cbf.allSafe ? "ALL 8 SAFE" : "BLOCKED"}
                </div>
              </div>
            </div>
          </Card>

          {/* IP Tracking */}
          <Card title="IP TRACKING & FAILED ATTEMPTS">
            <div className="space-y-3">
              {/* Site Failures by IP */}
              <div>
                <div className="text-[10px] font-mono text-[#71717a] mb-1">SITE PASSWORD FAILURES</div>
                {Object.keys(lockout.siteFailsByIp).length === 0 ? (
                  <div className="text-[10px] text-[#71717a]/50 font-mono">No failures recorded</div>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(lockout.siteFailsByIp).map(([ip, count]) => (
                      <div key={ip} className="flex justify-between text-xs font-mono">
                        <span className="text-[#71717a]">{ip}</span>
                        <span className={count >= 3 ? "text-red-400" : "text-yellow-400"}>{count} fail{count !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Admin Failures by IP */}
              <div>
                <div className="text-[10px] font-mono text-[#71717a] mb-1">ADMIN PASSWORD FAILURES</div>
                {Object.keys(lockout.adminFailsByIp).length === 0 ? (
                  <div className="text-[10px] text-[#71717a]/50 font-mono">No failures recorded</div>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(lockout.adminFailsByIp).map(([ip, count]) => (
                      <div key={ip} className="flex justify-between text-xs font-mono">
                        <span className="text-[#71717a]">{ip}</span>
                        <span className="text-red-400">{count} fail{count !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Your IP */}
              <div className="pt-2 border-t border-[#1e1e2e]">
                <div className="text-[10px] font-mono text-[#71717a]">YOUR IP</div>
                <div className="text-xs font-mono text-green-400">{requestIp}</div>
              </div>
            </div>
          </Card>
        </div>

        {/* PsiState + TEEP Ledger Row */}
        {physics && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* 26-Dim PsiState */}
            <Card title="PSISTATE (26-DIM COGNITIVE STATE)">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {[
                    ["Cycle", physics.psiState.cycle],
                    ["System Entropy (S)", physics.psiState.S?.toFixed(4)],
                    ["Coherence (psi)", physics.psiState.psi_coherence?.toFixed(4)],
                    ["Truth (I_truth)", physics.psiState.I_truth?.toFixed(4)],
                    ["Equilibrium (beta_T)", physics.psiState.beta_T?.toFixed(4)],
                    ["Stability (kappa)", physics.psiState.kappa?.toFixed(4)],
                    ["Phase (phi)", physics.psiState.phi_phase?.toFixed(4)],
                    ["Meta Energy", physics.psiState.E_meta?.toFixed(2)],
                    ["Curvature (R)", physics.psiState.R_curv?.toFixed(4)],
                    ["Flow (lambda)", physics.psiState.lambda_flow?.toFixed(4)],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between text-[10px] font-mono">
                      <span className="text-[#71717a]">{label}</span>
                      <span className="text-purple-400">{val}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-[#1e1e2e]">
                  <div className="text-[9px] font-mono text-[#71717a]/60">
                    dψ/dt = -η∇S[ψ] — State evolves with each enforcement request
                  </div>
                </div>
              </div>
            </Card>

            {/* AGF Protocol — The Real Deal */}
            <Card title="AGF PROTOCOL (PASS STATE, NOT WORDS)">
              <div className="space-y-3">
                {/* AGF Hit Type Breakdown */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded bg-green-950/30 border border-green-500/20 text-center">
                    <div className="text-sm font-bold font-mono text-green-400">{physics.agf.fullHits}</div>
                    <div className="text-[9px] text-[#71717a]">FULL HIT</div>
                    <div className="text-[8px] text-green-400/50">No LLM call</div>
                  </div>
                  <div className="p-2 rounded bg-cyan-950/30 border border-cyan-500/20 text-center">
                    <div className="text-sm font-bold font-mono text-cyan-400">{physics.agf.basinHits}</div>
                    <div className="text-[9px] text-[#71717a]">BASIN HIT</div>
                    <div className="text-[8px] text-cyan-400/50">No LLM call</div>
                  </div>
                  <div className="p-2 rounded bg-yellow-950/30 border border-yellow-500/20 text-center">
                    <div className="text-sm font-bold font-mono text-yellow-400">{physics.agf.jitSolves}</div>
                    <div className="text-[9px] text-[#71717a]">JIT SOLVE</div>
                    <div className="text-[8px] text-yellow-400/50">LLM as solver</div>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#71717a]">AGF Hit Rate</span>
                    <span className="text-green-400 font-bold">
                      {physics.agf.hitRate > 0 ? `${(physics.agf.hitRate * 100).toFixed(1)}%` : "0%"}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#71717a]">API Calls Avoided</span>
                    <span className="text-green-400">{physics.agf.apiCallsAvoided}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#71717a]">TEEP Ledger</span>
                    <span className="text-purple-400">{physics.teepLedger.size} TEEPs</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#71717a]">Basin Index</span>
                    <span className="text-purple-400">{physics.teepLedger.basinIndexSize} mappings</span>
                  </div>
                  {physics.spatialGridCells !== undefined && (
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-[#71717a]">Spatial Grid</span>
                      <span className="text-cyan-400">{physics.spatialGridCells} cells (O(1) lookup)</span>
                    </div>
                  )}
                </div>

                {/* Recent TEEPs with content preview */}
                {physics.recentTeeps.length > 0 && (
                  <div className="pt-2 border-t border-[#1e1e2e]">
                    <div className="text-[9px] font-mono text-[#71717a]/60 mb-1">SOLVED BASINS (TEEP CONTENT)</div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {physics.recentTeeps.map((teep) => (
                        <div key={teep.id} className="py-1 border-b border-[#1e1e2e] last:border-0">
                          <div className="flex items-center justify-between text-[9px] font-mono">
                            <span className="text-purple-400">{teep.id}</span>
                            <span className="text-[#71717a]">
                              hits={teep.hits}
                              {teep.semanticMass !== undefined && <> | m<sub>s</sub>={teep.semanticMass.toFixed(3)}</>}
                              {teep.resonanceStrength !== undefined && teep.resonanceStrength > 0 && <> | R={teep.resonanceStrength.toFixed(3)}</>}
                            </span>
                          </div>
                          {teep.contentPreview && (
                            <div className="text-[8px] font-mono text-[#71717a]/60 mt-0.5 truncate">
                              {teep.contentPreview}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-1 text-[9px] font-mono text-[#71717a]/60">
                  FULL_HIT: O(1) exact match | BASIN_HIT: Fisher metric proximity | JIT: LLM solver
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* v11.0-Q MORPHIC RESONANCE */}
        {physics?.morphic && (
          <div className="space-y-3">
            <Card title="MORPHIC RESONANCE (v11.0-Q PHASE 3)">
              <div className="space-y-3">
                {/* Field state indicators */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="text-center p-2 rounded bg-[#1a1a2e] border border-purple-500/30">
                    <div className="text-lg font-bold font-mono text-purple-400">
                      {physics.morphic.fieldStrength.toFixed(4)}
                    </div>
                    <div className="text-[9px] text-[#71717a]">Field Strength</div>
                  </div>
                  <div className="text-center p-2 rounded bg-[#1a1a2e] border border-purple-500/30">
                    <div className="text-lg font-bold font-mono text-purple-400">
                      {physics.morphic.resonanceEvents}
                    </div>
                    <div className="text-[9px] text-[#71717a]">Resonance Events</div>
                  </div>
                  <div className="text-center p-2 rounded bg-[#1a1a2e] border border-cyan-500/30">
                    <div className="text-lg font-bold font-mono text-cyan-400">
                      {physics.morphic.basinThreshold.toFixed(4)}
                    </div>
                    <div className="text-[9px] text-[#71717a]">Basin Threshold</div>
                  </div>
                  <div className="text-center p-2 rounded bg-[#1a1a2e] border border-cyan-500/30">
                    <div className="text-lg font-bold font-mono text-cyan-400">
                      {physics.morphic.totalSemanticMass.toFixed(4)}
                    </div>
                    <div className="text-[9px] text-[#71717a]">Total Semantic Mass</div>
                  </div>
                </div>

                {/* Dynamic Fisher Metric weights */}
                <div className="text-[10px] font-mono text-[#71717a]">DYNAMIC FISHER METRIC g_F(t)</div>
                <div className="grid grid-cols-7 gap-1">
                  {Object.entries(physics.morphic.dynamicFisherWeights).map(([dim, weight]) => (
                    <div key={dim} className="text-center p-1 rounded bg-[#0a0a15] border border-[#1e1e2e]">
                      <div className="text-[10px] font-mono text-green-400">{(weight as number).toFixed(2)}</div>
                      <div className="text-[8px] text-[#71717a]">{dim}</div>
                    </div>
                  ))}
                </div>

                <div className="text-[9px] font-mono text-[#71717a]/60">
                  Metric evolves via g_ij(t+Δt) = g_ij(t) + η·R(ψ)·dγ | Habits form where truth converges
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Barrier Failure Breakdown */}
        {Object.keys(enforcement.barrierFailCounts).length > 0 && (
          <Card title="BARRIER FAILURE BREAKDOWN">
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              {Object.entries(enforcement.barrierFailCounts).map(([barrier, count]) => (
                <div key={barrier} className="text-center p-2 rounded bg-red-950/30 border border-red-500/20">
                  <div className="text-xs font-mono text-red-400">{count}</div>
                  <div className="text-[9px] font-mono text-[#71717a]">{barrier}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Early Access Management */}
        {data.earlyAccess && (
          <Card title="EARLY ACCESS MANAGEMENT">
            <div className="space-y-4">
              {/* Stats Row */}
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-2 rounded bg-[#1a1a2e] border border-purple-500/20">
                  <div className="text-lg font-bold font-mono text-purple-400">{data.earlyAccess.stats.total}</div>
                  <div className="text-[9px] text-[#71717a]">Total Signups</div>
                </div>
                <div className="text-center p-2 rounded bg-[#1a1a2e] border border-green-500/20">
                  <div className="text-lg font-bold font-mono text-green-400">{data.earlyAccess.stats.granted}</div>
                  <div className="text-[9px] text-[#71717a]">Access Granted</div>
                </div>
                <div className="text-center p-2 rounded bg-[#1a1a2e] border border-yellow-500/20">
                  <div className="text-lg font-bold font-mono text-yellow-400">{data.earlyAccess.stats.pending}</div>
                  <div className="text-[9px] text-[#71717a]">Pending Send</div>
                </div>
                <div className="text-center p-2 rounded bg-[#1a1a2e] border border-cyan-500/20">
                  <div className="text-lg font-bold font-mono text-cyan-400">{data.earlyAccess.stats.redeemed}</div>
                  <div className="text-[9px] text-[#71717a]">Redeemed</div>
                </div>
              </div>

              {/* Ledger Table */}
              {data.earlyAccess.ledger.length === 0 ? (
                <div className="text-[10px] text-[#71717a]/50 font-mono py-4 text-center">
                  No early access signups yet
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="text-[#71717a] border-b border-[#1e1e2e]">
                        <th className="text-left py-1.5 pr-2">Email</th>
                        <th className="text-left py-1.5 pr-2">Passcode</th>
                        <th className="text-left py-1.5 pr-2">Signed Up</th>
                        <th className="text-left py-1.5 pr-2">Status</th>
                        <th className="text-right py-1.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.earlyAccess.ledger.map((entry) => (
                        <tr key={entry.email} className="border-b border-[#1e1e2e]/50 hover:bg-[#1e1e2e]/30">
                          <td className="py-2 pr-2 text-[#e4e4e7]">{entry.email}</td>
                          <td className="py-2 pr-2">
                            <span className="px-1.5 py-0.5 rounded bg-[#1a1a2e] text-purple-400 select-all">
                              {entry.passcode}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-[#71717a]">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </td>
                          <td className="py-2 pr-2">
                            {entry.accessGranted ? (
                              <span className="text-green-400">✓ Granted</span>
                            ) : entry.passcodeSentAt ? (
                              <span className="text-yellow-400">📧 Sent</span>
                            ) : (
                              <span className="text-[#71717a]">Pending</span>
                            )}
                          </td>
                          <td className="py-2 text-right space-x-1">
                            {!entry.passcodeSentAt && (
                              <button
                                onClick={() => handleEarlyAccessAction("mark_sent", entry.email)}
                                disabled={!!actionLoading}
                                className="px-2 py-0.5 rounded bg-blue-900/40 border border-blue-500/20 text-blue-400 hover:bg-blue-900/60 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {actionLoading === `mark_sent:${entry.email}` ? "..." : "Mark Sent"}
                              </button>
                            )}
                            {!entry.accessGranted ? (
                              <button
                                onClick={() => handleEarlyAccessAction("grant", entry.email)}
                                disabled={!!actionLoading}
                                className="px-2 py-0.5 rounded bg-green-900/40 border border-green-500/20 text-green-400 hover:bg-green-900/60 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {actionLoading === `grant:${entry.email}` ? "..." : "Grant"}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleEarlyAccessAction("revoke", entry.email)}
                                disabled={!!actionLoading}
                                className="px-2 py-0.5 rounded bg-red-900/40 border border-red-500/20 text-red-400 hover:bg-red-900/60 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {actionLoading === `revoke:${entry.email}` ? "..." : "Revoke"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Security Event Log */}
        <Card title="SECURITY EVENT LOG">
          <div className="max-h-64 overflow-y-auto space-y-1">
            {events.length === 0 ? (
              <div className="text-[10px] text-[#71717a]/50 font-mono py-4 text-center">
                No security events recorded in this instance
              </div>
            ) : (
              [...events].reverse().map((event, i) => (
                <div key={i} className="flex items-start gap-3 py-1.5 border-b border-[#1e1e2e] last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    event.type.includes("lockout") ? "bg-red-500" :
                    event.type === "enforcement_block" ? "bg-red-500" :
                    event.type.includes("fail") ? "bg-yellow-500" :
                    event.type === "enforcement_pass" ? "bg-green-500" :
                    event.type === "teep_cached" ? "bg-purple-500" :
                    event.type.includes("login") ? "bg-green-500" :
                    "bg-blue-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-[#e4e4e7]">
                        {event.type.replace(/_/g, " ").toUpperCase()}
                      </span>
                      <span className="text-[9px] font-mono text-[#71717a]">{event.ip}</span>
                    </div>
                    {event.details && (
                      <div className="text-[9px] font-mono text-[#71717a]/70">{event.details}</div>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-[#71717a]/50 shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center py-4">
          <div className="text-[10px] font-mono text-[#71717a]/40">
            CPUAGEN Admin Console | SSD-RCI v10.4-Unified | Auto-refresh: 5s
          </div>
        </div>
      </div>
    </div>
  );
}
