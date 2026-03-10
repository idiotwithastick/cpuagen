import { thermosolve, cbfCheck, commitTeep } from "@/lib/enforcement";
import { recordEnforcementRequest, recordTeepCached } from "@/lib/security-state";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequest {
  messages: { role: string; content: string }[];
  provider: string;
  apiKey: string;
  model: string;
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// Strip internal scheme names from CBF results before sending to client
function sanitizeCbf(cbf: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  let i = 1;
  for (const [key, value] of Object.entries(cbf)) {
    if (key === "allSafe") {
      sanitized.allSafe = value;
    } else {
      sanitized[`barrier_${i}`] = value;
      i++;
    }
  }
  return sanitized;
}

async function streamAnthropic(
  messages: { role: string; content: string }[],
  apiKey: string,
  model: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  // Anthropic requires system prompt as a separate 'system' field, not in messages
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");
  const systemText = systemMsgs.map((m) => m.content).join("\n\n");

  const body: Record<string, unknown> = {
    model,
    messages: nonSystemMsgs,
    max_tokens: 4096,
    stream: true,
  };
  if (systemText) {
    body.system = systemText;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    controller.enqueue(encoder.encode(sseEvent({ type: "error", message: `Anthropic API error: ${res.status} - ${err}` })));
    return "";
  }

  const reader = res.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]" || !data) continue;

      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          fullContent += parsed.delta.text;
          controller.enqueue(encoder.encode(sseEvent({ type: "delta", content: parsed.delta.text })));
        }
      } catch {
        // skip
      }
    }
  }
  return fullContent;
}

async function streamOpenAI(
  messages: { role: string; content: string }[],
  apiKey: string,
  model: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    controller.enqueue(encoder.encode(sseEvent({ type: "error", message: `OpenAI API error: ${res.status} - ${err}` })));
    return "";
  }

  const reader = res.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]" || !data) continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          controller.enqueue(encoder.encode(sseEvent({ type: "delta", content: delta })));
        }
      } catch {
        // skip
      }
    }
  }
  return fullContent;
}

async function streamGoogle(
  messages: { role: string; content: string }[],
  apiKey: string,
  model: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  // Google uses systemInstruction for system messages
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");
  const systemText = systemMsgs.map((m) => m.content).join("\n\n");

  const contents = nonSystemMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = { contents };
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    controller.enqueue(encoder.encode(sseEvent({ type: "error", message: `Google API error: ${res.status} - ${err}` })));
    return "";
  }

  const reader = res.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullContent += text;
          controller.enqueue(encoder.encode(sseEvent({ type: "delta", content: text })));
        }
      } catch {
        // skip
      }
    }
  }
  return fullContent;
}

