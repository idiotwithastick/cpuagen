import { thermosolve, cbfCheck, generateTeepId } from "@/lib/enforcement";
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
  const teepId = generateTeepId();

  const lockout = getLockoutData();
  const enforcement = getEnforcementStats();
  const events = getSecurityEvents();

  return Response.json({
    lockout,
    enforcement,
    events: events.slice(-100),
    serverTime: Date.now(),
    requestIp: ip,
    meta: {
      signature: { n: sig.n, S: sig.S, phi: sig.phi, dS: sig.dS },
      cbf: { allSafe: cbf.allSafe },
      teepId: `STATS-${teepId.split("-")[1]}`,
    },
  });
}
