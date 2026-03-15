// ========================================================================
// Tier 3 Orchestrator API — Cross-provider task decomposition + synthesis
// ========================================================================
// POST /api/orchestrate — Run multi-model orchestration with SSE streaming
// ========================================================================

import { orchestrateStreaming, defaultProviderSlots, type OrchestratorConfig } from "@/lib/agent-orchestrator";
import { thermosolve, cbfCheck } from "@/lib/enforcement";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json();
  const { query, keys, synthesizer } = body;

  if (!query || typeof query !== "string") {
    return Response.json({ ok: false, error: "Missing query" }, { status: 400 });
  }

  // Pre-flight enforcement
  const sig = thermosolve(query);
  const cbf = cbfCheck(sig);
  if (!cbf.allSafe) {
    return Response.json({ ok: false, error: "CBF pre-check failed", cbf }, { status: 403 });
  }

  // Build provider slots from keys
  const providers = defaultProviderSlots(keys || {});
  if (providers.length < 1) {
    return Response.json(
      { ok: false, error: "At least one provider API key is required (anthropic, openai, google, or xai)" },
      { status: 400 },
    );
  }

  // Determine synthesizer — use the highest-priority provider
  const synthProvider = synthesizer || providers[0];
  const config: OrchestratorConfig = {
    providers,
    synthesizer: {
      provider: synthProvider.provider,
      apiKey: synthProvider.apiKey,
      model: synthProvider.model,
    },
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sseEvent = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

      // Send enforcement pre-check
      const schemes = Object.entries(cbf).filter(([k]) => k !== "allSafe");
      const safeCount = schemes.filter(([, v]) => typeof v === "object" && v !== null && (v as { safe: boolean }).safe).length;
      controller.enqueue(encoder.encode(sseEvent({
        type: "enforcement",
        pre: {
          cbf: { allSafe: cbf.allSafe, barrierCount: schemes.length, safeCount },
        },
      })));

      try {
        await orchestrateStreaming(query, config, controller, encoder);
      } catch (err) {
        controller.enqueue(encoder.encode(sseEvent({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        })));
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