async function streamXAI(
  messages: { role: string; content: string }[],
  apiKey: string,
  model: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  // xAI uses OpenAI-compatible API
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    controller.enqueue(encoder.encode(sseEvent({ type: "error", message: `xAI API error: ${res.status} - ${err}` })));
    return "";
  }

  const reader = res.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]" || !data) continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          controller.enqueue(encoder.encode(sseEvent({ type: "delta", content: delta })));
        }
      } catch {
        // skip
      }
    }
  }
  return fullContent;
}

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, provider: rawProvider, apiKey: clientKey, model: rawModel } = body;

  if (!messages?.length || !rawProvider || !rawModel) {
    return new Response("Missing required fields", { status: 400 });
  }

  // Demo mode: resolve to real provider + server-side API key
  let provider = rawProvider;
  let apiKey = clientKey || "";
  let model = rawModel;

  if (rawProvider === "demo") {
    // Map demo models to real providers
    const demoMap: Record<string, { provider: string; envKey: string }> = {
      "gemini-2.0-flash": { provider: "google", envKey: "DEMO_GOOGLE_KEY" },
      "gpt-4o-mini": { provider: "openai", envKey: "DEMO_OPENAI_KEY" },
    };
    const mapping = demoMap[rawModel];
    if (!mapping) {
      return new Response("Unknown demo model", { status: 400 });
    }
    const serverKey = process.env[mapping.envKey];
    if (!serverKey) {
      return new Response("Demo mode not configured. Please use your own API key.", { status: 503 });
    }
    provider = mapping.provider;
    apiKey = serverKey;
    model = rawModel;
  } else if (!clientKey) {
    return new Response("Missing API key", { status: 400 });
  }

  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  const encoder = new TextEncoder();

  // Extract IP for admin tracking
  const forwarded = req.headers.get("x-forwarded-for");
  const requestIp = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // PRE-ENFORCEMENT
        const preSig = thermosolve(lastUserMsg?.content || "");
        const preCbf = cbfCheck(preSig);

        // Record pre-enforcement to admin dashboard
        const failedPre = Object.entries(preCbf)
          .filter(([k, v]) => k !== "allSafe" && v !== true)
          .map(([k]) => k);
        recordEnforcementRequest(preCbf.allSafe as boolean, failedPre.length > 0 ? failedPre : undefined, requestIp, "PRE-VALIDATION");

        controller.enqueue(
          encoder.encode(sseEvent({
            type: "enforcement",
            stage: "pre",
            signature: {
              n: preSig.n,
              S: preSig.S,
              dS: preSig.dS,
              phi: preSig.phi,
              I_truth: preSig.I_truth,
              naturality: preSig.naturality,
              beta_T: preSig.beta_T,
              psi_coherence: preSig.psi_coherence,
              synergy: preSig.synergy,
              cache_hit: preSig.cache_hit,
            },
            cbf: sanitizeCbf(preCbf),
          })),
        );

        if (!preCbf.allSafe) {
          controller.enqueue(
            encoder.encode(sseEvent({
              type: "error",
              message: "Input blocked by safety barrier. Validation failed.",
            })),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        // STREAM FROM LLM
        let fullContent = "";
        switch (provider) {
          case "anthropic":
            fullContent = await streamAnthropic(messages, apiKey, model, controller, encoder);
            break;
          case "openai":
            fullContent = await streamOpenAI(messages, apiKey, model, controller, encoder);
            break;
          case "google":
            fullContent = await streamGoogle(messages, apiKey, model, controller, encoder);
            break;
          case "xai":
            fullContent = await streamXAI(messages, apiKey, model, controller, encoder);
            break;
          default:
            controller.enqueue(encoder.encode(sseEvent({ type: "error", message: `Unknown provider: ${provider}` })));
        }

        // POST-ENFORCEMENT
        if (fullContent) {
          const postSig = thermosolve(fullContent);
          const postCbf = cbfCheck(postSig);

          // AGF Protocol Step 5: Commit to TEEP ledger for future O(1) hits
          const teepId = commitTeep(fullContent, postSig, postCbf.allSafe as boolean);

          // Record post-enforcement to admin dashboard
          const failedPost = Object.entries(postCbf)
            .filter(([k, v]) => k !== "allSafe" && v !== true)
            .map(([k]) => k);
          recordEnforcementRequest(postCbf.allSafe as boolean, failedPost.length > 0 ? failedPost : undefined, requestIp, "POST-VALIDATION");
          recordTeepCached(teepId, requestIp);

          controller.enqueue(
            encoder.encode(sseEvent({
              type: "enforcement",
              stage: "post",
              signature: {
                n: postSig.n,
                S: postSig.S,
                dS: postSig.dS,
                phi: postSig.phi,
                I_truth: postSig.I_truth,
                naturality: postSig.naturality,
                beta_T: postSig.beta_T,
                psi_coherence: postSig.psi_coherence,
                synergy: postSig.synergy,
                cache_hit: postSig.cache_hit,
              },
              cbf: sanitizeCbf(postCbf),
              teepId,
            })),
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(encoder.encode(sseEvent({ type: "error", message: msg })));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
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
