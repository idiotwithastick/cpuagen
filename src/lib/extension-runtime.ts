/**
 * Extension Runtime — Maps installed extensions to functional capabilities.
 *
 * Each extension can:
 * 1. Inject context into the chat system prompt
 * 2. Provide client-side UI components (voice, charts, etc.)
 * 3. Route tool calls through /api/extensions/tool
 * 4. Require configuration (API keys, tokens)
 */

// ─── Extension Configuration ───

export interface ExtensionConfig {
  /** Extension ID matching the extensions page */
  id: string;
  /** Whether this extension needs external credentials */
  needsSetup: boolean;
  /** Config keys stored in localStorage under cpuagen-ext-{id} */
  configKeys?: { key: string; label: string; placeholder: string; secret?: boolean }[];
  /** System prompt injection when extension is active */
  systemPrompt?: string;
  /** Available tool names this extension provides */
  tools?: string[];
  /** Whether this extension is purely client-side */
  clientSideOnly?: boolean;
}

export const EXTENSION_REGISTRY: Record<string, ExtensionConfig> = {
  "web-search": {
    id: "web-search",
    needsSetup: false,
    tools: ["web_search"],
    systemPrompt: `You have access to a web_search tool. When the user asks about current events, recent information, or anything that would benefit from a web search, use it. To search, output a tool call block:
\`\`\`tool_call
{"tool": "web_search", "args": {"query": "your search query"}}
\`\`\`
The system will execute the search and provide results.`,
  },

  "code-interpreter": {
    id: "code-interpreter",
    needsSetup: false,
    tools: ["code_execute"],
    systemPrompt: `You have access to a code_execute tool. When the user asks you to run code, compute something, or process data, use it. To execute JavaScript code, output a tool call block:
\`\`\`tool_call
{"tool": "code_execute", "args": {"code": "your JavaScript code here"}}
\`\`\`
The system will execute in a sandboxed environment and return the output. You can use console.log(), fetch(), and standard JS APIs.`,
  },

  "image-gen": {
    id: "image-gen",
    needsSetup: true,
    configKeys: [
      { key: "provider", label: "Provider", placeholder: "openai" },
      { key: "apiKey", label: "API Key (OpenAI for DALL-E)", placeholder: "sk-...", secret: true },
    ],
    tools: ["image_generate"],
    systemPrompt: `You have access to an image_generate tool. When the user asks you to create, generate, or draw an image, use it. Output a tool call block:
\`\`\`tool_call
{"tool": "image_generate", "args": {"prompt": "detailed image description", "size": "1024x1024"}}
\`\`\`
The system will generate the image and display it inline.`,
  },

  "github": {
    id: "github",
    needsSetup: true,
    configKeys: [
      { key: "token", label: "Personal Access Token", placeholder: "ghp_...", secret: true },
      { key: "defaultRepo", label: "Default Repo (optional)", placeholder: "owner/repo" },
    ],
    tools: ["github_api"],
    systemPrompt: `You have access to a github_api tool. When the user asks about GitHub repos, issues, PRs, or code, use it. Output a tool call block:
\`\`\`tool_call
{"tool": "github_api", "args": {"endpoint": "/repos/owner/repo/issues", "method": "GET"}}
\`\`\`
Available endpoints: /repos, /issues, /pulls, /contents, /search/repositories, etc.`,
  },

  "slack": {
    id: "slack",
    needsSetup: true,
    configKeys: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/...", secret: true },
      { key: "botToken", label: "Bot Token (optional)", placeholder: "xoxb-...", secret: true },
    ],
    tools: ["slack_send"],
    systemPrompt: `You have access to a slack_send tool. When the user asks to send a Slack message, use it. Output a tool call block:
\`\`\`tool_call
{"tool": "slack_send", "args": {"text": "message content", "channel": "#general"}}
\`\`\``,
  },

  "notion": {
    id: "notion",
    needsSetup: true,
    configKeys: [
      { key: "integrationToken", label: "Integration Token", placeholder: "ntn_...", secret: true },
    ],
    tools: ["notion_query"],
    systemPrompt: `You have access to a notion_query tool. When the user asks about Notion pages or databases, use it. Output a tool call block:
\`\`\`tool_call
{"tool": "notion_query", "args": {"action": "search", "query": "search term"}}
\`\`\`
Available actions: search, get_page, get_database, create_page.`,
  },

  "calendar": {
    id: "calendar",
    needsSetup: true,
    configKeys: [
      { key: "apiKey", label: "Google API Key", placeholder: "AIza...", secret: true },
      { key: "calendarId", label: "Calendar ID", placeholder: "primary" },
    ],
    tools: ["calendar_query"],
    systemPrompt: `You have access to a calendar_query tool. When the user asks about their schedule or events, use it. Output a tool call block:
\`\`\`tool_call
{"tool": "calendar_query", "args": {"action": "list", "timeMin": "2026-03-14T00:00:00Z", "timeMax": "2026-03-15T00:00:00Z"}}
\`\`\`
Available actions: list, create, delete.`,
  },

  "data-viz": {
    id: "data-viz",
    needsSetup: false,
    clientSideOnly: true,
    systemPrompt: `You have access to a data visualization extension. When the user asks for charts, graphs, or data visualizations, output the data in a special chart block:
\`\`\`chart
{"type": "bar", "title": "Chart Title", "labels": ["A", "B", "C"], "datasets": [{"label": "Series 1", "data": [10, 20, 30], "color": "#6366f1"}]}
\`\`\`
Supported chart types: bar, line, pie, doughnut, scatter, area. Always include title, labels, and at least one dataset with label, data array, and color.`,
  },

  "voice": {
    id: "voice",
    needsSetup: false,
    clientSideOnly: true,
    // No system prompt needed — voice is handled purely by client UI
  },

  "mcp-server": {
    id: "mcp-server",
    needsSetup: true,
    configKeys: [
      { key: "serverUrl", label: "MCP Server URL", placeholder: "http://localhost:3001" },
      { key: "authToken", label: "Auth Token (optional)", placeholder: "Bearer ...", secret: true },
    ],
    tools: ["mcp_call"],
    systemPrompt: `You have access to an MCP (Model Context Protocol) bridge. When the user asks to use an MCP tool, output a tool call block:
\`\`\`tool_call
{"tool": "mcp_call", "args": {"method": "tool_name", "params": {}}}
\`\`\``,
  },

  "pdf-tools": {
    id: "pdf-tools",
    needsSetup: false,
    clientSideOnly: true,
    systemPrompt: `You have access to PDF tools. When the user asks to manipulate PDFs (merge, split, extract text, add watermark), you can help. For operations on uploaded PDFs, describe the operation and the system will handle it client-side. For generating PDFs, output HTML content that can be converted to PDF.`,
  },

  "db-explorer": {
    id: "db-explorer",
    needsSetup: true,
    configKeys: [
      { key: "type", label: "Database Type", placeholder: "d1 (Cloudflare D1)" },
      { key: "databaseId", label: "Database ID", placeholder: "66c4ee55-..." },
      { key: "accountId", label: "CF Account ID", placeholder: "b621d14f..." },
      { key: "apiToken", label: "CF API Token", placeholder: "...", secret: true },
    ],
    tools: ["db_query"],
    systemPrompt: `You have access to a database explorer tool. When the user asks to query a database, use it. Output a tool call block:
\`\`\`tool_call
{"tool": "db_query", "args": {"sql": "SELECT * FROM table LIMIT 10", "params": []}}
\`\`\`
Use standard SQL. The system will execute against the configured Cloudflare D1 database.`,
  },

  "multi-model": {
    id: "multi-model",
    needsSetup: false,
    clientSideOnly: true,
    systemPrompt: `You have access to a multi-model comparison tool. When the user asks you to compare models, get multiple perspectives, or run a "model council", output a comparison block:
\`\`\`model_compare
{"prompt": "the question to send to all models", "models": ["openai", "anthropic", "google"]}
\`\`\`
The system will query multiple AI models in parallel and display their responses side-by-side. Users can then pick the best answer or ask you to synthesize them.`,
  },

  "file-upload": {
    id: "file-upload",
    needsSetup: false,
    clientSideOnly: true,
    tools: ["file_analyze"],
    systemPrompt: `You have access to a file analysis tool. Users can upload CSV, Excel (.xlsx), Word (.docx), and text files. When files are uploaded, their content is extracted and provided to you. You can:
- Analyze CSV/Excel data: summarize columns, compute statistics, find patterns
- Parse Word documents: extract text, summarize, answer questions about content
- Process any text-based file format
When analyzing tabular data, use the data-viz extension to create charts if installed.`,
  },

  "video-gen": {
    id: "video-gen",
    needsSetup: true,
    configKeys: [
      { key: "provider", label: "Provider", placeholder: "runway (Runway ML) or kling (Kling AI)" },
      { key: "apiKey", label: "API Key", placeholder: "Your API key...", secret: true },
    ],
    tools: ["video_generate"],
    systemPrompt: `You have access to a video_generate tool. When the user asks you to create, generate, or produce a video, use it. Output a tool call block:
\`\`\`tool_call
{"tool": "video_generate", "args": {"prompt": "detailed video description", "duration": 4, "aspect_ratio": "16:9"}}
\`\`\`
The system will generate a short video clip (4-10 seconds) using the configured AI video provider and display it inline.`,
  },

  "deep-research": {
    id: "deep-research",
    needsSetup: false,
    tools: ["deep_research"],
    systemPrompt: `You have access to a deep_research tool. When the user asks for in-depth research, comprehensive analysis, or a thorough investigation of a topic, use it. Output a tool call block:
\`\`\`tool_call
{"tool": "deep_research", "args": {"query": "research topic", "depth": "thorough", "max_sources": 10}}
\`\`\`
The system will autonomously search multiple sources, cross-reference findings, and produce a structured research report with inline citations. This takes 30-120 seconds.`,
  },

  "email": {
    id: "email",
    needsSetup: true,
    configKeys: [
      { key: "provider", label: "Provider", placeholder: "gmail or outlook" },
      { key: "apiKey", label: "OAuth Token / App Password", placeholder: "Your token...", secret: true },
      { key: "email", label: "Email Address", placeholder: "you@gmail.com" },
    ],
    tools: ["email_read", "email_send", "email_search"],
    systemPrompt: `You have access to email tools. When the user asks about their email, use these tool call blocks:
\`\`\`tool_call
{"tool": "email_read", "args": {"count": 10, "folder": "inbox"}}
\`\`\`
\`\`\`tool_call
{"tool": "email_search", "args": {"query": "from:boss@company.com subject:meeting"}}
\`\`\`
\`\`\`tool_call
{"tool": "email_send", "args": {"to": "recipient@email.com", "subject": "Subject", "body": "Email body"}}
\`\`\`
Available actions: read (list recent), search, send, draft, summarize thread.`,
  },

  "screen-share": {
    id: "screen-share",
    needsSetup: false,
    clientSideOnly: true,
    systemPrompt: `You have access to screen capture capabilities. When the user shares their screen or a screenshot, you can analyze the visual content and provide feedback, identify UI issues, read text from images, or help debug what's shown on screen.`,
  },

  "webhooks": {
    id: "webhooks",
    needsSetup: true,
    configKeys: [
      { key: "url", label: "Webhook URL", placeholder: "https://your-service.com/webhook" },
      { key: "secret", label: "Webhook Secret (optional)", placeholder: "whsec_...", secret: true },
      { key: "events", label: "Events to Trigger", placeholder: "chat.complete, tool.execute" },
    ],
    tools: ["webhook_send"],
    systemPrompt: `You have access to a webhook tool. When the user asks to trigger a webhook or send data to an external service, use it. Output a tool call block:
\`\`\`tool_call
{"tool": "webhook_send", "args": {"event": "custom_event", "payload": {"key": "value"}}}
\`\`\``,
  },

  "text-to-speech": {
    id: "text-to-speech",
    needsSetup: true,
    configKeys: [
      { key: "provider", label: "Provider", placeholder: "elevenlabs or openai" },
      { key: "apiKey", label: "API Key", placeholder: "Your API key...", secret: true },
      { key: "voiceId", label: "Voice ID (optional)", placeholder: "default" },
    ],
    tools: ["tts_generate"],
    clientSideOnly: false,
    systemPrompt: `You have access to a high-quality text-to-speech tool. When the user asks you to read text aloud, narrate, or generate audio, output a tool call block:
\`\`\`tool_call
{"tool": "tts_generate", "args": {"text": "Text to speak", "voice": "alloy"}}
\`\`\`
The system will generate natural-sounding audio and play it inline.`,
  },
};

