// ========================================================================
// TEEP State Persistence API — v12.0
// ========================================================================
// GET  /api/teep → Export engine snapshot (PsiState + top TEEPs + Fisher weights)
// POST /api/teep → Import engine snapshot (restore from client localStorage)
// ========================================================================

import { exportEngineState, importEngineState, seedFromD1 } from "@/lib/enforcement";

export const runtime = "nodejs";

let d1SeedAttempted = false;

export async function GET() {
  // Auto-seed from D1 on first request (loads persisted TEEPs into RAM)
  if (!d1SeedAttempted) {
    d1SeedAttempted = true;
    try {
      const seeded = await seedFromD1();
      if (seeded.teeps > 0 || seeded.basins > 0) {
        console.log(`[TEEP] Auto-seeded from D1: ${seeded.teeps} TEEPs, ${seeded.basins} basins`);
      }
    } catch {
      // D1 not configured or unavailable — continue with in-memory state
    }
  }

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

    if (!body.snapshot || !["12.0", "13.0", "14.0"].includes(body.snapshot.version)) {
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
