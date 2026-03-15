/**
 * Extension Tool Execution API
 *
 * POST /api/extensions/tool
 *
 * Executes tool calls from chat when extensions are installed.
 * Supports: web_search, code_execute, fetch_url, image_generate,
 * github_api, slack_send, notion_query, calendar_query, db_query
 */

import { executeTool } from "@/lib/agent-tools";
import { thermosolve, cbfCheck } from "@/lib/enforcement";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const { tool, args, extConfig } = body as {
    tool: string;
    args: Record<string, unknown>;
    extConfig?: Record<string, string>;
  };

  if (!tool || typeof tool !== "string") {
    return Response.json({ ok: false, error: "Missing tool name" }, { status: 400 });
  }

  // CBF pre-check on tool + args
  const sig = thermosolve(JSON.stringify({ tool, args }));
  const cbf = cbfCheck(sig);
  if (!cbf.allSafe) {
    return Response.json({ ok: false, error: "CBF pre-check failed" }, { status: 403 });
  }

  try {
    let result: string;

    switch (tool) {
      case "web_search":
      case "code_execute":
      case "calculator":
      case "file_generate":
      case "fetch_url":
      case "datetime": {
        // Route through existing agent tools
        const toolResult = await executeTool({
          id: `ext-${Date.now()}`,
          name: tool,
          arguments: args,
        });
        result = toolResult.content;
        if (toolResult.error) {
          return Response.json({ ok: false, error: result });
        }
        break;
      }

      case "image_generate": {
        result = await executeImageGenerate(args as { prompt: string; size?: string }, extConfig);
        break;
      }

      case "github_api": {
        result = await executeGitHubAPI(
          args as { endpoint: string; method?: string; body?: unknown },
          extConfig,
        );
        break;
      }

      case "slack_send": {
        result = await executeSlackSend(
          args as { text: string; channel?: string },
          extConfig,
        );
        break;
      }

      case "notion_query": {
        result = await executeNotionQuery(
          args as { action: string; query?: string; pageId?: string; databaseId?: string },
          extConfig,
        );
        break;
      }

      case "calendar_query": {
        result = await executeCalendarQuery(
          args as { action: string; timeMin?: string; timeMax?: string; summary?: string },
          extConfig,
        );
        break;
      }

      case "db_query": {
        result = await executeDBQuery(
          args as { sql: string; params?: (string | number | null)[] },
          extConfig,
        );
        break;
      }

      case "mcp_call": {
        result = await executeMCPCall(
          args as { method: string; params?: Record<string, unknown> },
          extConfig,
        );
        break;
      }

      case "deep_research": {
        result = await executeDeepResearch(
          args as { query: string; depth?: string; max_sources?: number },
        );
        break;
      }

      case "video_generate": {
        result = await executeVideoGenerate(
          args as { prompt: string; duration?: number; aspect_ratio?: string },
          extConfig,
        );
        break;
      }

      case "webhook_send": {
        result = await executeWebhookSend(
          args as { event: string; payload?: Record<string, unknown> },
          extConfig,
        );
        break;
      }

      case "tts_generate": {
        result = await executeTTS(
          args as { text: string; voice?: string },
          extConfig,
        );
        break;
      }

      default:
        return Response.json({ ok: false, error: `Unknown tool: ${tool}` }, { status: 400 });
    }

    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

// ─── Image Generation (DALL-E via OpenAI API) ───

async function executeImageGenerate(
  args: { prompt: string; size?: string },
  config?: Record<string, string>,
): Promise<string> {
  const apiKey = config?.apiKey;
  if (!apiKey) throw new Error("Image generation requires an OpenAI API key. Configure it in the Image Generation extension settings.");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: args.prompt,
      n: 1,
      size: args.size || "1024x1024",
      response_format: "url",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DALL-E API error: ${err}`);
  }

  const data = await res.json() as {
    data: Array<{ url: string; revised_prompt?: string }>;
  };

  const img = data.data[0];
  return JSON.stringify({
    url: img.url,
    revised_prompt: img.revised_prompt,
    type: "image",
  });
}

// ─── GitHub API ───

async function executeGitHubAPI(
  args: { endpoint: string; method?: string; body?: unknown },
  config?: Record<string, string>,
): Promise<string> {
  const token = config?.token;
  if (!token) throw new Error("GitHub integration requires a Personal Access Token. Configure it in the GitHub extension settings.");

  const url = args.endpoint.startsWith("http")
    ? args.endpoint
    : `https://api.github.com${args.endpoint.startsWith("/") ? "" : "/"}${args.endpoint}`;

  const res = await fetch(url, {
    method: args.method || "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(args.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(args.body ? { body: JSON.stringify(args.body) } : {}),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return JSON.stringify(data, null, 2).slice(0, 10000);
}

// ─── Slack Webhook ───

async function executeSlackSend(
  args: { text: string; channel?: string },
  config?: Record<string, string>,
): Promise<string> {
  const webhookUrl = config?.webhookUrl;
  const botToken = config?.botToken;

  if (botToken && args.channel) {
    // Use Bot API for channel-specific messages
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: args.channel, text: args.text }),
    });
    const data = await res.json();
    return JSON.stringify(data);
  }

  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: args.text }),
    });
    return res.ok ? "Message sent successfully" : `Slack error: ${await res.text()}`;
  }

  throw new Error("Slack extension requires a Webhook URL or Bot Token. Configure it in extension settings.");
}

