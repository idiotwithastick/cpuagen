"use client";

import { useState, useEffect, useCallback } from "react";

interface MemoryItem {
  id: string;
  category: string;
  content: string;
  created_at: number;
}

interface ConversationSummary {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export default function MemoryPage() {
  const [tab, setTab] = useState<"conversations" | "memories">("conversations");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMemory, setNewMemory] = useState("");
  const [newCategory, setNewCategory] = useState("general");

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memory?resource=conversations");
      const data = await res.json();
      if (data.ok) setConversations(data.conversations || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memory?resource=memories");
      const data = await res.json();
      if (data.ok) setMemories(data.memories || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "conversations") loadConversations();
    else loadMemories();
  }, [tab, loadConversations, loadMemories]);

  const addMemory = async () => {
    if (!newMemory.trim()) return;
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_memory", content: newMemory, category: newCategory }),
    });
    setNewMemory("");
    loadMemories();
  };

  const deleteItem = async (type: "conversation" | "memory", id: string) => {
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: type === "conversation" ? "delete_conversation" : "delete_memory", id }),
    });
    if (type === "conversation") loadConversations();
    else loadMemories();
  };

  const exportConversation = async (id: string, title: string, format: "pdf" | "docx" | "xlsx") => {
    const res = await fetch(`/api/memory?resource=conversations&id=${id}`);
    const data = await res.json();
    if (!data.ok || !data.conversation) return;

    const exportRes = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, title, messages: data.conversation.messages }),
    });
    if (!exportRes.ok) return;

    const blob = await exportRes.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-semibold">Persistent Memory</h1>
        <p className="text-sm text-muted mt-1">
          Cloud-synced conversations and memories — accessible from any device
        </p>
      </div>

      <div className="flex gap-2 px-6 pt-4">
        {(["conversations", "memories"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-accent/20 text-accent-light border border-accent/30"
                : "text-muted hover:text-foreground hover:bg-surface-light"
            }`}
          >
            {t === "conversations" ? "Conversations" : "Memories"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading && <p className="text-muted text-center py-8">Loading...</p>}

        {!loading && tab === "conversations" && conversations.length === 0 && (
          <div className="text-center py-12 text-muted">
            <p className="text-lg mb-2">No saved conversations</p>
            <p className="text-sm">Conversations will auto-save here when you use the chat</p>
          </div>
        )}

        {!loading && tab === "conversations" && conversations.map((c) => (
          <div key={c.id} className="bg-surface border border-border rounded-lg p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm">{c.title}</h3>
              <p className="text-xs text-muted mt-1">
                {c.message_count} messages · Updated {new Date(c.updated_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => exportConversation(c.id, c.title, "pdf")}
                className="px-2 py-1 text-xs rounded bg-surface-light hover:bg-border text-muted hover:text-foreground transition-colors"
              >
                PDF
              </button>
              <button
                onClick={() => exportConversation(c.id, c.title, "docx")}
                className="px-2 py-1 text-xs rounded bg-surface-light hover:bg-border text-muted hover:text-foreground transition-colors"
              >
                DOCX
              </button>
              <button
                onClick={() => exportConversation(c.id, c.title, "xlsx")}
                className="px-2 py-1 text-xs rounded bg-surface-light hover:bg-border text-muted hover:text-foreground transition-colors"
              >
                XLSX
              </button>
              <button
                onClick={() => { if (confirm("Delete this conversation?")) deleteItem("conversation", c.id); }}
                className="px-2 py-1 text-xs rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {!loading && tab === "memories" && (
          <>
            <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
              <div className="flex gap-2">
                <input
                  value={newMemory}
                  onChange={(e) => setNewMemory(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMemory()}
                  placeholder="Add a memory... (e.g., 'I prefer TypeScript over JavaScript')"
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
                >
                  <option value="general">General</option>
                  <option value="preference">Preference</option>
                  <option value="project">Project</option>
                  <option value="context">Context</option>
                </select>
                <button
                  onClick={addMemory}
                  disabled={!newMemory.trim()}
                  className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/80 disabled:opacity-50 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>

            {memories.length === 0 && (
              <div className="text-center py-8 text-muted">
                <p>No memories yet. Add facts, preferences, and context that CPUAGEN should remember.</p>
              </div>
            )}

            {memories.map((m) => (
              <div key={m.id} className="bg-surface border border-border rounded-lg p-4 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <span className="inline-block px-2 py-0.5 text-[10px] font-mono rounded bg-accent/10 text-accent-light border border-accent/20 mb-2">
                    {m.category}
                  </span>
                  <p className="text-sm">{m.content}</p>
                  <p className="text-xs text-muted mt-1">
                    {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteItem("memory", m.id)}
                  className="px-2 py-1 text-xs rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
