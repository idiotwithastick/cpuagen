// ========================================================================
// Agent Loop API — SSE streaming endpoint for Tier 2 agent loop
// ========================================================================
// POST /api/agent — Runs the multi-turn agent loop with tool calling
// ========================================================================

import { runAgentLoopStreaming, type AgentConfig } from "@/lib/agent-loop";
import { thermosolve, cbfCheck } from "@/lib/enforcement";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json();
  const { query, provider, model, apiKey, maxIterations } = body;

  if (!query || typeof query !== "string") {
    return Response.json({ ok: false, error: "Missing query" }, { status: 400 });
  }

  // Pre-flight enforcement on the query itself
  const sig = thermosolve(query);
  const cbf = cbfCheck(sig);
  if (!cbf.allSafe) {
    return Response.json({ ok: false, error: "CBF pre-check failed", cbf }, { status: 403 });
  }

  const resolvedProvider = provider || "demo";
  const resolvedModel = model || "";
  const resolvedKey = apiKey || "";

  // Map provider names to agent-loop provider format
  const providerMap: Record<string, AgentConfig["provider"]> = {
    openai: "openai",
    anthropic: "anthropic",
    google: "google",
    xai: "xai",
  };

  const agentProvider = providerMap[resolvedProvider];
  if (!agentProvider) {
    return Response.json(
      { ok: false, error: `Agent loop requires openai, anthropic, google, or xai provider. Go to Settings to select a provider and enter your API key.` },
      { status: 400 },
    );
  }

  if (!resolvedKey) {
    return Response.json(
      { ok: false, error: `No API key provided for ${resolvedProvider}. Go to Settings and enter your ${resolvedProvider} API key.` },
      { status: 400 },
    );
  }

  if (!resolvedModel) {
    return Response.json(
      { ok: false, error: `No model selected for ${resolvedProvider}. Go to Settings and choose a model.` },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sseEvent = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

      // Send enforcement pre-check
      controller.enqueue(encoder.encode(sseEvent({
        type: "enforcement",
        pre: {
          cbf: (() => {
            const schemes = Object.entries(cbf).filter(([k]) => k !== "allSafe");
            const safeCount = schemes.filter(([, v]) => typeof v === "object" && v !== null && (v as { safe: boolean }).safe).length;
            return { allSafe: cbf.allSafe, barrierCount: schemes.length, safeCount };
          })(),
          timing: Date.now(),
        },
      })));

      try {
        const config: AgentConfig = {
          provider: agentProvider,
          apiKey: resolvedKey,
          model: resolvedModel,
          maxIterations: Math.min(maxIterations || 10, 20),
        };

        await runAgentLoopStreaming(query, config, controller, encoder);
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
