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

interface TeepSummary {
  id: string;
  sig: string;
  allSafe: boolean;
  content: string;
  hits: number;
  semanticMass: number;
  resonanceStrength: number;
  created: number;
}

interface EngineKnowledge {
  version: string;
  teepCount: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: string;
  morphicFieldStrength: number;
  totalResonanceEvents: number;
  teeps: TeepSummary[];
}

interface EngineMetrics {
  manifold?: { totalTeeps: number; coveredBasins: number; frontierSize: number; coverage: number };
  ricci?: { scalar: number; meanSectional: number; dimensions: number };
  metrics?: { totalRequests: number; totalPassed: number; totalBlocked: number; barrierFailCounts: Record<string, number> };
  fisher?: { coherence: number; dominantDimension: string; weights: Record<string, number> };
}

export default function MemoryPage() {
  const [tab, setTab] = useState<"conversations" | "memories" | "knowledge">("conversations");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMemory, setNewMemory] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [knowledge, setKnowledge] = useState<EngineKnowledge | null>(null);
  const [engineMetrics, setEngineMetrics] = useState<EngineMetrics | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingConv, setViewingConv] = useState<{ id: string; title: string; messages: Array<{ role: string; content: string; timestamp?: number }> } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

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

  const loadKnowledge = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teep");
      const data = await res.json();
      if (data.ok && data.snapshot) {
        const s = data.snapshot;
        const teeps = Array.isArray(s.teeps) ? s.teeps : [];
        const hits = s.counters?.cacheHits ?? 0;
        const misses = s.counters?.cacheMisses ?? 0;
        setKnowledge({
          version: s.version ?? "unknown",
          teepCount: teeps.length,
          cacheHits: hits,
          cacheMisses: misses,
          hitRate: (hits + misses) > 0
            ? ((hits / (hits + misses)) * 100).toFixed(1)
            : "0.0",
          morphicFieldStrength: s.morphicFieldStrength ?? 0,
          totalResonanceEvents: s.totalResonanceEvents ?? 0,
          teeps,
        });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadEngineMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/engine");
      const data = await res.json();
      if (data.ok) setEngineMetrics(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (tab === "conversations") loadConversations();
    else if (tab === "memories") loadMemories();
    else { loadKnowledge(); loadEngineMetrics(); }
  }, [tab, loadConversations, loadMemories, loadKnowledge, loadEngineMetrics]);

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

  const viewConversation = async (id: string, title: string) => {
    setViewLoading(true);
    try {
      const res = await fetch(`/api/memory?resource=conversations&id=${id}`);
      const data = await res.json();
      if (data.ok && data.conversation) {
        setViewingConv({ id, title, messages: data.conversation.messages || [] });
      }
    } catch { /* ignore */ }
    setViewLoading(false);
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
        {(["conversations", "memories", "knowledge"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-accent/20 text-accent-light border border-accent/30"
                : "text-muted hover:text-foreground hover:bg-surface-light"
            }`}
          >
            {t === "conversations" ? "Conversations" : t === "memories" ? "Memories" : "Knowledge Base"}
          </button>
        ))}
      </div>

      {/* Search bar */}
      {(tab === "conversations" || tab === "memories") && (
        <div className="px-6 pt-3">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tab === "conversations" ? "Search conversations by title..." : "Search memories by content..."}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading && <p className="text-muted text-center py-8">Loading...</p>}

        {!loading && tab === "conversations" && conversations.length === 0 && (
          <div className="text-center py-12 text-muted max-w-md mx-auto">
            <p className="text-2xl mb-3">{"\u{1F4AC}"}</p>
            <p className="text-lg font-medium text-foreground mb-1">No Saved Conversations Yet</p>
            <p className="text-sm mb-4">Your chat history will appear here automatically.</p>
            <div className="text-left space-y-2">
              <div className="flex gap-2 items-start bg-surface/50 border border-border rounded-lg p-2.5">
                <span className="text-xs font-bold text-accent-light shrink-0">1.</span>
                <span className="text-xs">Go to <strong>Chat</strong> and start a conversation with any AI model</span>
              </div>
              <div className="flex gap-2 items-start bg-surface/50 border border-border rounded-lg p-2.5">
                <span className="text-xs font-bold text-accent-light shrink-0">2.</span>
                <span className="text-xs">Conversations are <strong>auto-saved</strong> and show up in this tab</span>
              </div>
              <div className="flex gap-2 items-start bg-surface/50 border border-border rounded-lg p-2.5">
                <span className="text-xs font-bold text-accent-light shrink-0">3.</span>
                <span className="text-xs">You can <strong>view, export as PDF, or delete</strong> any saved conversation</span>
              </div>
            </div>
          </div>
        )}

        {!loading && tab === "conversations" && conversations.filter((c) => !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase())).map((c) => (
          <div key={c.id} className="bg-surface border border-border rounded-lg p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm">{c.title}</h3>
              <p className="text-xs text-muted mt-1">
                {c.message_count} messages · Updated {new Date(c.updated_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => viewConversation(c.id, c.title)}
                className="px-2 py-1 text-xs rounded bg-accent/10 text-accent-light hover:bg-accent/20 transition-colors"
              >
                View
              </button>
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

        {/* Conversation viewer */}
        {viewingConv && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-background border border-border rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-medium text-sm truncate">{viewingConv.title}</h3>
                <button
                  onClick={() => setViewingConv(null)}
                  className="text-muted hover:text-foreground text-lg px-2"
                >
                  {"\u2715"}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {viewLoading ? (
                  <p className="text-muted text-center py-8">Loading...</p>
                ) : viewingConv.messages.length === 0 ? (
                  <p className="text-muted text-center py-8">No messages in this conversation</p>
                ) : (
                  viewingConv.messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-accent/20 text-foreground"
                          : "bg-surface border border-border text-foreground"
                      }`}>
                        <div className="text-[9px] font-mono text-muted mb-1">
                          {msg.role === "user" ? "You" : "CPUAGEN"}
                          {msg.timestamp && <span className="ml-2">{new Date(msg.timestamp).toLocaleTimeString()}</span>}
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-xs">{msg.content}</pre>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

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
              <div className="text-center py-8 text-muted max-w-md mx-auto">
                <p className="text-2xl mb-2">{"\u{1F9E0}"}</p>
                <p className="font-medium text-foreground mb-1">No Memories Yet</p>
                <p className="text-sm mb-3">Memories help the AI remember your preferences and context across sessions.</p>
                <div className="text-left space-y-1.5">
                  <div className="flex gap-2 items-start bg-surface/50 border border-border rounded-lg p-2">
                    <span className="text-[10px] font-bold text-accent-light shrink-0">1.</span>
                    <span className="text-[10px]">Type a fact or preference in the box above (e.g., &quot;I prefer TypeScript&quot;)</span>
                  </div>
                  <div className="flex gap-2 items-start bg-surface/50 border border-border rounded-lg p-2">
                    <span className="text-[10px] font-bold text-accent-light shrink-0">2.</span>
                    <span className="text-[10px]">Pick a <strong>category</strong> (General, Preference, Project, Context)</span>
                  </div>
                  <div className="flex gap-2 items-start bg-surface/50 border border-border rounded-lg p-2">
                    <span className="text-[10px] font-bold text-accent-light shrink-0">3.</span>
                    <span className="text-[10px]">Click <strong>Save</strong> — the AI will use these memories to personalize responses</span>
                  </div>
                </div>
              </div>
            )}

            {memories.filter((m) => !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.category.toLowerCase().includes(searchQuery.toLowerCase())).map((m) => (
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

        {!loading && tab === "knowledge" && knowledge && (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-surface border border-border rounded-lg p-3 text-center">
                <div className="text-lg font-bold font-mono text-accent-light">{knowledge.teepCount}</div>
                <div className="text-[10px] text-muted font-mono uppercase">TEEPs Loaded</div>
              </div>
              <div className="bg-surface border border-border rounded-lg p-3 text-center">
                <div className="text-lg font-bold font-mono text-success">{knowledge.hitRate}%</div>
                <div className="text-[10px] text-muted font-mono uppercase">Cache Hit Rate</div>
              </div>
              <div className="bg-surface border border-border rounded-lg p-3 text-center">
                <div className="text-lg font-bold font-mono text-warning">{(knowledge.morphicFieldStrength ?? 0).toFixed(3)}</div>
                <div className="text-[10px] text-muted font-mono uppercase">Morphic Field</div>
              </div>
              <div className="bg-surface border border-border rounded-lg p-3 text-center">
                <div className="text-lg font-bold font-mono text-accent-light">{knowledge.totalResonanceEvents}</div>
                <div className="text-[10px] text-muted font-mono uppercase">Resonance Events</div>
              </div>
            </div>

            {/* Enforcement Metrics */}
            {engineMetrics?.metrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold font-mono text-foreground">{engineMetrics.metrics.totalRequests}</div>
                  <div className="text-[10px] text-muted font-mono uppercase">Total Requests</div>
                </div>
                <div className="bg-surface border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold font-mono text-success">{engineMetrics.metrics.totalPassed}</div>
                  <div className="text-[10px] text-muted font-mono uppercase">Passed</div>
                </div>
                <div className="bg-surface border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold font-mono text-danger">{engineMetrics.metrics.totalBlocked}</div>
                  <div className="text-[10px] text-muted font-mono uppercase">Blocked</div>
                </div>
                <div className="bg-surface border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold font-mono text-accent-light">
                    {engineMetrics.ricci ? (engineMetrics.ricci.scalar ?? 0).toFixed(4) : "—"}
                  </div>
                  <div className="text-[10px] text-muted font-mono uppercase">Ricci Curvature</div>
                </div>
              </div>
            )}

            {/* Manifold & Fisher */}
            {(engineMetrics?.manifold || engineMetrics?.fisher) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {engineMetrics.manifold && (
                  <div className="bg-surface border border-border rounded-lg p-3">
                    <div className="text-[10px] font-mono text-muted uppercase mb-2">Manifold Coverage</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-sm font-mono font-bold text-accent-light">{engineMetrics.manifold.coveredBasins}</div>
                        <div className="text-[9px] text-muted">Basins</div>
                      </div>
                      <div>
                        <div className="text-sm font-mono font-bold text-warning">{engineMetrics.manifold.frontierSize}</div>
                        <div className="text-[9px] text-muted">Frontier</div>
                      </div>
                      <div>
                        <div className="text-sm font-mono font-bold text-success">{((engineMetrics.manifold.coverage ?? 0) * 100).toFixed(1)}%</div>
                        <div className="text-[9px] text-muted">Coverage</div>
                      </div>
                    </div>
                  </div>
                )}
                {engineMetrics.fisher && (
                  <div className="bg-surface border border-border rounded-lg p-3">
                    <div className="text-[10px] font-mono text-muted uppercase mb-2">Fisher Geometry</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-muted">Coherence</span>
                        <span className="text-accent-light">{(engineMetrics.fisher.coherence ?? 0).toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-muted">Dominant</span>
                        <span className="text-warning">{engineMetrics.fisher.dominantDimension ?? "—"}</span>
                      </div>
                      {Object.entries(engineMetrics.fisher.weights ?? {}).slice(0, 4).map(([dim, w]) => (
                        <div key={dim} className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-muted w-16 truncate">{dim}</span>
                          <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                            <div className="h-full bg-accent/60 rounded-full" style={{ width: `${Math.min(w * 100, 100)}%` }} />
                          </div>
                          <span className="text-[9px] font-mono text-muted w-8 text-right">{(Number(w) || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Barrier Fail History */}
            {engineMetrics?.metrics && engineMetrics.metrics.barrierFailCounts && Object.keys(engineMetrics.metrics.barrierFailCounts).length > 0 && (
              <div className="bg-surface border border-danger/20 rounded-lg p-3">
                <div className="text-[10px] font-mono text-danger/80 uppercase mb-2">Barrier Failure History</div>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {Object.entries(engineMetrics.metrics.barrierFailCounts).map(([barrier, count]) => (
                    <div key={barrier} className="text-center p-1.5 rounded bg-danger/5 border border-danger/10">
                      <div className="text-sm font-mono font-bold text-danger">{count}</div>
                      <div className="text-[9px] font-mono text-muted">{barrier}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-surface/50 border border-border rounded-lg p-4">
              <p className="text-xs text-muted leading-relaxed">
                The Knowledge Base shows the SSD-RCI enforcement engine&apos;s learned state.
                Every query is solved into a thermodynamic basin state (TEEP) and cached.
                The enforcement pipeline validates all requests through 9 Control Barrier Functions.
                The morphic field strengthens as the system accumulates resonance events.
              </p>
            </div>

            {/* TEEP list */}
            <div>
              <h3 className="text-sm font-medium mb-3">Top TEEPs by Semantic Mass</h3>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search TEEPs by content or ID..."
                className="w-full px-3 py-2 mb-3 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
              />
              <div className="space-y-2">
                {knowledge.teeps.filter((t) => !searchQuery || t.content.toLowerCase().includes(searchQuery.toLowerCase()) || t.id.toLowerCase().includes(searchQuery.toLowerCase())).map((t) => (
                  <div key={t.id} className="bg-surface border border-border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-2 h-2 rounded-full ${t.allSafe ? "bg-success" : "bg-danger"}`} />
                      <span className="text-[10px] font-mono text-accent-light">{t.id}</span>
                      <span className="text-[10px] font-mono text-muted ml-auto">
                        mass: {(t.semanticMass ?? 0).toFixed(2)} | {t.hits} hits | resonance: {(t.resonanceStrength ?? 0).toFixed(3)}
                      </span>
                    </div>
                    <p className="text-xs text-foreground">{t.content.slice(0, 200)}{t.content.length > 200 ? "..." : ""}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[9px] text-muted font-mono">{new Date(t.created).toLocaleString()}</span>
                      <span className="text-[9px] font-mono text-accent-light/60">{t.sig}</span>
                    </div>
                  </div>
                ))}
                {knowledge.teeps.length === 0 && (
                  <div className="text-center py-8 text-muted max-w-sm mx-auto">
                    <p className="text-2xl mb-2">{"\u{1F4DA}"}</p>
                    <p className="font-medium text-foreground text-sm mb-1">No TEEPs Cached Yet</p>
                    <p className="text-xs mb-2">TEEPs (Thermosolve-Enforced Entry Points) are knowledge units the AI builds as you chat.</p>
                    <p className="text-[10px]">Start a conversation in <strong>Chat</strong> — the knowledge base grows automatically.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {!loading && tab === "knowledge" && !knowledge && (
          <div className="text-center py-12 text-muted max-w-sm mx-auto">
            <p className="text-2xl mb-2">{"\u{26A0}\uFE0F"}</p>
            <p className="text-sm font-medium text-foreground mb-1">Knowledge Engine Loading</p>
            <p className="text-xs mb-3">The enforcement engine is still initializing. This usually takes a few seconds.</p>
            <button onClick={loadKnowledge} className="px-4 py-2 text-xs bg-accent/10 text-accent-light rounded-lg hover:bg-accent/20">
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
