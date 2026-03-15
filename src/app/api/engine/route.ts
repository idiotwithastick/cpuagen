// ========================================================================
// SSD-RCI Advanced Engine Metrics API
// ========================================================================
// GET  /api/engine → Returns manifold, Ricci, holographic, Fisher, Mach diamonds
// POST /api/engine → Full physics pipeline on arbitrary text
// PUT  /api/engine → Ensemble thermosolve across multiple providers
// ========================================================================

import {
  getManifoldCoverage,
  getRicciDashboard,
  getHolographicProjection,
  getQuantumFisherCoherence,
  getEnforcementMetrics,
  getRecentTeeps,
  thermosolve,
  cbfCheck,
  semanticCannon,
  bekensteinCompress,
  holographicEncode,
  holographicDecode,
  traceTeepChain,
  detectMachDiamonds,
  ensembleThermosolve,
  recordTrajectoryPoint,
  shouldPersist,
} from "@/lib/enforcement";

export const runtime = "nodejs";

export async function GET() {
  const manifold = getManifoldCoverage();
  const ricci = getRicciDashboard();
  const holographic = getHolographicProjection(50);
  const fisher = getQuantumFisherCoherence();
  const metrics = getEnforcementMetrics();
  const persistReady = shouldPersist();

  const recentTeeps = getRecentTeeps(10);

  return Response.json({
    ok: true,
    manifold,
    ricci,
    holographic,
    fisher,
    metrics,
    persistReady,
    recentTeeps,
  });
}

// POST /api/engine — Run thermosolve + cannon + holographic pipeline on arbitrary text
export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return Response.json({ ok: false, error: "Missing 'text' field" }, { status: 400 });
    }

    // Step 1: Thermosolve signature
    const sig = thermosolve(text);

    // Step 2: CBF check
    const cbf = cbfCheck(sig);

    // Step 3: Semantic Cannon (all 3 stages)
    const stage1 = semanticCannon(sig, 1);
    const stage2 = semanticCannon(sig, 2);
    const stage3 = semanticCannon(sig, 3);

    // Step 4: Bekenstein compression
    const compressed = bekensteinCompress(sig);

    // Step 5: Holographic encode
    const holo = holographicEncode(sig);

    // Step 6: Holographic decode (round-trip verification)
    const decoded = holographicDecode(holo.boundary);

    // Step 7: Mach diamond detection
    const machDiamonds = detectMachDiamonds([{ content: text }]);

    // Step 8: TEEP chain trace from a generated ID
    const teepId = `TEEP-${sig.n.toString(16).padStart(8, "0")}`;
    const chain = traceTeepChain(teepId, "both", 5);

    // Step 9: Record trajectory point for manifold coverage
    recordTrajectoryPoint(teepId, sig);

    // Step 10: Persistence readiness
    const persistReady = shouldPersist();

    return Response.json({
      ok: true,
      signature: {
        n: sig.n,
        S: sig.S,
        dS: sig.dS,
        phi: sig.phi,
        energy: sig.energy,
        I_truth: sig.I_truth,
        naturality: sig.naturality,
        psi_coherence: sig.psi_coherence,
        synergy: sig.synergy,
        beta_T: sig.beta_T,
        Q_quality: sig.Q_quality,
        error_count: sig.error_count,
      },
      cbf: {
        allSafe: cbf.allSafe,
        barriers: Object.entries(cbf)
          .filter(([k]) => k !== "allSafe")
          .map(([name, val]) => ({
            name,
            safe: (val as { safe: boolean; value: number }).safe,
            value: (val as { safe: boolean; value: number }).value,
          })),
      },
      cannon: {
        stage1: { method: stage1.method, resonance: stage1.resonance, S: stage1.result.S, phi: stage1.result.phi },
        stage2: { method: stage2.method, resonance: stage2.resonance, S: stage2.result.S, phi: stage2.result.phi },
        stage3: { method: stage3.method, resonance: stage3.resonance, S: stage3.result.S, phi: stage3.result.phi, dS: stage3.result.dS },
      },
      bekenstein: { S: compressed.S, energy: compressed.energy },
      holographic: { boundary: holo.boundary, reconstructionError: holo.reconstructionError },
      decoded,
      machDiamonds,
      chain,
      persistReady,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

// PUT /api/engine — Ensemble thermosolve across multiple providers
export async function PUT(req: Request) {
  try {
    const { inputs } = await req.json();
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return Response.json({ ok: false, error: "Missing 'inputs' array of {provider, content}" }, { status: 400 });
    }
    const result = ensembleThermosolve(inputs);
    return Response.json({ ok: true, ensemble: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