// ─── Notion API ───

async function executeNotionQuery(
  args: { action: string; query?: string; pageId?: string; databaseId?: string },
  config?: Record<string, string>,
): Promise<string> {
  const token = config?.integrationToken;
  if (!token) throw new Error("Notion extension requires an Integration Token. Configure it in extension settings.");

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  let url: string;
  let method = "POST";
  let body: string | undefined;

  switch (args.action) {
    case "search":
      url = "https://api.notion.com/v1/search";
      body = JSON.stringify({ query: args.query || "", page_size: 10 });
      break;
    case "get_page":
      url = `https://api.notion.com/v1/pages/${args.pageId}`;
      method = "GET";
      break;
    case "get_database":
      url = `https://api.notion.com/v1/databases/${args.databaseId}/query`;
      body = JSON.stringify({ page_size: 20 });
      break;
    default:
      throw new Error(`Unknown Notion action: ${args.action}`);
  }

  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.stringify(data, null, 2).slice(0, 10000);
}

// ─── Google Calendar API ───

async function executeCalendarQuery(
  args: { action: string; timeMin?: string; timeMax?: string; summary?: string },
  config?: Record<string, string>,
): Promise<string> {
  const apiKey = config?.apiKey;
  const calendarId = config?.calendarId || "primary";
  if (!apiKey) throw new Error("Calendar extension requires a Google API Key. Configure it in extension settings.");

  switch (args.action) {
    case "list": {
      const params = new URLSearchParams({
        key: apiKey,
        timeMin: args.timeMin || new Date().toISOString(),
        timeMax: args.timeMax || new Date(Date.now() + 7 * 86400000).toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "20",
      });
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!res.ok) throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return JSON.stringify(data, null, 2).slice(0, 8000);
    }
    default:
      throw new Error(`Calendar action "${args.action}" requires OAuth2. Only "list" is available with API key.`);
  }
}

// ─── Database Explorer (Cloudflare D1) ───

async function executeDBQuery(
  args: { sql: string; params?: (string | number | null)[] },
  config?: Record<string, string>,
): Promise<string> {
  const accountId = config?.accountId;
  const databaseId = config?.databaseId;
  const apiToken = config?.apiToken;

  if (!accountId || !databaseId || !apiToken) {
    throw new Error("Database Explorer requires Account ID, Database ID, and API Token. Configure in extension settings.");
  }

  // Safety: block destructive queries
  const sqlUpper = args.sql.trim().toUpperCase();
  if (sqlUpper.startsWith("DROP") || sqlUpper.startsWith("DELETE") || sqlUpper.startsWith("TRUNCATE") || sqlUpper.startsWith("ALTER")) {
    throw new Error("Destructive queries (DROP, DELETE, TRUNCATE, ALTER) are blocked for safety. Use SELECT or INSERT only.");
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: args.sql, params: args.params || [] }),
    },
  );

  if (!res.ok) throw new Error(`D1 API ${res.status}: ${await res.text()}`);
  const data = await res.json() as { result: Array<{ results: unknown[] }> };
  const results = data.result?.[0]?.results || [];
  return JSON.stringify(results, null, 2).slice(0, 10000);
}

// ─── Deep Research Agent ───

async function executeDeepResearch(
  args: { query: string; depth?: string; max_sources?: number },
): Promise<string> {
  const { query, max_sources = 8 } = args;

  // Phase 1: Generate search queries for different angles
  const searchAngles = [
    query,
    `${query} research findings`,
    `${query} latest developments 2026`,
    `${query} expert analysis`,
  ];

  // Phase 2: Execute searches in parallel
  const searchResults: Array<{ title: string; snippet: string; url: string }> = [];

  await Promise.all(
    searchAngles.slice(0, Math.min(searchAngles.length, 4)).map(async (sq) => {
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(sq)}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(ddgUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const data = await res.json() as {
          AbstractText?: string;
          AbstractSource?: string;
          AbstractURL?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
        };

        if (data.AbstractText) {
          searchResults.push({ title: data.AbstractSource || sq, snippet: data.AbstractText, url: data.AbstractURL || "" });
        }
        if (data.RelatedTopics) {
          for (const rt of data.RelatedTopics.slice(0, 3)) {
            if (rt.Text) searchResults.push({ title: rt.Text.slice(0, 80), snippet: rt.Text, url: rt.FirstURL || "" });
          }
        }
      } catch { /* continue */ }
    }),
  );

  // Phase 3: Try Wikipedia for authoritative content
  try {
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (wikiRes.ok) {
      const wd = await wikiRes.json() as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
      if (wd.extract) searchResults.push({ title: `${wd.title} (Wikipedia)`, snippet: wd.extract, url: wd.content_urls?.desktop?.page || "" });
    }
  } catch { /* continue */ }

  // Phase 4: Compile research report
  const uniqueResults = searchResults
    .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i)
    .slice(0, max_sources);

  if (uniqueResults.length === 0) {
    return JSON.stringify({
      type: "research_report",
      query,
      status: "limited",
      summary: `Research on "${query}" returned limited results. Try a more specific query or use fetch_url on known resources.`,
      sources: [],
    });
  }

  const citations = uniqueResults.map((r, i) => `[${i + 1}] ${r.title}\n    ${r.snippet.slice(0, 300)}${r.snippet.length > 300 ? "..." : ""}\n    Source: ${r.url}`).join("\n\n");

  return JSON.stringify({
    type: "research_report",
    query,
    status: "complete",
    source_count: uniqueResults.length,
    findings: citations,
    sources: uniqueResults.map((r, i) => ({ index: i + 1, title: r.title, url: r.url })),
    note: "This report was compiled from automated web searches. Verify critical information from primary sources.",
  });
}

