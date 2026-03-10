import { recordSiteAuthFail, isSiteLocked } from "@/lib/security-state";

export async function POST(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  const real = req.headers.get("x-real-ip");
  const ip = forwarded ? forwarded.split(",")[0].trim() : real || "unknown";

  // Also accept IP from body (for middleware forwarding)
  let bodyIp: string | undefined;
  try {
    const body = await req.json();
    bodyIp = body.ip;
  } catch {
    // no body is fine
  }

  const clientIp = bodyIp || ip;
  const result = recordSiteAuthFail(clientIp);

  return Response.json({
    locked: result.locked || isSiteLocked(),
    attempts: result.attempts,
    ip: clientIp,
  });
}
