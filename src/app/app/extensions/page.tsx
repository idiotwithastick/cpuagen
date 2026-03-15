"use client";

import { useState, useEffect, useCallback } from "react";
import { EXTENSION_REGISTRY, getExtensionConfig, saveExtensionConfig, isExtensionConfigured } from "@/lib/extension-runtime";

interface Extension {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  installed: boolean;
  author: string;
  capabilities?: string[];
}

const STORAGE_KEY = "cpuagen-extensions";

const DEFAULT_EXTENSIONS: Extension[] = [
  { id: "web-search", name: "Web Search", description: "Search the web and include results in conversations. AI can search DuckDuckGo for current information.", category: "Tools", icon: "\uD83D\uDD0D", installed: true, author: "CPUAGEN", capabilities: ["web_search", "url_fetch"] },
  { id: "code-interpreter", name: "Code Interpreter", description: "Execute JavaScript in a sandboxed environment with 10s timeout, async/await, and fetch support.", category: "Tools", icon: "\u26A1", installed: true, author: "CPUAGEN", capabilities: ["code_execution", "sandbox"] },
  { id: "image-gen", name: "Image Generation", description: "Generate images from text descriptions using DALL-E 3. Requires OpenAI API key.", category: "Creative", icon: "\uD83C\uDFA8", installed: false, author: "CPUAGEN", capabilities: ["image_generation"] },
  { id: "github", name: "GitHub Integration", description: "Browse repos, create issues, manage PRs directly from chat. Requires Personal Access Token.", category: "Developer", icon: "\uD83D\uDC19", installed: false, author: "CPUAGEN", capabilities: ["github_api"] },
  { id: "slack", name: "Slack Connector", description: "Send messages to Slack channels via webhook or bot token.", category: "Communication", icon: "\uD83D\uDCAC", installed: false, author: "CPUAGEN", capabilities: ["slack_messaging"] },
  { id: "notion", name: "Notion Sync", description: "Search and read Notion databases and pages. Requires integration token.", category: "Productivity", icon: "\uD83D\uDCDD", installed: false, author: "CPUAGEN", capabilities: ["notion_api"] },
  { id: "calendar", name: "Calendar Assistant", description: "List Google Calendar events. Requires Google API key.", category: "Productivity", icon: "\uD83D\uDCC5", installed: false, author: "CPUAGEN", capabilities: ["calendar_api"] },
  { id: "data-viz", name: "Data Visualization", description: "AI generates inline SVG charts (bar, line, pie, scatter, area) directly in chat responses.", category: "Analytics", icon: "\uD83D\uDCCA", installed: false, author: "CPUAGEN", capabilities: ["chart_generation", "data_analysis"] },
  { id: "voice", name: "Voice Input/Output", description: "Speech-to-text mic button and text-to-speech on AI responses. Uses Web Speech API (Chrome/Edge).", category: "Accessibility", icon: "\uD83C\uDFA4", installed: false, author: "CPUAGEN", capabilities: ["speech_to_text", "text_to_speech"] },
  { id: "mcp-server", name: "MCP Server Bridge", description: "Connect to any MCP-compatible tool server for extended capabilities.", category: "Developer", icon: "\uD83D\uDD0C", installed: false, author: "CPUAGEN", capabilities: ["mcp_bridge"] },
  { id: "pdf-tools", name: "PDF Tools Pro", description: "AI-assisted PDF guidance for merge, split, watermark operations. Works with GreyBeam markup.", category: "Tools", icon: "\uD83D\uDCC4", installed: true, author: "CPUAGEN", capabilities: ["pdf_manipulation"] },
  { id: "db-explorer", name: "Database Explorer", description: "Query Cloudflare D1 databases from chat. SELECT/INSERT only (destructive queries blocked).", category: "Developer", icon: "\uD83D\uDDC4\uFE0F", installed: false, author: "CPUAGEN", capabilities: ["database_query"] },
  { id: "multi-model", name: "Multi-Model Council", description: "Send the same prompt to multiple AI models (GPT, Claude, Gemini, Grok) simultaneously and compare responses side-by-side. Synthesize a best-of answer.", category: "Analytics", icon: "\u2696\uFE0F", installed: false, author: "CPUAGEN", capabilities: ["model_compare", "ensemble"] },
  { id: "file-upload", name: "File Upload & Analysis", description: "Upload and analyze CSV, Excel (.xlsx), Word (.docx), and text files. Extract tables, compute stats, summarize documents, answer questions about content.", category: "Tools", icon: "\uD83D\uDCC1", installed: false, author: "CPUAGEN", capabilities: ["file_analyze", "csv_parse", "docx_read"] },
  { id: "video-gen", name: "Video Generation", description: "Generate short AI video clips (4-10s) from text descriptions. Supports Runway ML and Kling AI providers.", category: "Creative", icon: "\uD83C\uDFAC", installed: false, author: "CPUAGEN", capabilities: ["video_generation"] },
  { id: "deep-research", name: "Deep Research Agent", description: "Autonomous multi-step research that searches 10+ sources, cross-references findings, and produces a structured report with inline citations. Takes 30-120 seconds.", category: "Tools", icon: "\uD83D\uDD2C", installed: false, author: "CPUAGEN", capabilities: ["deep_research", "web_search", "citation"] },
  { id: "email", name: "Email Integration", description: "Connect Gmail or Outlook to read, search, summarize, draft, and send emails directly from chat. OAuth or app password authentication.", category: "Communication", icon: "\uD83D\uDCE7", installed: false, author: "CPUAGEN", capabilities: ["email_read", "email_send", "email_search"] },
  { id: "screen-share", name: "Screen Capture & Analysis", description: "Share your screen or upload screenshots for AI visual analysis. Identify UI bugs, read text from images, get design feedback.", category: "Tools", icon: "\uD83D\uDCF7", installed: false, author: "CPUAGEN", capabilities: ["screen_capture", "image_analysis"] },
  { id: "webhooks", name: "Webhook Automation", description: "Trigger external webhooks from chat. Connect to Zapier, Make, n8n, or any HTTP endpoint. Fire events on chat completion, tool use, or manual trigger.", category: "Developer", icon: "\uD83D\uDD17", installed: false, author: "CPUAGEN", capabilities: ["webhook_send", "automation"] },
  { id: "text-to-speech", name: "HD Text-to-Speech", description: "Generate natural-sounding audio from text using ElevenLabs or OpenAI TTS. Multiple voices, languages, and speaking styles.", category: "Creative", icon: "\uD83D\uDD0A", installed: false, author: "CPUAGEN", capabilities: ["tts_generate", "audio_playback"] },
];

