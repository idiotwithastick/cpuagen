import { thermosolve, cbfCheck, generateTeepId } from "@/lib/enforcement";
import {
  unlockSite,
  unlockAdmin,
  getLockoutData,
  isSiteLocked,
  isAdminLocked,
} from "@/lib/security-state";

export async function GET() {
  return Response.json({
    siteLocked: isSiteLocked(),
    adminLocked: isAdminLocked(),
  });
}

export async function POST(req: Request) {
  // Verify admin token
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

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body;

  // SSD-RCI enforcement
  const sig = thermosolve(`admin_lockout_action:${action}`);
  const cbf = cbfCheck(sig);
  const teepId = generateTeepId();

  switch (action) {
    case "unlock_site":
      unlockSite();
      break;
    case "unlock_admin":
      unlockAdmin();
      break;
    case "unlock_all":
      unlockSite();
      unlockAdmin();
      break;
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }

  return Response.json({
    success: true,
    action,
    lockout: getLockoutData(),
    enforcement: {
      signature: { n: sig.n, phi: sig.phi },
      cbf: { allSafe: cbf.allSafe },
      teepId: `UNLOCK-${teepId.split("-")[1]}`,
    },
  });
}
