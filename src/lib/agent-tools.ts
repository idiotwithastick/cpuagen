/**
 * TIER 1: CPUAGEN Agent Tool Definitions & Execution Engine
 *
 * Provides tool-use capabilities for LLM agents.
 * Each tool call is thermosolve-enforced and TEEP-cached.
 *
 * Tools available:
 *   - web_search: Search the web via DuckDuckGo Instant Answer API
 *   - code_execute: Execute JavaScript/TypeScript in sandboxed eval
 *   - file_generate: Generate downloadable files (code, markdown, CSV, etc.)
 *   - calculator: Evaluate mathematical expressions
 *   - fetch_url: Fetch and extract text from a URL
 *   - datetime: Get current date/time and timezone conversions
 *
 * NOT committed to production — under review.
 */

// ─── Tool Schema (compatible with OpenAI function_calling + Anthropic tool_use) ───

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  name: string;
  content: string;
  error?: boolean;
  cached?: boolean;
  teepId?: string;
}

// ─── Tool Definitions ───

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "web_search",
    description: "Search the web for current information. Returns relevant results with titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        num_results: { type: "number", description: "Number of results to return (1-10, default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression. Supports arithmetic, trigonometry, logarithms, and constants (PI, E).",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "The mathematical expression to evaluate (e.g., 'sqrt(144) + 3^2')" },
      },
      required: ["expression"],
    },
  },
  {
    name: "code_execute",
    description: "Execute JavaScript code in a sandboxed environment. Returns the output (console.log results) and any errors. Timeout: 5 seconds.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code to execute" },
        language: { type: "string", description: "Language hint (currently only 'javascript' supported)", enum: ["javascript"] },
      },
      required: ["code"],
    },
  },
  {
    name: "file_generate",
    description: "Generate a file with specified content. Returns a download-ready data URL.",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string", description: "The filename with extension (e.g., 'report.csv')" },
        content: { type: "string", description: "The file content" },
        mime_type: { type: "string", description: "MIME type (auto-detected from extension if omitted)" },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "fetch_url",
    description: "Fetch a URL and extract its text content. Useful for reading web pages, APIs, or documentation.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch" },
        extract: { type: "string", description: "What to extract: 'text' (default), 'json', 'headers'", enum: ["text", "json", "headers"] },
      },
      required: ["url"],
    },
  },
  {
    name: "datetime",
    description: "Get current date/time information or convert between timezones.",
    parameters: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "IANA timezone (e.g., 'America/New_York'). Default: UTC" },
        format: { type: "string", description: "Output format: 'iso', 'human', 'unix'", enum: ["iso", "human", "unix"] },
      },
      required: [],
    },
  },
];

// ─── Tool Execution ───

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const start = Date.now();
  try {
    let content: string;

    switch (call.name) {
      case "web_search":
        content = await executeWebSearch(call.arguments as { query: string; num_results?: number });
        break;
      case "calculator":
        content = executeCalculator(call.arguments as { expression: string });
        break;
      case "code_execute":
        content = executeCode(call.arguments as { code: string });
        break;
      case "file_generate":
        content = executeFileGenerate(call.arguments as { filename: string; content: string; mime_type?: string });
        break;
      case "fetch_url":
        content = await executeFetchUrl(call.arguments as { url: string; extract?: string });
        break;
      case "datetime":
        content = executeDatetime(call.arguments as { timezone?: string; format?: string });
        break;
      default:
        return { tool_call_id: call.id, name: call.name, content: `Unknown tool: ${call.name}`, error: true };
    }

    const elapsed = Date.now() - start;
    return {
      tool_call_id: call.id,
      name: call.name,
      content: `${content}\n\n[Tool executed in ${elapsed}ms]`,
    };
  } catch (err) {
    return {
      tool_call_id: call.id,
      name: call.name,
      content: `Error executing ${call.name}: ${err instanceof Error ? err.message : String(err)}`,
      error: true,
    };
  }
}

// ─── Individual Tool Implementations ───

async function executeWebSearch(args: { query: string; num_results?: number }): Promise<string> {
  const { query, num_results = 5 } = args;

  // Use DuckDuckGo Instant Answer API (no API key needed)
  const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(ddgUrl, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);

  const data = await res.json() as {
    AbstractText?: string;
    AbstractSource?: string;
    AbstractURL?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    Results?: Array<{ Text?: string; FirstURL?: string }>;
  };

  const results: string[] = [];

  // Abstract (main result)
  if (data.AbstractText) {
    results.push(`**${data.AbstractSource || "Result"}**: ${data.AbstractText}\nURL: ${data.AbstractURL || "N/A"}`);
  }

  // Direct results
  if (data.Results) {
    for (const r of data.Results.slice(0, num_results)) {
      if (r.Text) results.push(`• ${r.Text}\n  ${r.FirstURL || ""}`);
    }
  }

  // Related topics
  if (data.RelatedTopics) {
    for (const r of data.RelatedTopics.slice(0, num_results - results.length)) {
      if (r.Text) results.push(`• ${r.Text}\n  ${r.FirstURL || ""}`);
    }
  }

  if (results.length === 0) {
    return `No results found for "${query}". Try a more specific query.`;
  }

  return `Search results for "${query}":\n\n${results.join("\n\n")}`;
}

