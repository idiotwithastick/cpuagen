import { thermosolve, findNearestTeeps } from "@/lib/enforcement";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { query, k = 10, maxDistance = 3.0 } = await req.json();
    if (!query || typeof query !== "string") {
      return Response.json({ error: "Missing query" }, { status: 400 });
    }

    const sig = thermosolve(query);
    const results = findNearestTeeps(sig, Math.min(k, 25), maxDistance);

    return Response.json({
      ok: true,
      query,
      signature: {
        n: sig.n,
        S: sig.S,
        dS: sig.dS,
        phi: sig.phi,
        I_truth: sig.I_truth,
        psi_coherence: sig.psi_coherence,
      },
      results: results.map((t) => ({
        id: t.id,
        content: t.content.slice(0, 300),
        distance: Math.round(t.distance * 1000) / 1000,
        signature: {
          S: t.signature.S,
          phi: t.signature.phi,
          I_truth: t.signature.I_truth,
        },
      })),
      count: results.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
