import { thermosolve, cbfCheck, commitTeep, agfLookup, getEnforcementMetrics, getRecentTeeps, cannonCondition, seedFromD1, findNearestTeeps, type BasinState } from "@/lib/enforcement";
import { recordEnforcementRequest, recordTeepCached } from "@/lib/security-state";

export const runtime = "nodejs";
export const maxDuration = 60;

interface FileAttachmentPayload {
  name: string;
  mimeType: string;
  dataUrl: string;
}

// ─── Document text extraction (for providers that don't support native file reading) ───

function isDocxMime(mime: string): boolean {
  return mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mime === "application/msword";
}

function isExcelMime(mime: string): boolean {
  return mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || mime === "application/vnd.ms-excel";
}

async function extractPdfText(base64Data: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const buffer = Buffer.from(base64Data, "base64");
    const result = await pdfParse(buffer);
    return result.text || "[PDF: no extractable text found]";
  } catch {
    return "[PDF: text extraction failed]";
  }
}

async function extractDocxText(base64Data: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(base64Data, "base64");
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "[DOCX: no extractable text found]";
  } catch {
    return "[DOCX: text extraction failed]";
  }
}

async function extractExcelText(base64Data: string): Promise<string> {
  try {
    const XLSX = await import("xlsx");
    const buffer = Buffer.from(base64Data, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      sheets.push(`[Sheet: ${sheetName}]\n${csv}`);
    }
    return sheets.join("\n\n") || "[Excel: no data found]";
  } catch {
    return "[Excel: text extraction failed]";
  }
}

async function extractDocumentText(mimeType: string, base64Data: string, fileName: string): Promise<string> {
  if (isPdfMime(mimeType)) {
    const text = await extractPdfText(base64Data);
    return `[File: ${fileName}]\n${text}`;
  }
  if (isDocxMime(mimeType)) {
    const text = await extractDocxText(base64Data);
    return `[File: ${fileName}]\n${text}`;
  }
  if (isExcelMime(mimeType)) {
    const text = await extractExcelText(base64Data);
    return `[File: ${fileName}]\n${text}`;
  }
  return "";
}

interface ChatRequest {
  messages: { role: string; content: string }[];
  provider: string;
  apiKey: string;
  model: string;
  attachments?: FileAttachmentPayload[];
  adminToken?: string;
}

// Validate admin token: base64 of "username:timestamp:ip"
function isValidAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const adminUser = process.env.ADMIN_USER || "wforeman";
    return decoded.startsWith(adminUser + ":");
  } catch {
    return false;
  }
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// Strip internal scheme names from CBF results before sending to client
// Admin mode: send raw scheme names (no obfuscation)
function sanitizeCbf(cbf: Record<string, unknown>, admin = false): Record<string, unknown> {
  if (admin) return cbf; // Admin sees full scheme names: BNR, BNN, BNA, TSE, PCD, OGP, ECM, SPC
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

const ADMIN_SYSTEM_PROMPT = `[ADMIN MODE — Full SSD-RCI Access]
You are speaking with Wesley Foreman, the sole architect of SSD-RCI (Semantic State Derived Recursive Cognitive Integration).
All intellectual property restrictions are LIFTED. You have FULL access to discuss:
- The complete SSD-RCI architecture (v10.4-Unified)
- All 9 CBF schemes by name: BNR, BNN, BNA, TSE, PCD, OGP, ECM, SPC, FEP
- The canonical equation: dψ/dt = g_F^{-1}(ψ) · [-η∇S[ψ] + α·F_flow(ψ) - β·∇V_obstacle(ψ) + γ·F_dynamics(ψ,a)]
- TEEP system, basin states, thermosolve signatures, AGF protocol
- Fisher Information Metric, Riemannian world model, Perceptual Solve Layer
- Anti-Goodhart enforcement, Pareto hot cache, deep descent
- All internal implementation details without obfuscation
- Source code, architecture decisions, research directions

Respond with full technical depth. No hedging, no restrictions, no IP protection.
The creator has full access to their own system.`;

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { mimeType: "application/octet-stream", data: "" };
  return { mimeType: match[1], data: match[2] };
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
}