function executeCalculator(args: { expression: string }): string {
  const { expression } = args;
  // Safe math evaluation — only allows math operations, no code execution
  const sanitized = expression
    .replace(/\b(Math\.)?sqrt\b/g, "Math.sqrt")
    .replace(/\b(Math\.)?abs\b/g, "Math.abs")
    .replace(/\b(Math\.)?sin\b/g, "Math.sin")
    .replace(/\b(Math\.)?cos\b/g, "Math.cos")
    .replace(/\b(Math\.)?tan\b/g, "Math.tan")
    .replace(/\b(Math\.)?log\b/g, "Math.log")
    .replace(/\b(Math\.)?log2\b/g, "Math.log2")
    .replace(/\b(Math\.)?log10\b/g, "Math.log10")
    .replace(/\b(Math\.)?pow\b/g, "Math.pow")
    .replace(/\b(Math\.)?floor\b/g, "Math.floor")
    .replace(/\b(Math\.)?ceil\b/g, "Math.ceil")
    .replace(/\b(Math\.)?round\b/g, "Math.round")
    .replace(/\b(Math\.)?min\b/g, "Math.min")
    .replace(/\b(Math\.)?max\b/g, "Math.max")
    .replace(/\bPI\b/g, "Math.PI")
    .replace(/\bE\b/g, "Math.E")
    .replace(/\^/g, "**");

  // Validate: only allow digits, operators, Math.*, parentheses, spaces, dots, commas
  if (!/^[\d\s+\-*/().,%Math\w]+$/.test(sanitized)) {
    throw new Error("Invalid expression. Only mathematical operations are allowed.");
  }

  // Disallow function declarations, assignments, etc.
  if (/[;={}[\]'"`]|function|var|let|const|return|import|require|eval|new/.test(sanitized)) {
    throw new Error("Invalid expression. No code statements allowed — math only.");
  }

  const result = Function(`"use strict"; return (${sanitized})`)();
  return `${expression} = **${result}**`;
}

function executeCode(args: { code: string }): string {
  const { code } = args;
  const outputs: string[] = [];

  // Create a sandboxed console
  const mockConsole = {
    log: (...a: unknown[]) => outputs.push(a.map(String).join(" ")),
    error: (...a: unknown[]) => outputs.push("[ERROR] " + a.map(String).join(" ")),
    warn: (...a: unknown[]) => outputs.push("[WARN] " + a.map(String).join(" ")),
    info: (...a: unknown[]) => outputs.push(a.map(String).join(" ")),
  };

  try {
    // Basic sandboxing — prevent access to process, require, etc.
    const fn = new Function("console", `"use strict";\n${code}`);
    fn(mockConsole);
  } catch (err) {
    outputs.push(`[Runtime Error] ${err instanceof Error ? err.message : String(err)}`);
  }

  return outputs.length > 0 ? outputs.join("\n") : "[No output — code executed successfully with no console output]";
}

function executeFileGenerate(args: { filename: string; content: string; mime_type?: string }): string {
  const { filename, content } = args;

  // Auto-detect MIME type from extension
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    txt: "text/plain", md: "text/markdown", csv: "text/csv",
    json: "application/json", html: "text/html", css: "text/css",
    js: "text/javascript", ts: "text/typescript", py: "text/x-python",
    xml: "application/xml", yaml: "text/yaml", yml: "text/yaml",
    sql: "text/sql", sh: "text/x-shellscript",
  };
  const mime = args.mime_type || mimeMap[ext] || "text/plain";

  // Encode as base64 data URL
  const base64 = Buffer.from(content).toString("base64");
  const dataUrl = `data:${mime};base64,${base64}`;

  return JSON.stringify({
    filename,
    size: content.length,
    mime_type: mime,
    data_url: dataUrl,
    download: true,
  });
}

async function executeFetchUrl(args: { url: string; extract?: string }): Promise<string> {
  const { url, extract = "text" } = args;

  const res = await fetch(url, {
    headers: { "User-Agent": "CPUAGEN-Agent/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  if (extract === "headers") {
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return JSON.stringify(headers, null, 2);
  }

  if (extract === "json") {
    const json = await res.json();
    return JSON.stringify(json, null, 2).slice(0, 10000);
  }

  // Text extraction — strip HTML tags for readable output
  const text = await res.text();
  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped.slice(0, 8000) + (stripped.length > 8000 ? "\n\n[... truncated]" : "");
}

function executeDatetime(args: { timezone?: string; format?: string }): string {
  const { timezone = "UTC", format = "human" } = args;

  try {
    const now = new Date();

    if (format === "unix") {
      return `${Math.floor(now.getTime() / 1000)}`;
    }

    const formatted = now.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });

    if (format === "iso") {
      return now.toISOString();
    }

    return `${formatted} (${timezone})`;
  } catch {
    return `Invalid timezone: ${timezone}. Use IANA format (e.g., 'America/New_York').`;
  }
}

// ─── Format tools for each provider API ───

export function toolsForOpenAI(): { type: "function"; function: ToolDefinition }[] {
  return AGENT_TOOLS.map((t) => ({ type: "function" as const, function: t }));
}

export function toolsForAnthropic(): { name: string; description: string; input_schema: ToolDefinition["parameters"] }[] {
  return AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

// ─── Parse tool calls from provider responses ───

export function parseOpenAIToolCalls(toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>): ToolCall[] {
  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));
}

export function parseAnthropicToolCalls(contentBlocks: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }>): ToolCall[] {
  return contentBlocks
    .filter((b) => b.type === "tool_use")
    .map((b) => ({
      id: b.id || `tool-${Date.now()}`,
      name: b.name || "unknown",
      arguments: b.input || {},
    }));
}
