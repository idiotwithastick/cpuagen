import { thermosolve, cbfCheck, getEnforcementMetrics, getRecentTeeps } from "@/lib/enforcement";
import {
  getLockoutData,
  getEnforcementStats,
  getSecurityEvents,
} from "@/lib/security-state";

function getIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function GET(req: Request) {
  // Verify admin token from Authorization header
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, "base64").toString();
    if (!decoded.startsWith("wforeman:")) {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const ip = getIp(req);

  // SSD-RCI enforcement on the stats request itself
  const sig = thermosolve(`admin_stats_request:${ip}:${Date.now()}`);
  const cbf = cbfCheck(sig);

  const lockout = getLockoutData();
  const enforcement = getEnforcementStats();
  const events = getSecurityEvents();

  // Physics engine state + TEEP ledger metrics
  const metrics = getEnforcementMetrics();
  const recentTeeps = getRecentTeeps(10);

  return Response.json({
    lockout,
    enforcement,
    events: events.slice(-100),
    serverTime: Date.now(),
    requestIp: ip,
    // Full physics state for admin inspection
    physics: {
      psiState: {
        cycle: metrics.psiState.cycle,
        S: metrics.psiState.S,
        psi_coherence: metrics.psiState.psi_coherence,
        I_truth: metrics.psiState.I_truth,
        beta_T: metrics.psiState.beta_T,
        kappa: metrics.psiState.kappa,
        phi_phase: metrics.psiState.phi_phase,
        E_meta: metrics.psiState.E_meta,
        R_curv: metrics.psiState.R_curv,
        lambda_flow: metrics.psiState.lambda_flow,
      },
      teepLedger: {
        size: metrics.teepLedgerSize,
        cacheHits: metrics.cacheHits,
        cacheMisses: metrics.cacheMisses,
        hitRate: metrics.hitRate,
      },
      recentTeeps,
    },
    meta: {
      signature: {
        n: sig.n,
        S: sig.S,
        dS: sig.dS,
        phi: sig.phi,
        I_truth: sig.I_truth,
        naturality: sig.naturality,
        beta_T: sig.beta_T,
        psi_coherence: sig.psi_coherence,
        synergy: sig.synergy,
      },
      cbf: { allSafe: cbf.allSafe },
    },
  });
}
