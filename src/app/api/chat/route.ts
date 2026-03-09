import { thermosolve, cbfCheck, generateTeepId } from "@/lib/enforcement";

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

async function streamAnthropic(
  messages: { role: string; content: string }[],
  apiKey: string,
  model: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: messages.filter((m) => m.role !== "system"),
      max_tokens: 4096,
      stream: true,
    }),
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
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
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

  const { messages, provider, apiKey, model } = body;

  if (!messages?.length || !provider || !apiKey || !model) {
    return new Response("Missing required fields", { status: 400 });
  }

  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // PRE-ENFORCEMENT
        const preSig = thermosolve(lastUserMsg?.content || "");
        const preCbf = cbfCheck(preSig);
        controller.enqueue(
          encoder.encode(sseEvent({
            type: "enforcement",
            stage: "pre",
            signature: preSig,
            cbf: preCbf,
          })),
        );

        if (!preCbf.allSafe) {
          controller.enqueue(
            encoder.encode(sseEvent({
              type: "error",
              message: "Input blocked by Control Barrier Function. CBF violation detected.",
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
          const teepId = generateTeepId();
          controller.enqueue(
            encoder.encode(sseEvent({
              type: "enforcement",
              stage: "post",
              signature: postSig,
              cbf: postCbf,
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
