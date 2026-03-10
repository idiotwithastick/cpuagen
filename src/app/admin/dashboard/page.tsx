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
      cacheHits: number;
      cacheMisses: number;
      hitRate: number;
    };
    recentTeeps: Array<{
      id: string;
      hash: string;
      created: number;
      hits: number;
      sig: { n: number; S: number; phi: number; I_truth: number };
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
          <Card title="SSD-RCI ENFORCEMENT PIPELINE">
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {["INBOUND", "VALIDATE", "LLM", "OUTBOUND"].map((stage, i) => (
                  <div key={stage} className="text-center">
                    <div className={`text-[10px] font-mono tracking-wider mb-1 ${i === 1 || i === 3 ? "text-purple-400" : "text-[#71717a]"}`}>
                      {stage}
                    </div>
                    <div className={`h-1 rounded ${i === 1 || i === 3 ? "bg-purple-500/50" : "bg-[#1e1e2e]"}`} />
                  </div>
                ))}
              </div>
              <div className="text-[10px] font-mono text-[#71717a] space-y-1">
                <div className="flex justify-between">
                  <span>8 Control Barrier Functions</span>
                  <span className="text-green-400">ALL ACTIVE</span>
                </div>
                <div className="flex justify-between">
                  <span>Thermosolve Signatures</span>
                  <span className="text-green-400">COMPUTING</span>
                </div>
                <div className="flex justify-between">
                  <span>TEEP Caching</span>
                  <span className="text-green-400">ENABLED</span>
                </div>
                <div className="flex justify-between">
                  <span>Pre + Post Validation</span>
                  <span className="text-green-400">ENFORCED</span>
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

            {/* TEEP Ledger */}
            <Card title="TEEP LEDGER (AGF CACHE)">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-purple-950/30 border border-purple-500/20 text-center">
                    <div className="text-sm font-bold font-mono text-purple-400">{physics.teepLedger.size}</div>
                    <div className="text-[9px] text-[#71717a]">Cached TEEPs</div>
                  </div>
                  <div className="p-2 rounded bg-green-950/30 border border-green-500/20 text-center">
                    <div className="text-sm font-bold font-mono text-green-400">
                      {physics.teepLedger.hitRate > 0 ? `${(physics.teepLedger.hitRate * 100).toFixed(1)}%` : "0%"}
                    </div>
                    <div className="text-[9px] text-[#71717a]">Cache Hit Rate</div>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-[#71717a]">Cache Hits</span>
                  <span className="text-green-400">{physics.teepLedger.cacheHits}</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-[#71717a]">Cache Misses</span>
                  <span className="text-yellow-400">{physics.teepLedger.cacheMisses}</span>
                </div>
                {/* Recent TEEPs */}
                {physics.recentTeeps.length > 0 && (
                  <div className="pt-2 border-t border-[#1e1e2e]">
                    <div className="text-[9px] font-mono text-[#71717a]/60 mb-1">RECENT TEEP ENTRIES</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {physics.recentTeeps.map((teep) => (
                        <div key={teep.id} className="flex items-center justify-between text-[9px] font-mono py-0.5">
                          <span className="text-purple-400">{teep.id}</span>
                          <span className="text-[#71717a]">
                            n={teep.sig.n} S={teep.sig.S} φ={teep.sig.phi} hits={teep.hits}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-1 text-[9px] font-mono text-[#71717a]/60">
                  AGF: Lookup → Hit/Miss → Solve → Cache → O(1) next time
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