// ─── Video Generation ───

async function executeVideoGenerate(
  args: { prompt: string; duration?: number; aspect_ratio?: string },
  config?: Record<string, string>,
): Promise<string> {
  const provider = config?.provider || "runway";
  const apiKey = config?.apiKey;

  if (!apiKey) throw new Error(`Video generation requires an API key for ${provider}. Configure it in the Video Generation extension settings.`);

  if (provider === "runway") {
    const res = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify({
        model: "gen4_turbo",
        promptText: args.prompt,
        duration: args.duration || 5,
        ratio: args.aspect_ratio || "16:9",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`Runway API ${res.status}: ${await res.text()}`);
    const data = await res.json() as { id?: string; status?: string };
    return JSON.stringify({ type: "video_generation", provider: "runway", taskId: data.id, status: data.status || "processing", message: "Video generation started. Check back for results." });
  }

  throw new Error(`Unsupported video provider: ${provider}. Supported: runway`);
}

// ─── Webhook Automation ───

async function executeWebhookSend(
  args: { event: string; payload?: Record<string, unknown> },
  config?: Record<string, string>,
): Promise<string> {
  const url = config?.url;
  if (!url) throw new Error("Webhook extension requires a URL. Configure it in extension settings.");

  const body = {
    event: args.event,
    timestamp: new Date().toISOString(),
    payload: args.payload || {},
    source: "cpuagen",
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config?.secret) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(config.secret);
    const msgData = encoder.encode(JSON.stringify(body));
    const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, msgData);
    headers["X-Webhook-Signature"] = `sha256=${Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  return JSON.stringify({
    type: "webhook_result",
    status: res.status,
    ok: res.ok,
    message: res.ok ? "Webhook delivered successfully" : `Webhook failed: ${res.status}`,
  });
}

// ─── Text-to-Speech ───

async function executeTTS(
  args: { text: string; voice?: string },
  config?: Record<string, string>,
): Promise<string> {
  const provider = config?.provider || "openai";
  const apiKey = config?.apiKey;

  if (!apiKey) throw new Error(`TTS requires an API key for ${provider}. Configure it in the HD Text-to-Speech extension settings.`);

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1-hd",
        input: args.text.slice(0, 4096),
        voice: args.voice || config?.voiceId || "alloy",
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`OpenAI TTS API ${res.status}: ${await res.text()}`);

    const audioBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString("base64");

    return JSON.stringify({
      type: "audio",
      format: "mp3",
      data_url: `data:audio/mp3;base64,${base64}`,
      text_length: args.text.length,
      voice: args.voice || "alloy",
    });
  }

  if (provider === "elevenlabs") {
    const voiceId = config?.voiceId || "21m00Tcm4TlvDq8ikWAM"; // Rachel default
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: args.text.slice(0, 5000),
        model_id: "eleven_multilingual_v2",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`ElevenLabs API ${res.status}: ${await res.text()}`);

    const audioBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString("base64");

    return JSON.stringify({
      type: "audio",
      format: "mp3",
      data_url: `data:audio/mp3;base64,${base64}`,
      text_length: args.text.length,
      voice: voiceId,
    });
  }

  throw new Error(`Unsupported TTS provider: ${provider}. Supported: openai, elevenlabs`);
}

// ─── MCP Server Bridge ───

async function executeMCPCall(
  args: { method: string; params?: Record<string, unknown> },
  config?: Record<string, string>,
): Promise<string> {
  const serverUrl = config?.serverUrl;
  if (!serverUrl) throw new Error("MCP Server Bridge requires a server URL. Configure it in extension settings.");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config?.authToken) {
    headers["Authorization"] = config.authToken;
  }

  const res = await fetch(serverUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: `tools/${args.method}`,
      params: args.params || {},
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`MCP Server ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.stringify(data, null, 2).slice(0, 10000);
}
