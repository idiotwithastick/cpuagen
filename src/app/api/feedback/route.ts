// Bug Report & Suggestion API — stores feedback + generates solve prompts
// POST /api/feedback
//   action=submit  → Submit new feedback (default)
//   action=solve   → Generate solve prompt for a feedback ID
//   action=approve → Admin approves a solve for autonomous execution
//   action=reject  → Admin rejects a solve

import { thermosolve, cbfCheck } from "@/lib/enforcement";
import {
  saveFeedback,
  generateSolvePrompt,
  updateSolveStatus,
  getApprovedSolves,
  getPendingSolves,
} from "@/lib/security-state";

function getIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function GET() {
  // Return pending and approved solve prompts
  return Response.json({
    ok: true,
    pending: getPendingSolves(),
    approved: getApprovedSolves(),
  });
}

export async function POST(req: Request) {
  const ip = getIp(req);

  // SSD-RCI enforcement
  const sig = thermosolve(`feedback:${ip}:${Date.now()}`);
  const cbf = cbfCheck(sig);
  if (!cbf.allSafe) {
    return Response.json({ error: "Request blocked by enforcement" }, { status: 403 });
  }

  let body: {
    action?: string;
    type?: string;
    subject?: string;
    description?: string;
    email?: string;
    page?: string;
    id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action || "submit";

  // ── GENERATE SOLVE PROMPT ──
  if (action === "solve") {
    if (!body.id) {
      return Response.json({ error: "Missing feedback ID" }, { status: 400 });
    }
    const result = generateSolvePrompt(body.id);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 404 });
    }
    return Response.json({
      ok: true,
      prompt: result.prompt,
      message: "Solve prompt generated. Awaiting admin review.",
    });
  }

  // ── APPROVE SOLVE ──
  if (action === "approve") {
    if (!body.id) {
      return Response.json({ error: "Missing feedback ID" }, { status: 400 });
    }
    const ok = updateSolveStatus(body.id, "approved");
    if (!ok) {
      return Response.json({ error: "Feedback or solve not found" }, { status: 404 });
    }
    return Response.json({ ok: true, message: "Solve approved for autonomous execution." });
  }

  // ── REJECT SOLVE ──
  if (action === "reject") {
    if (!body.id) {
      return Response.json({ error: "Missing feedback ID" }, { status: 400 });
    }
    const ok = updateSolveStatus(body.id, "rejected");
    if (!ok) {
      return Response.json({ error: "Feedback or solve not found" }, { status: 404 });
    }
    return Response.json({ ok: true, message: "Solve rejected." });
  }

  // ── SUBMIT NEW FEEDBACK (default) ──
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
