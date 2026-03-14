"use client";

import { useState } from "react";

interface Extension {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  installed: boolean;
  author: string;
}

const EXTENSIONS: Extension[] = [
  { id: "web-search", name: "Web Search", description: "Search the web and include results in conversations", category: "Tools", icon: "🔍", installed: true, author: "CPUAGEN" },
  { id: "code-interpreter", name: "Code Interpreter", description: "Execute Python, JavaScript, and TypeScript in a sandboxed environment", category: "Tools", icon: "⚡", installed: true, author: "CPUAGEN" },
  { id: "image-gen", name: "Image Generation", description: "Generate images from text descriptions using DALL-E or Stable Diffusion", category: "Creative", icon: "🎨", installed: false, author: "CPUAGEN" },
  { id: "github", name: "GitHub Integration", description: "Browse repos, create issues, manage PRs directly from chat", category: "Developer", icon: "🐙", installed: false, author: "Community" },
  { id: "slack", name: "Slack Connector", description: "Send messages and read channels from within CPUAGEN", category: "Communication", icon: "💬", installed: false, author: "Community" },
  { id: "notion", name: "Notion Sync", description: "Read and write to Notion databases and pages", category: "Productivity", icon: "📝", installed: false, author: "Community" },
  { id: "calendar", name: "Calendar Assistant", description: "Manage Google Calendar events and scheduling", category: "Productivity", icon: "📅", installed: false, author: "Community" },
  { id: "data-viz", name: "Data Visualization", description: "Create charts, graphs, and dashboards from data", category: "Analytics", icon: "📊", installed: false, author: "CPUAGEN" },
  { id: "voice", name: "Voice Input/Output", description: "Speak to CPUAGEN and hear responses with text-to-speech", category: "Accessibility", icon: "🎤", installed: false, author: "CPUAGEN" },
  { id: "mcp-server", name: "MCP Server Bridge", description: "Connect to any MCP-compatible tool server for extended capabilities", category: "Developer", icon: "🔌", installed: false, author: "CPUAGEN" },
  { id: "pdf-tools", name: "PDF Tools Pro", description: "Advanced PDF manipulation — merge, split, sign, watermark", category: "Tools", icon: "📄", installed: true, author: "CPUAGEN" },
  { id: "db-explorer", name: "Database Explorer", description: "Connect to PostgreSQL, MySQL, SQLite and query from chat", category: "Developer", icon: "🗄️", installed: false, author: "Community" },
];

export default function ExtensionsPage() {
  const [exts, setExts] = useState(EXTENSIONS);
  const [filter, setFilter] = useState<string>("All");
  const [search, setSearch] = useState("");

  const categories = ["All", ...new Set(EXTENSIONS.map((e) => e.category))];

  const filtered = exts.filter((e) => {
    if (filter !== "All" && e.category !== filter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggle = (id: string) => {
    setExts((prev) =>
      prev.map((e) => (e.id === id ? { ...e, installed: !e.installed } : e))
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-semibold">Extensions</h1>
        <p className="text-sm text-muted mt-1">
          Extend CPUAGEN with tools, integrations, and capabilities
        </p>
      </div>

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

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ext) => (
            <div
              key={ext.id}
              className="bg-surface border border-border rounded-lg p-4 flex flex-col"
            >
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">{ext.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm">{ext.name}</h3>
                  <p className="text-xs text-muted mt-0.5">by {ext.author}</p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-light text-muted">
                  {ext.category}
                </span>
              </div>
              <p className="text-xs text-muted flex-1 mb-3">{ext.description}</p>
              <button
                onClick={() => toggle(ext.id)}
                className={`w-full py-2 rounded-lg text-xs font-medium transition-colors ${
                  ext.installed
                    ? "bg-success/10 text-success border border-success/20 hover:bg-danger/10 hover:text-danger hover:border-danger/20"
                    : "bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20"
                }`}
              >
                {ext.installed ? "Installed" : "Install"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
