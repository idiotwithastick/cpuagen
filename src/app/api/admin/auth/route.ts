import { thermosolve, cbfCheck, generateTeepId } from "@/lib/enforcement";
import {
  recordAdminAuthFail,
  recordAdminLogin,
  isAdminLocked,
  isSiteLocked,
} from "@/lib/security-state";

const ADMIN_USER = "wforeman";
const ADMIN_PASS = "Hak5@#$586";

function getIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function POST(req: Request) {
  const ip = getIp(req);

  // Check if admin is already locked out
  if (isAdminLocked()) {
    return Response.json(
      { error: "Admin access permanently locked. Too many failed attempts.", locked: true },
      { status: 403 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { username, password } = body;

  // SSD-RCI enforcement on the login attempt
  const sig = thermosolve(`admin_login:${username}:${ip}`);
  const cbf = cbfCheck(sig);
  const teepId = generateTeepId();

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    recordAdminLogin(ip);

    // Generate admin session token (simple HMAC-like hash)
    const token = Buffer.from(`${ADMIN_USER}:${Date.now()}:${ip}`).toString("base64");

    return Response.json({
      success: true,
      token,
      enforcement: {
        signature: { n: sig.n, phi: sig.phi },
        cbf: { allSafe: cbf.allSafe, barriers: 8 },
        teepId: `ADMIN-${teepId.split("-")[1]}`,
      },
      siteLocked: isSiteLocked(),
    });
  }

  // Failed login
  const result = recordAdminAuthFail(ip);

  if (result.locked) {
    return Response.json(
      {
        error: "CRITICAL: Admin locked. Website taken down. All data saved.",
        locked: true,
        attempts: result.attempts,
        enforcement: {
          signature: { n: sig.n, phi: sig.phi },
          cbf: { allSafe: cbf.allSafe, barriers: 8 },
          teepId: `LOCKOUT-${teepId.split("-")[1]}`,
        },
      },
      { status: 403 },
    );
  }

  return Response.json(
    {
      error: "Invalid credentials",
      locked: false,
      attemptsRemaining: 3 - result.attempts,
      enforcement: {
        signature: { n: sig.n, phi: sig.phi },
        cbf: { allSafe: cbf.allSafe, barriers: 8 },
        teepId: `FAIL-${teepId.split("-")[1]}`,
      },
    },
    { status: 401 },
  );
}
