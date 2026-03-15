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
export const maxDuration = 30;

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
