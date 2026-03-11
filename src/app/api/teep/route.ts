// ========================================================================
// TEEP State Persistence API — v12.0
// ========================================================================
// GET  /api/teep → Export engine snapshot (PsiState + top TEEPs + Fisher weights)
// POST /api/teep → Import engine snapshot (restore from client localStorage)
// ========================================================================

import { exportEngineState, importEngineState } from "@/lib/enforcement";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = exportEngineState();

  return Response.json({
    ok: true,
    snapshot,
    size: JSON.stringify(snapshot).length,
    teepCount: snapshot.teeps.length,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.snapshot || body.snapshot.version !== "12.0") {
      return Response.json({ ok: false, error: "Invalid snapshot format" }, { status: 400 });
    }

    const result = importEngineState(body.snapshot);

    return Response.json({
      ok: true,
      restored: result.restored,
      message: `Restored ${result.restored} TEEPs from snapshot`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