// ─── Runtime Helpers ───

const EXT_CONFIG_PREFIX = "cpuagen-ext-";

/** Get config for an extension from localStorage */
export function getExtensionConfig(extId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(`${EXT_CONFIG_PREFIX}${extId}`) || "{}");
  } catch {
    return {};
  }
}

/** Save config for an extension to localStorage */
export function saveExtensionConfig(extId: string, config: Record<string, string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${EXT_CONFIG_PREFIX}${extId}`, JSON.stringify(config));
}

/** Check if an extension is installed */
export function isExtensionInstalled(extId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const saved = localStorage.getItem("cpuagen-extensions");
    if (!saved) return false;
    const ids: string[] = JSON.parse(saved);
    return ids.includes(extId);
  } catch {
    return false;
  }
}

/** Check if an extension requiring setup is properly configured */
export function isExtensionConfigured(extId: string): boolean {
  const reg = EXTENSION_REGISTRY[extId];
  if (!reg) return false;
  if (!reg.needsSetup) return true;
  if (!reg.configKeys || reg.configKeys.length === 0) return true;
  const config = getExtensionConfig(extId);
  // At least the first (primary) config key must be set
  return !!config[reg.configKeys[0].key];
}

/** Get combined system prompt for all installed + configured extensions */
export function getInstalledExtensionPrompts(): string {
  if (typeof window === "undefined") return "";
  const parts: string[] = [];
  try {
    const saved = localStorage.getItem("cpuagen-extensions");
    if (!saved) return "";
    const ids: string[] = JSON.parse(saved);
    for (const id of ids) {
      const reg = EXTENSION_REGISTRY[id];
      if (!reg?.systemPrompt) continue;
      if (reg.needsSetup && !isExtensionConfigured(id)) continue;
      parts.push(reg.systemPrompt);
    }
  } catch { /* ignore */ }
  if (parts.length === 0) return "";
  return "\n\n# ACTIVE EXTENSION TOOLS\n\n" + parts.join("\n\n");
}

/** Get list of all available tool names from installed extensions */
export function getInstalledToolNames(): string[] {
  if (typeof window === "undefined") return [];
  const tools: string[] = [];
  try {
    const saved = localStorage.getItem("cpuagen-extensions");
    if (!saved) return [];
    const ids: string[] = JSON.parse(saved);
    for (const id of ids) {
      const reg = EXTENSION_REGISTRY[id];
      if (!reg?.tools) continue;
      if (reg.needsSetup && !isExtensionConfigured(id)) continue;
      tools.push(...reg.tools);
    }
  } catch { /* ignore */ }
  return tools;
}