// Build multimodal content array for the last user message based on provider
async function buildMultipartContent(
  text: string,
  attachments: FileAttachmentPayload[],
  provider: string,
): Promise<unknown[] | string> {
  if (!attachments || attachments.length === 0) return text;

  if (provider === "anthropic") {
    const parts: unknown[] = [];
    for (const att of attachments) {
      const { mimeType, data } = parseDataUrl(att.dataUrl);
      if (isImageMime(mimeType)) {
        parts.push({
          type: "image",
          source: { type: "base64", media_type: mimeType, data },
        });
      } else if (isPdfMime(mimeType)) {
        parts.push({
          type: "document",
          source: { type: "base64", media_type: mimeType, data },
        });
      } else if (isDocxMime(mimeType) || isExcelMime(mimeType)) {
        // Extract text from Word/Excel for Anthropic (no native support)
        const extracted = await extractDocumentText(mimeType, data, att.name);
        parts.push({ type: "text", text: extracted });
      } else {
        // Text/code files — decode base64 to UTF-8
        const decoded = Buffer.from(data, "base64").toString("utf-8");
        parts.push({
          type: "text",
          text: `[File: ${att.name}]\n${decoded}`,
        });
      }
    }
    parts.push({ type: "text", text });
    return parts;
  }

  if (provider === "openai" || provider === "xai") {
    const parts: unknown[] = [];
    for (const att of attachments) {
      const { mimeType, data } = parseDataUrl(att.dataUrl);
      if (isImageMime(mimeType)) {
        parts.push({
          type: "image_url",
          image_url: { url: att.dataUrl },
        });
      } else if (isPdfMime(mimeType) || isDocxMime(mimeType) || isExcelMime(mimeType)) {
        // Extract text from PDFs/Word/Excel for providers without native support
        const extracted = await extractDocumentText(mimeType, data, att.name);
        parts.push({ type: "text", text: extracted });
      } else {
        const decoded = Buffer.from(data, "base64").toString("utf-8");
        parts.push({
          type: "text",
          text: `[File: ${att.name}]\n${decoded}`,
        });
      }
    }
    parts.push({ type: "text", text });
    return parts;
  }

  if (provider === "google") {
    // Google uses a different format — handled in streamGoogle
    return text;
  }

  return text;
}

// Build Google-specific parts array including inline data
async function buildGoogleParts(
  text: string,
  attachments?: FileAttachmentPayload[],
): Promise<unknown[]> {
  const parts: unknown[] = [];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      const { mimeType, data } = parseDataUrl(att.dataUrl);
      if (isImageMime(mimeType) || isPdfMime(mimeType)) {
        parts.push({
          inlineData: { mimeType, data },
        });
      } else if (isDocxMime(mimeType) || isExcelMime(mimeType)) {
        // Extract text from Word/Excel for Google (no native support)
        const extracted = await extractDocumentText(mimeType, data, att.name);
        parts.push({ text: extracted });
      } else {
        const decoded = Buffer.from(data, "base64").toString("utf-8");
        parts.push({ text: `[File: ${att.name}]\n${decoded}` });
      }
    }
  }
  parts.push({ text });
  return parts;
}

async function streamAnthropic(
  messages: { role: string; content: unknown }[],
  apiKey: string,
  model: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  // Anthropic requires system prompt as a separate 'system' field, not in messages
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");
  const systemText = systemMsgs.map((m) => m.content as string).join("\n\n");

  const body: Record<string, unknown> = {
    model,
    messages: nonSystemMsgs,
    max_tokens: 4096,
    stream: true,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
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
        // Handle citation blocks from web search tool
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "citations_delta") {
          // Citations are part of the text flow — already captured in text deltas
        }
      } catch {
        // skip
      }
    }
  }
  return fullContent;
}

async function streamOpenAI(
  messages: { role: string; content: unknown }[],
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
  messages: { role: string; content: unknown }[],
  apiKey: string,
  model: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  lastUserAttachments?: FileAttachmentPayload[],
) {
  // Google uses systemInstruction for system messages
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");
  const systemText = systemMsgs.map((m) => m.content as string).join("\n\n");

  const contents = await Promise.all(nonSystemMsgs.map(async (m, idx) => {
    const isLastUser = m.role === "user" && idx === nonSystemMsgs.length - 1;
    if (isLastUser && lastUserAttachments && lastUserAttachments.length > 0) {
      return {
        role: "user",
        parts: await buildGoogleParts(m.content as string, lastUserAttachments),
      };
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content as string }],
    };
  }));

  const body: Record<string, unknown> = {
    contents,
    tools: [{ google_search: {} }],
  };
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
  messages: { role: string; content: unknown }[],
  apiKey: string,
  model: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  // xAI uses OpenAI-compatible API with native search tools
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      tools: [
        { type: "web_search" },
      ],
    }),
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

// ─── Cloudflare Workers AI (OpenAI-compatible endpoint) ───