// Which extensions need no setup (work out of the box)
const NO_SETUP_IDS = ["web-search", "code-interpreter", "data-viz", "voice", "pdf-tools", "multi-model", "file-upload", "deep-research", "screen-share"];

function loadExtensions(): Extension[] {
  if (typeof window === "undefined") return DEFAULT_EXTENSIONS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_EXTENSIONS;
    const installedIds: string[] = JSON.parse(saved);
    return DEFAULT_EXTENSIONS.map((ext) => ({
      ...ext,
      installed: installedIds.includes(ext.id),
    }));
  } catch {
    return DEFAULT_EXTENSIONS;
  }
}

function saveExtensions(exts: Extension[]) {
  const installedIds = exts.filter((e) => e.installed).map((e) => e.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(installedIds));
  const capabilities = exts
    .filter((e) => e.installed && e.capabilities)
    .flatMap((e) => e.capabilities || []);
  const settings = JSON.parse(localStorage.getItem("cpuagen-settings") || "{}");
  settings.installedExtensions = installedIds;
  settings.capabilities = capabilities;
  localStorage.setItem("cpuagen-settings", JSON.stringify(settings));
}

export default function ExtensionsPage() {
  const [exts, setExts] = useState<Extension[]>(DEFAULT_EXTENSIONS);
  const [filter, setFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "info" } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setExts(loadExtensions());
    setLoaded(true);
  }, []);

  const categories = ["All", ...new Set(DEFAULT_EXTENSIONS.map((e) => e.category))];

  const filtered = exts.filter((e) => {
    if (filter !== "All" && e.category !== filter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const installedCount = exts.filter((e) => e.installed).length;
  const configuredCount = exts.filter((e) => e.installed && isExtensionConfigured(e.id)).length;

  const toggle = useCallback(async (id: string) => {
    if (busy) return;

    // If extension needs setup and is being installed, show config first
    const reg = EXTENSION_REGISTRY[id];
    const ext = exts.find((e) => e.id === id);
    if (reg?.needsSetup && ext && !ext.installed) {
      openConfig(id);
      return;
    }

    setBusy(id);
    await new Promise((r) => setTimeout(r, 250));

    setExts((prev) => {
      const next = prev.map((e) =>
        e.id === id ? { ...e, installed: !e.installed } : e
      );
      saveExtensions(next);
      const updated = next.find((e) => e.id === id);
      if (updated) {
        setToast({
          msg: updated.installed ? `${updated.name} installed` : `${updated.name} removed`,
          type: updated.installed ? "success" : "info",
        });
      }
      return next;
    });

    setBusy(null);
    setTimeout(() => setToast(null), 2000);
  }, [busy, exts]);

  const openConfig = (id: string) => {
    setConfiguring(id);
    setConfigValues(getExtensionConfig(id));
  };

  const saveConfig = (id: string) => {
    saveExtensionConfig(id, configValues);
    setConfiguring(null);

    // Auto-install after configuring
    setExts((prev) => {
      const next = prev.map((e) =>
        e.id === id ? { ...e, installed: true } : e
      );
      saveExtensions(next);
      return next;
    });

    setToast({ msg: `${DEFAULT_EXTENSIONS.find(e => e.id === id)?.name} configured and installed`, type: "success" });
    setTimeout(() => setToast(null), 2000);
  };

  const getStatusBadge = (ext: Extension) => {
    if (!ext.installed) return null;
    const needsSetup = !NO_SETUP_IDS.includes(ext.id);
    const configured = isExtensionConfigured(ext.id);

    if (!needsSetup || configured) {
      return (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-mono">
          ACTIVE
        </span>
      );
    }
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 font-mono">
        NEEDS SETUP
      </span>
    );
  };

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-muted">Loading extensions...</span>
      </div>
    );
  }

  const configExt = configuring ? DEFAULT_EXTENSIONS.find(e => e.id === configuring) : null;
  const configReg = configuring ? EXTENSION_REGISTRY[configuring] : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium shadow-lg border transition-all ${
          toast.type === "success"
            ? "bg-success/10 text-success border-success/20"
            : "bg-surface border-border text-muted"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Configuration Modal */}
      {configuring && configExt && configReg?.configKeys && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{configExt.icon}</span>
              <div>
                <h3 className="font-medium text-sm">{configExt.name} Setup</h3>
                <p className="text-[10px] text-muted">Configure credentials to enable this extension</p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              {configReg.configKeys.map((ck) => (
                <div key={ck.key}>
                  <label className="text-[10px] font-mono text-muted block mb-1">{ck.label}</label>
                  <input
                    type={ck.secret ? "password" : "text"}
                    value={configValues[ck.key] || ""}
                    onChange={(e) => setConfigValues({ ...configValues, [ck.key]: e.target.value })}
                    placeholder={ck.placeholder}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted/40 focus:border-accent/50 focus:outline-none font-mono"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => saveConfig(configuring)}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/80 transition-colors cursor-pointer"
              >
                Save & Install
              </button>
              <button
                onClick={() => setConfiguring(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-muted border border-border hover:text-foreground hover:bg-surface-light transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <p className="text-[9px] text-muted/60 mt-3">
              Credentials are stored in your browser only (localStorage). Never sent to CPUAGEN servers.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Extensions</h1>
            <p className="text-sm text-muted mt-1">
              Extend CPUAGEN with tools, integrations, and capabilities
            </p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <div className="text-2xl font-bold text-accent-light">{installedCount}</div>
              <div className="text-[10px] text-muted font-mono">INSTALLED</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-success">{configuredCount}</div>
              <div className="text-[10px] text-muted font-mono">ACTIVE</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 pt-4 space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search extensions..."
          className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
        />
        <div className="flex gap-2 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === c
                  ? "bg-accent/20 text-accent-light border border-accent/30"
                  : "text-muted hover:text-foreground bg-surface-light"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Extension Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ext) => {
            const needsSetup = !NO_SETUP_IDS.includes(ext.id);
            const configured = isExtensionConfigured(ext.id);

            return (
              <div
                key={ext.id}
                className={`bg-surface border rounded-lg p-4 flex flex-col transition-colors ${
                  ext.installed && configured ? "border-success/20" :
                  ext.installed && !configured ? "border-warning/20" :
                  "border-border"
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">{ext.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm">{ext.name}</h3>
                      {getStatusBadge(ext)}
                    </div>
                    <p className="text-xs text-muted mt-0.5">by {ext.author}</p>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-light text-muted">
                    {ext.category}
                  </span>
                </div>
                <p className="text-xs text-muted flex-1 mb-3">{ext.description}</p>

                {/* How it works hint */}
                {!ext.installed && (
                  <div className="text-[9px] text-muted/60 mb-3 px-2 py-1.5 rounded bg-surface-light/50">
                    {NO_SETUP_IDS.includes(ext.id)
                      ? "\u2713 Works immediately — no setup required"
                      : "\u{1F511} Requires API key or credentials to activate"}
                  </div>
                )}

                {/* Capability tags */}
                {ext.capabilities && ext.installed && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {ext.capabilities.map((cap) => (
                      <span key={cap} className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light font-mono">
                        {cap}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => toggle(ext.id)}
                    disabled={busy === ext.id}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
                      ext.installed
                        ? "bg-success/10 text-success border border-success/20 hover:bg-danger/10 hover:text-danger hover:border-danger/20"
                        : "bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20"
                    }`}
                  >
                    {busy === ext.id
                      ? (ext.installed ? "Removing..." : "Installing...")
                      : (ext.installed ? "Installed" : (needsSetup ? "Configure & Install" : "Install"))}
                  </button>

                  {/* Configure button for installed extensions that need setup */}
                  {ext.installed && needsSetup && (
                    <button
                      onClick={() => openConfig(ext.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        configured
                          ? "text-muted border border-border hover:text-foreground hover:bg-surface-light"
                          : "text-warning border border-warning/30 bg-warning/5 hover:bg-warning/10"
                      }`}
                    >
                      {configured ? "Settings" : "Setup"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
