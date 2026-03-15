// Bug Report & Suggestion API — stores feedback for admin dashboard
// POST /api/feedback

import { thermosolve, cbfCheck } from "@/lib/enforcement";
import { saveFeedback } from "@/lib/security-state";

function getIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function POST(req: Request) {
  const ip = getIp(req);

  // SSD-RCI enforcement
  const sig = thermosolve(`feedback:${ip}:${Date.now()}`);
  const cbf = cbfCheck(sig);
  if (!cbf.allSafe) {
    return Response.json({ error: "Request blocked by enforcement" }, { status: 403 });
  }

  let body: { type?: string; subject?: string; description?: string; email?: string; page?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, subject, description, email, page } = body;

  if (!type || !subject || !description) {
    return Response.json({ error: "Missing required fields (type, subject, description)" }, { status: 400 });
  }

  if (subject.length > 200 || description.length > 5000) {
    return Response.json({ error: "Subject or description too long" }, { status: 400 });
  }

  const fb = saveFeedback({
    type: type === "bug" ? "bug" : "suggestion",
    subject,
    description,
    email: email || undefined,
    page: page || undefined,
    ip,
  });

  return Response.json({
    ok: true,
    id: fb.id,
    message: "Feedback submitted successfully. Thank you!",
  });
}