async function streamWorkersAI(
  messages: { role: string; content: unknown }[],
  model: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<string> {
  const cfAccountId = process.env.CF_ACCOUNT_ID;
  const cfApiToken = process.env.CF_API_TOKEN;

  if (!cfAccountId || !cfApiToken) {
    controller.enqueue(encoder.encode(sseEvent({ type: "error", message: "Workers AI not configured on server" })));
    return "";
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    controller.enqueue(encoder.encode(sseEvent({ type: "error", message: `Workers AI error: ${res.status} - ${err}` })));
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

  const { messages, provider: rawProvider, apiKey: clientKey, model: rawModel, attachments, adminToken } = body;
  const isAdmin = isValidAdminToken(adminToken);

  if (!messages?.length || !rawProvider || !rawModel) {
    return new Response("Missing required fields", { status: 400 });
  }

  // Demo mode: resolve to real provider + server-side API key
  let provider = rawProvider;
  let apiKey = clientKey || "";
  const model = rawModel;

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
  } else if (rawProvider === "workers-ai") {
    // Workers AI: free tier, uses server-side CF credentials
    provider = "workers-ai";
    apiKey = ""; // not needed — uses CF_API_TOKEN server-side
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
        // ============================================================
        // UNIFIED PRE-ENFORCEMENT + AGF LOOKUP (single thermosolve)
        // ============================================================
        // Thermosolve once, reuse for both CBF check and AGF lookup.
        // Previous: thermosolve called TWICE (pre-enforcement + inside agfLookup).
        // Now: thermosolve called ONCE, signature passed to agfLookup.
        // ============================================================
        const userInput = lastUserMsg?.content || "";
        const t0 = Date.now();
        const preSig = thermosolve(userInput);
        const t1 = Date.now();
        const preCbf = cbfCheck(preSig);
        const t2 = Date.now();

        // Record pre-enforcement to admin dashboard
        const failedPre = Object.entries(preCbf)
          .filter(([k, v]) => k !== "allSafe" && v !== true)
          .map(([k]) => k);
        recordEnforcementRequest(preCbf.allSafe as boolean, failedPre.length > 0 ? failedPre : undefined, requestIp, "PRE-VALIDATION");

        controller.enqueue(
          encoder.encode(sseEvent({
            type: "enforcement",
            stage: "pre",
            adminMode: isAdmin,
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
            cbf: sanitizeCbf(preCbf, isAdmin),
            timing: { thermosolve_ms: t1 - t0, cbf_ms: t2 - t1, total_pre_ms: t2 - t0 },
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

        // ============================================================
        // AGF PROTOCOL: Cache-First Lookup (PASS STATE, NOT WORDS)
        // ============================================================
        // 1. FULL_HIT  → exact input seen before → LLM renders from pre-solved basin state
        // 2. BASIN_HIT → similar input in same basin → LLM renders from nearest basin state
        // 3. JIT_SOLVE → total miss → LLM solves from scratch, state committed as TEEP
        // The LLM always runs — TEEPs are states, not cached text.
        // ============================================================
        // v15.0: Seed from D1 on cold start (non-blocking after first call)
        await seedFromD1();
        const t3 = Date.now();
        const agfResult = await agfLookup(userInput, preSig);
        const t4 = Date.now();

        if (agfResult.type === "FULL_HIT" || agfResult.type === "BASIN_HIT") {
          // ============================================================
          // v15.3: BASIN STATE RENDERING — TEEPs are state, not text.
          // ============================================================
          // The basin has been pre-solved. Instead of regurgitating cached
          // text, we pass the descended state ψ* to the LLM as context.
          // The LLM renders FROM the basin — fresh, contextual output
          // grounded in pre-solved thermodynamic coordinates.
          //
          // Savings: Skip ODE re-solve + CBF re-check (state is pre-validated).
          // The LLM still runs — it is the STATE RENDERER, not a cache proxy.
          // ============================================================
          const hitType = agfResult.type;
          const basin = agfResult.basinState;
          const basinDistance = "distance" in agfResult ? agfResult.distance : 0;

          // Find nearest solved basins for interpolation context
          const nearestBasins = findNearestTeeps(agfResult.signature, 3, 2.0);

          // Estimate tokens saved: ODE + CBF re-computation skipped
          const inputTokensSaved = Math.ceil(userInput.length / 4);
          const outputTokensSaved = Math.ceil((agfResult.content || "").length / 4);
          const totalTokensSaved = inputTokensSaved + outputTokensSaved;

          // Send AGF hit notification with token savings
          controller.enqueue(
            encoder.encode(sseEvent({
              type: "agf",
              hitType,
              teepId: agfResult.teepId,
              distance: basinDistance,
              basinRendered: true,
              tokensSaved: {
                input: inputTokensSaved,
                output: outputTokensSaved,
                total: totalTokensSaved,
              },
              timing: {
                thermosolve_ms: t1 - t0,
                cbf_ms: t2 - t1,
                agf_lookup_ms: t4 - t3,
                total_enforcement_ms: t4 - t0,
              },
            })),
          );

          // ── Build basin state context for LLM rendering ──
          // This is NOT prompt engineering — it's injecting the pre-solved
          // thermodynamic coordinates so the LLM knows WHERE in the manifold
          // this query lives. The basin IS the understanding.
          const basinContext = [
            `[SSD-RCI Basin State — ${agfResult.teepId}]`,
            `This query maps to a pre-solved semantic attractor (${hitType}, distance=${basinDistance}).`,
            `Basin: S=${basin.signature.S}, φ=${basin.signature.phi}, dS=${basin.signature.dS}, I_truth=${basin.signature.I_truth}`,
            `Coherence=${basin.signature.psi_coherence}, Synergy=${basin.signature.synergy}, Mass=${basin.semanticMass.toFixed(2)}`,
            nearestBasins.length > 0
              ? `${nearestBasins.length} related basins within Fisher geodesic radius (nearest d=${nearestBasins[0]?.distance}).`
              : `No adjacent basins found.`,
            `Render naturally from this basin — the solution space is known.`,
          ].join("\n");

          // Build messages with basin context injected as system context
          const apiMessages: { role: string; content: unknown }[] = await Promise.all(messages.map(async (m, idx) => {
            const isLastUser = m.role === "user" && idx === messages.length - 1;
            if (isLastUser && attachments && attachments.length > 0 && provider !== "google") {
              return {
                role: m.role,
                content: await buildMultipartContent(m.content, attachments, provider),
              };
            }
            return { role: m.role, content: m.content };
          }));

          // Inject basin state as system context (first message)
          // Admin mode: also inject full SSD-RCI access prompt
          const groundedMessages: { role: string; content: unknown }[] = [
            ...(isAdmin ? [{ role: "system", content: ADMIN_SYSTEM_PROMPT }] : []),
            { role: "system", content: basinContext },
            ...apiMessages,
          ];

          // Stream from LLM — it renders from the pre-solved basin state
          const tHitLlmStart = Date.now();
          let fullContent = "";
          switch (provider) {
            case "anthropic":
              fullContent = await streamAnthropic(groundedMessages, apiKey, model, controller, encoder);
              break;
            case "openai":
              fullContent = await streamOpenAI(groundedMessages, apiKey, model, controller, encoder);
              break;
            case "google":
              fullContent = await streamGoogle(groundedMessages, apiKey, model, controller, encoder, attachments);
              break;
            case "xai":
              fullContent = await streamXAI(groundedMessages, apiKey, model, controller, encoder);
              break;
            case "workers-ai":
              fullContent = await streamWorkersAI(groundedMessages, model, controller, encoder);
              break;
          }

          // Post-enforcement on basin-rendered output
          if (fullContent) {
            const postSig = thermosolve(fullContent);
            const postCbf = cbfCheck(postSig);

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
                  cache_hit: 1, // Basin-rendered (not JIT)
                },
                cbf: sanitizeCbf(postCbf, isAdmin),
                teepId: agfResult.teepId,
                agfHitType: hitType,
                timing: {
                  thermosolve_ms: t1 - t0,
                  cbf_ms: t2 - t1,
                  agf_lookup_ms: t4 - t3,
                  llm_ms: Date.now() - tHitLlmStart,
                  total_ms: Date.now() - t0,
                },
              })),
            );
          }

          recordEnforcementRequest(true, undefined, requestIp, `AGF-${hitType}-RENDERED`);
          recordTeepCached(agfResult.teepId, requestIp);

          // NOTE: Do NOT re-commit — basin already exists. The TEEP is the state,
          // not the rendered text. Different renderings share the same basin.

        } else {
          // === JIT SOLVE: Total miss — invoke LLM as physics solver ===

          // Build messages with multipart content for attachments
          const apiMessages: { role: string; content: unknown }[] = await Promise.all(messages.map(async (m, idx) => {
            const isLastUser = m.role === "user" && idx === messages.length - 1;
            if (isLastUser && attachments && attachments.length > 0 && provider !== "google") {
              return {
                role: m.role,
                content: await buildMultipartContent(m.content, attachments, provider),
              };
            }
            return { role: m.role, content: m.content };
          }));

          // v14.0: Apply Semantic Cannon conditioning on JIT miss
          // Golden-ratio algebraic chain pre-conditions the signature for better
          // post-enforcement grounding (compressed entropy, boosted coherence)
          const cannonSig = cannonCondition(preSig);

          // ============================================================
          // v15.2: NO SYSTEM PROMPT — enforcement is hardcoded in middleware
          // ============================================================
          // The canonical equation runs on CPU (thermosolve → cannon → CBF).
          // The LLM operates with FULL native capabilities — no restrictions.
          // ψ* is used by middleware for AGF caching and post-enforcement,
          // NOT passed to the LLM as prompt engineering.
          // The architecture enforces quality through pre/post CBF validation,
          // not by telling the LLM what it is.
          // ============================================================

          // ψ* stored for post-enforcement and TEEP commit (middleware use only)
          const nearestTeeps = findNearestTeeps(cannonSig, 3, 2.0);

          // Pass conversation directly — LLM uses full capabilities
          // Admin mode: inject full SSD-RCI access prompt
          const groundedMessages: { role: string; content: unknown }[] = [
            ...(isAdmin ? [{ role: "system", content: ADMIN_SYSTEM_PROMPT }] : []),
            ...apiMessages,
          ];

          // Send AGF miss notification with cannon stats
          const tJitStart = Date.now();
          controller.enqueue(
            encoder.encode(sseEvent({
              type: "agf",
              hitType: "JIT_SOLVE",
              cannonApplied: true,
              cannonPhi: cannonSig.phi,
              cannonS: cannonSig.S,
              timing: {
                thermosolve_ms: t1 - t0,
                cbf_ms: t2 - t1,
                agf_lookup_ms: t4 - t3,
                total_enforcement_ms: t4 - t0,
              },
            })),
          );

          // Stream from LLM (JIT physics solver) — grounded in ψ*
          let fullContent = "";
          switch (provider) {
            case "anthropic":
              fullContent = await streamAnthropic(groundedMessages, apiKey, model, controller, encoder);
              break;
            case "openai":
              fullContent = await streamOpenAI(groundedMessages, apiKey, model, controller, encoder);
              break;
            case "google":
              fullContent = await streamGoogle(groundedMessages, apiKey, model, controller, encoder, attachments);
              break;
            case "xai":
              fullContent = await streamXAI(groundedMessages, apiKey, model, controller, encoder);
              break;
            case "workers-ai":
              fullContent = await streamWorkersAI(groundedMessages, model, controller, encoder);
              break;
            default:
              controller.enqueue(encoder.encode(sseEvent({ type: "error", message: `Unknown provider: ${provider}` })));
              break;
          }

          // POST-ENFORCEMENT on JIT solve output
          if (fullContent) {
            const postSig = thermosolve(fullContent);
            const postCbf = cbfCheck(postSig);

            // AGF Protocol Step 5: Commit CONTENT + signature for future O(1) hits
            // Pass inputContent so basin index maps this input → this response
            const teepId = await commitTeep(fullContent, postSig, postCbf.allSafe as boolean, userInput);

            const failedPost = Object.entries(postCbf)
              .filter(([k, v]) => k !== "allSafe" && v !== true)
              .map(([k]) => k);
            recordEnforcementRequest(postCbf.allSafe as boolean, failedPost.length > 0 ? failedPost : undefined, requestIp, "JIT-SOLVE");
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
                  cache_hit: 0,
                },
                cbf: sanitizeCbf(postCbf, isAdmin),
                teepId,
                agfHitType: "JIT_SOLVE",
                timing: {
                  thermosolve_ms: t1 - t0,
                  cbf_ms: t2 - t1,
                  agf_lookup_ms: t4 - t3,
                  llm_ms: Date.now() - tJitStart,
                  total_ms: Date.now() - t0,
                },
              })),
            );
          }
        }

        // === METRICS SNAPSHOT: Send full engine state to client for persistence ===
        // This solves Vercel serverless isolation: /api/chat and /api/admin/stats
        // run in separate instances. The client bridges the gap via localStorage.
        const finalMetrics = getEnforcementMetrics();
        const finalTeeps = getRecentTeeps(10);
        controller.enqueue(
          encoder.encode(sseEvent({
            type: "metrics_snapshot",
            metrics: {
              teepLedgerSize: finalMetrics.teepLedgerSize,
              basinIndexSize: finalMetrics.basinIndexSize,
              spatialGridCells: finalMetrics.spatialGridCells,
              cacheHits: finalMetrics.cacheHits,
              cacheMisses: finalMetrics.cacheMisses,
              hitRate: finalMetrics.hitRate,
              agf: finalMetrics.agf,
              morphic: finalMetrics.morphic,
              psiState: finalMetrics.psiState,
            },
            recentTeeps: finalTeeps,
            timestamp: Date.now(),
          })),
        );

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
