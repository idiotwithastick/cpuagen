import { thermosolve, cbfCheck, getEnforcementMetrics, getRecentTeeps, seedFromD1 } from "@/lib/enforcement";
import {
  getLockoutData,
  getEnforcementStats,
  getSecurityEvents,
  getEarlyAccessLedger,
  getEarlyAccessStats,
  markPasscodeSent,
  grantAccess,
  revokeAccess,
  getFeedbackList,
  getFeedbackStats,
  updateFeedbackStatus,
  deleteFeedback,
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
    const adminUser = process.env.ADMIN_USER || "wforeman";
    if (!decoded.startsWith(adminUser + ":")) {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const ip = getIp(req);

  // Seed TEEP ledger from D1 on cold start — ensures admin sees TEEPs
  // even if no chat requests have been made since last deploy
  await seedFromD1();

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
        basinIndexSize: metrics.basinIndexSize,
        cacheHits: metrics.cacheHits,
        cacheMisses: metrics.cacheMisses,
        hitRate: metrics.hitRate,
      },
      spatialGridCells: metrics.spatialGridCells,
      agf: metrics.agf,
      morphic: metrics.morphic,
      recentTeeps,
    },
    earlyAccess: {
      stats: getEarlyAccessStats(),
      ledger: getEarlyAccessLedger(),
    },
    feedback: {
      stats: getFeedbackStats(),
      items: getFeedbackList(),
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
      cbf: {
        allSafe: cbf.allSafe,
        barriers: {
          BNR: cbf.BNR, BNN: cbf.BNN, BNA: cbf.BNA, TSE: cbf.TSE,
          PCD: cbf.PCD, OGP: cbf.OGP, ECM: cbf.ECM, SPC: cbf.SPC,
          FEP: cbf.FEP,
        },
      },
    },
  });
}

// POST handler for early access admin actions
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const adminUser = process.env.ADMIN_USER || "wforeman";
    if (!decoded.startsWith(adminUser + ":")) {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: { action: string; email?: string; id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body;
  if (!action) {
    return Response.json({ error: "Missing action" }, { status: 400 });
  }

  // Early access actions
  if (action === "mark_sent" && body.email) {
    const ok = markPasscodeSent(body.email);
    return Response.json({ ok });
  }
  if (action === "grant" && body.email) {
    const ok = grantAccess(body.email);
    return Response.json({ ok });
  }
  if (action === "revoke" && body.email) {
    const ok = revokeAccess(body.email);
    return Response.json({ ok });
  }

  // Feedback actions
  if (action === "feedback_status" && body.id && body.status) {
    const ok = updateFeedbackStatus(body.id, body.status as "new" | "reviewed" | "resolved" | "dismissed");
    return Response.json({ ok });
  }
  if (action === "feedback_delete" && body.id) {
    const ok = deleteFeedback(body.id);
    return Response.json({ ok });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
