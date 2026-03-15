// ========================================================================
// Multi-Model Consensus API
// ========================================================================
// POST /api/consensus — Query 3+ LLM providers in parallel, enforce each
//   response through the validation engine, compute consensus score.
// ========================================================================

import {
  thermosolve,
  cbfCheck,
  ensembleThermosolve,
} from "@/lib/enforcement";

export const runtime = "nodejs";
export const maxDuration = 120;

/* ─── Provider Configuration ─── */

interface ProviderSlot {
  id: string;
  name: string;
  model: string;
  apiKey: string;
}

interface ProviderResponse {
  provider: string;
  model: string;
  content: string;
  latencyMs: number;
  error?: string;
}

function buildProviderSlots(keys: Record<string, string>): ProviderSlot[] {
  const slots: ProviderSlot[] = [];

  if (keys.anthropic || process.env.ANTHROPIC_API_KEY) {
    slots.push({
      id: "anthropic",
      name: "Anthropic",
      model: "claude-sonnet-4-6",
      apiKey: keys.anthropic || process.env.ANTHROPIC_API_KEY || "",
    });
  }

  if (keys.openai || process.env.OPENAI_API_KEY) {
    slots.push({
      id: "openai",
      name: "OpenAI",
      model: "gpt-4o",
      apiKey: keys.openai || process.env.OPENAI_API_KEY || "",
    });
  }

  if (keys.google || process.env.GOOGLE_API_KEY) {
    slots.push({
      id: "google",
      name: "Google",
      model: "gemini-2.0-flash",
      apiKey: keys.google || process.env.GOOGLE_API_KEY || "",
    });
  }

  if (keys.xai || process.env.XAI_API_KEY) {
    slots.push({
      id: "xai",
      name: "xAI",
      model: "grok-3-mini-fast",
      apiKey: keys.xai || process.env.XAI_API_KEY || "",
    });
  }

  return slots;
}

/* ─── Provider Call Functions (non-streaming, full response) ─── */

async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const blocks = data.content || [];
  return blocks
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
}

async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGoogle(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callXAI(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`xAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

const CALLERS: Record<string, (p: string, k: string, m: string) => Promise<string>> = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  google: callGoogle,
  xai: callXAI,
};

/* ─── Signature Translation (internal → public terminology) ─── */

function translateSignature(sig: Record<string, number>) {
  return {
    coherenceScore: sig.phi,
    truthScore: sig.I_truth,
    convergenceRate: sig.dS,
    informationScore: sig.S,
    naturalLanguageScore: sig.naturality,
    balanceScore: sig.beta_T,
    coherenceMultiscale: sig.psi_coherence,
    synergyIndex: sig.synergy,
    qualityFactor: sig.Q_quality,
    errorCount: sig.error_count,
    particleCount: sig.n,
    energy: sig.energy,
    cachedSolution: sig.cache_hit === 1,
  };
}

function translateBarriers(cbf: Record<string, unknown>) {
  const barriers: { name: string; safe: boolean; value: number }[] = [];
  let idx = 1;
  for (const [key, val] of Object.entries(cbf)) {
    if (key === "allSafe") continue;
    const v = val as { safe: boolean; value: number };
    barriers.push({ name: `barrier_${idx}`, safe: v.safe, value: v.value });
    idx++;
  }
  return {
    allPassed: cbf.allSafe as boolean,
    barriers,
  };
}

/* ─── POST Handler ─── */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, keys } = body;

    if (!prompt || typeof prompt !== "string") {
      return Response.json(
        { ok: false, error: "Missing 'prompt' field (string)" },
        { status: 400 },
      );
    }

    // Pre-flight: validate the prompt itself
    const promptSig = thermosolve(prompt);
    const promptCbf = cbfCheck(promptSig);
    if (!promptCbf.allSafe) {
      return Response.json(
        {
          ok: false,
          error: "Prompt failed safety validation",
          promptValidation: {
            semanticSignature: translateSignature(promptSig),
            safetyValidation: translateBarriers(promptCbf),
          },
        },
        { status: 403 },
      );
    }

    // Build available provider slots
    const slots = buildProviderSlots(keys || {});
    if (slots.length === 0) {
      return Response.json(
        {
          ok: false,
          error:
            "No provider API keys available. Set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, or XAI_API_KEY (via environment or request body 'keys').",
        },
        { status: 400 },
      );
    }

    // Query all providers in parallel
    const settled = await Promise.allSettled(
      slots.map(async (slot): Promise<ProviderResponse> => {
        const caller = CALLERS[slot.id];
        if (!caller) throw new Error(`Unknown provider: ${slot.id}`);
        const t0 = Date.now();
        const content = await caller(prompt, slot.apiKey, slot.model);
        return {
          provider: slot.name,
          model: slot.model,
          content,
          latencyMs: Date.now() - t0,
        };
      }),
    );

    // Collect successful responses and errors
    const responses: ProviderResponse[] = [];
    const errors: { provider: string; model: string; error: string }[] = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === "fulfilled") {
        responses.push(result.value);
      } else {
        errors.push({
          provider: slots[i].name,
          model: slots[i].model,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    if (responses.length === 0) {
      return Response.json(
        {
          ok: false,
          error: "All providers failed",
          providerErrors: errors,
        },
        { status: 502 },
      );
    }

    // Enforce each response through thermosolve + safety validation
    const validated = responses.map((r) => {
      const sig = thermosolve(r.content);
      const cbf = cbfCheck(sig);
      return {
        provider: r.provider,
        model: r.model,
        content: r.content,
        latencyMs: r.latencyMs,
        semanticSignature: translateSignature(sig),
        safetyValidation: translateBarriers(cbf),
      };
    });

    // Compute ensemble consensus
    const ensembleInputs = responses.map((r) => ({
      provider: r.provider,
      content: r.content,
    }));
    const ensemble = ensembleThermosolve(ensembleInputs);

    // Determine best response: highest (coherence + truth + synergy) among safe responses
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < validated.length; i++) {
      const v = validated[i];
      if (!v.safetyValidation.allPassed) continue;
      const score =
        v.semanticSignature.coherenceScore +
        v.semanticSignature.truthScore +
        v.semanticSignature.synergyIndex;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    // Build consensus result
    const consensusResult = {
      agreementScore: ensemble.agreement,
      outliers: ensemble.outliers,
      consensusSignature: translateSignature(ensemble.consensus),
      bestResponse: {
        provider: validated[bestIdx].provider,
        model: validated[bestIdx].model,
        combinedScore: Math.round(bestScore * 1000) / 1000,
      },
      providersQueried: slots.length,
      providersSucceeded: responses.length,
      providersFailed: errors.length,
    };

    return Response.json({
      ok: true,
      responses: validated,
      consensus: consensusResult,
      providerErrors: errors.length > 0 ? errors : undefined,
      timing: {
        totalProviders: slots.length,
        successCount: responses.length,
        failCount: errors.length,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
