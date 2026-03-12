// Early Access Waitlist API — subscribe + validate passcode
// POST /api/waitlist?action=subscribe  → email signup
// POST /api/waitlist?action=validate   → passcode validation

import { thermosolve, cbfCheck, commitTeep } from "@/lib/enforcement";
import {
  earlyAccessSignup,
  validatePasscode,
  isEmailGranted,
} from "@/lib/security-state";

function getIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function POST(req: Request) {
  const ip = getIp(req);

  // SSD-RCI enforcement on the waitlist request
  const sig = thermosolve(`waitlist_request:${ip}:${Date.now()}`);
  const cbf = cbfCheck(sig);
  if (!cbf.allSafe) {
    return Response.json({ error: "Request blocked by enforcement" }, { status: 403 });
  }

  let body: { action?: string; email?: string; passcode?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, email, passcode } = body;

  if (!action || !email) {
    return Response.json({ error: "Missing action or email" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail.includes("@") || !normalizedEmail.includes(".")) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }

  // ── SUBSCRIBE ──
  if (action === "subscribe") {
    const result = earlyAccessSignup(normalizedEmail, ip);

    // Commit a TEEP for the signup event
    commitTeep(`early_access_signup:${normalizedEmail}`, sig, cbf.allSafe, "early_access");

    return Response.json({
      ok: result.ok,
      alreadyExists: result.alreadyExists,
      message: result.alreadyExists
        ? "You're already on the list!"
        : "You're in! Check your email for an access code.",
    });
  }

  // ── VALIDATE PASSCODE ──
  if (action === "validate") {
    if (!passcode) {
      return Response.json({ error: "Missing passcode" }, { status: 400 });
    }

    const result = validatePasscode(normalizedEmail, passcode);

    if (result.valid) {
      commitTeep(`passcode_validated:${normalizedEmail}`, sig, cbf.allSafe, "early_access");
      return Response.json({
        valid: true,
        message: "Access granted! Redirecting...",
      });
    }

    return Response.json({
      valid: false,
      reason: result.reason,
    }, { status: 401 });
  }

  // ── CHECK ACCESS ──
  if (action === "check") {
    return Response.json({
      granted: isEmailGranted(normalizedEmail),
    });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
