"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { EnforcementResult, Settings, ApiKeys, Provider } from "@/lib/types";
import { PROVIDERS, migrateSettings, DEFAULT_SETTINGS } from "@/lib/types";
import { getDualContext } from "@/lib/system-context";

/* ─── Types ─── */
interface DualMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  enforcement?: EnforcementResult;
  panel: "left" | "right";
}

interface PanelConfig {
  provider: Provider;
  model: string;
}

/* ─── Enforcement mini badge ─── */
function EnforcementMini({ enforcement }: { enforcement?: EnforcementResult }) {
  if (!enforcement) return null;
  const allSafe = enforcement.pre.cbf.allSafe && (enforcement.post?.cbf.allSafe ?? true);
  const timing = enforcement.timing;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono ${
      allSafe ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
    }`}>
      {allSafe ? "\u2713" : "\u2717"}
      {enforcement.agfHitType === "FULL_HIT" || enforcement.agfHitType === "BASIN_HIT" ? " \u26A1" : enforcement.agfHitType === "JIT_SOLVE" ? " \u{1F9EA}" : ""}
      {timing?.total_ms !== undefined && ` ${timing.total_ms}ms`}
    </span>
  );
}

/* ─── Single Panel Component ─── */
function ChatPanel({
  side,
  messages,
  onSend,
  loading,
  onStop,
  config,
  onProviderChange,
  onModelChange,
  settings,
}: {
  side: "left" | "right";
  messages: DualMessage[];
  onSend: (text: string) => void;
  loading: boolean;
  onStop: () => void;
  config: PanelConfig;
  onProviderChange: (provider: Provider) => void;
  onModelChange: (model: string) => void;
  settings: Settings;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const providerConfig = PROVIDERS.find((p) => p.id === config.provider);
  const providerName = providerConfig?.name || config.provider;
  const availableModels = providerConfig?.models || [];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !loading) {
        onSend(input.trim());
        setInput("");
      }
    }
  };

  const panelMessages = messages.filter((m) => m.panel === side);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Panel header with selectors */}
      <div className={`flex flex-col border-b shrink-0 ${
        side === "left" ? "border-border bg-surface/50" : "border-border bg-surface/30"
      }`}>
        {/* Top row: status + side label */}
        <div className="h-9 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${loading ? "bg-accent-light animate-pulse" : "bg-success"}`} />
            <span className="text-[10px] font-mono text-muted uppercase">{side}</span>
          </div>
          <span className="text-[9px] font-mono text-muted">{config.model}</span>
        </div>
        {/* Selector row */}
        <div className="flex items-center gap-2 px-3 pb-2">
          <select
            value={config.provider}
            onChange={(e) => onProviderChange(e.target.value as Provider)}
            className="bg-surface border border-border rounded px-1.5 py-1 text-[10px] font-mono text-foreground outline-none cursor-pointer hover:border-accent/40 flex-1 min-w-0"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={config.model}
            onChange={(e) => onModelChange(e.target.value)}
            className="bg-surface border border-border rounded px-1.5 py-1 text-[10px] font-mono text-foreground outline-none cursor-pointer hover:border-accent/40 flex-1 min-w-0"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {panelMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted text-xs text-center">
            <div>
              <div className="text-2xl mb-2">{side === "left" ? "\u{1F4AC}" : "\u{1F5E8}\uFE0F"}</div>
              <div>Send a message to start</div>
              <div className="text-[10px] mt-1">Select your model above, then chat</div>
            </div>
          </div>
        )}
        {panelMessages.map((msg) => (
          <div key={msg.id} className={`${msg.role === "user" ? "ml-8" : "mr-8"}`}>
            <div className={`rounded-lg px-3 py-2 text-xs ${
              msg.role === "user"
                ? "bg-accent/10 border border-accent/20 text-foreground ml-auto"
                : "bg-surface border border-border text-foreground"
            }`}>
              {msg.role === "assistant" && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] text-accent-light font-mono">{providerName}</span>
                  <EnforcementMini enforcement={msg.enforcement} />
                </div>
              )}
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{msg.content}</pre>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 p-2 border-t border-border bg-surface/50 shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${side} panel...`}
          className="flex-1 bg-transparent text-foreground text-xs font-mono resize-none outline-none min-h-[28px] max-h-20 py-1.5"
          rows={1}
          disabled={loading}
        />
        <button
          onClick={() => { if (input.trim()) { onSend(input.trim()); setInput(""); } }}
          disabled={loading || !input.trim()}
          className={`shrink-0 px-3 py-1.5 rounded text-[10px] font-mono cursor-pointer ${
            loading || !input.trim()
              ? "text-muted/30"
              : "text-accent-light bg-accent/10 hover:bg-accent/20 border border-accent/30"
          }`}
        >
          Send
        </button>
        {loading && (
          <button onClick={onStop} className="shrink-0 px-2 py-1.5 text-[10px] text-danger/70 hover:text-danger cursor-pointer">
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main DUAL page ─── */
export default function DualPage() {
  const [messages, setMessages] = useState<DualMessage[]>([]);
  const [loadingLeft, setLoadingLeft] = useState(false);
  const [loadingRight, setLoadingRight] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [syncMode, setSyncMode] = useState<"shared" | "independent">("shared");

  // Per-panel provider/model selection
  const [leftConfig, setLeftConfig] = useState<PanelConfig>({ provider: "demo", model: "gemini-2.0-flash" });
  const [rightConfig, setRightConfig] = useState<PanelConfig>({ provider: "demo", model: "gpt-4o-mini" });

  const abortLeftRef = useRef<AbortController | null>(null);
  const abortRightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("cpuagen-settings") || "{}");
      const s = migrateSettings(raw);
      setSettings(s);
      // Initialize panels: left = active provider, right = next available or demo alternate
      const leftProv = s.activeProvider;
      const leftMod = s.activeModel || PROVIDERS.find((p) => p.id === leftProv)?.defaultModel || "gemini-2.0-flash";
      setLeftConfig({ provider: leftProv, model: leftMod });

      // Right panel: pick a different provider if possible, otherwise different model on demo
      const otherProvider = PROVIDERS.find((p) => p.id !== leftProv);
      if (otherProvider) {
        setRightConfig({ provider: otherProvider.id, model: otherProvider.defaultModel });
      } else {
        // Same provider, pick alternate model
        const prov = PROVIDERS.find((p) => p.id === leftProv);
        const altModel = prov?.models.find((m) => m.id !== leftMod)?.id || leftMod;
        setRightConfig({ provider: leftProv, model: altModel });
      }
    } catch { /* defaults */ }
  }, []);

  const handleProviderChange = useCallback((side: "left" | "right", provider: Provider) => {
    const provConfig = PROVIDERS.find((p) => p.id === provider);
    const newConfig: PanelConfig = { provider, model: provConfig?.defaultModel || "" };
    if (side === "left") setLeftConfig(newConfig);
    else setRightConfig(newConfig);
  }, []);

  const handleModelChange = useCallback((side: "left" | "right", model: string) => {
    if (side === "left") setLeftConfig((prev) => ({ ...prev, model }));
    else setRightConfig((prev) => ({ ...prev, model }));
  }, []);

  /* ─── Build context for a panel ─── */
  const buildContext = useCallback((panel: "left" | "right", newText: string) => {
    const contextMessages = syncMode === "shared"
      ? messages
      : messages.filter((m) => m.panel === panel || m.role === "assistant");

    const formatted = contextMessages.slice(-20).map((m) => ({
      role: m.role,
      content: `[${m.panel.toUpperCase()}] ${m.content}`,
    }));

    formatted.push({ role: "user", content: newText });
    return formatted;
  }, [messages, syncMode]);

  /* ─── Stream response from API ─── */
  const streamResponse = useCallback(async (
    panel: "left" | "right",
    userText: string,
  ) => {
    const setLoading = panel === "left" ? setLoadingLeft : setLoadingRight;
    const abortRef = panel === "left" ? abortLeftRef : abortRightRef;
    const config = panel === "left" ? leftConfig : rightConfig;

    setLoading(true);

    const provider = config.provider;
    const model = config.model;
    const apiKey = provider !== "demo" ? settings.apiKeys[provider as keyof ApiKeys] || "" : "";

    // Add user message
    const userId = `${panel}-user-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: userId,
      role: "user",
      content: userText,
      timestamp: Date.now(),
      panel,
    }]);

    const contextMsgs = buildContext(panel, userText);
    const systemPrompt = `${getDualContext(panel)}
${settings.systemPrompt ? `\nAdditional instructions: ${settings.systemPrompt}` : ""}`;

    const controller = new AbortController();
    abortRef.current = controller;

    const assistantId = `${panel}-assistant-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      panel,
    }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            ...contextMsgs,
          ],
          provider,
          model,
          apiKey,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${res.status}` } : m
        ));
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let enforcement: EnforcementResult | undefined;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "enforcement" && parsed.stage === "pre") {
              enforcement = { pre: { signature: parsed.signature, cbf: parsed.cbf } };
              if (parsed.timing) enforcement.timing = parsed.timing;
            } else if (parsed.type === "enforcement" && parsed.stage === "post") {
              if (enforcement) {
                enforcement.post = { signature: parsed.signature, cbf: parsed.cbf, teepId: parsed.teepId };
                if (parsed.timing) enforcement.timing = { ...enforcement.timing, ...parsed.timing };
                enforcement.agfHitType = parsed.agfHitType || enforcement.agfHitType;
              }
            } else if (parsed.type === "agf") {
              if (enforcement) {
                enforcement.agfHitType = parsed.hitType;
                if (parsed.timing) enforcement.timing = parsed.timing;
              }
              if (parsed.content) {
                fullContent += parsed.content;
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullContent } : m
                ));
              }
            } else if (parsed.type === "delta" && parsed.content) {
              fullContent += parsed.content;
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: fullContent } : m
              ));
            }
          } catch { /* skip */ }
        }
      }

      if (enforcement) {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, enforcement } : m
        ));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${(err as Error).message}` } : m
        ));
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [settings, buildContext, leftConfig, rightConfig]);

  const handleSendLeft = useCallback((text: string) => streamResponse("left", text), [streamResponse]);
  const handleSendRight = useCallback((text: string) => streamResponse("right", text), [streamResponse]);

  const otherMessages = useCallback((panel: "left" | "right") =>
    messages.filter((m) => m.panel !== panel), [messages]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header bar */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border bg-surface/50 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">DUAL Mode</span>
          <span className="text-[10px] font-mono text-muted">Two LLMs, shared context</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSyncMode(syncMode === "shared" ? "independent" : "shared")}
            className={`px-2 py-1 rounded text-[10px] font-mono cursor-pointer ${
              syncMode === "shared"
                ? "bg-success/10 text-success border border-success/20"
                : "bg-surface-light text-muted border border-border"
            }`}
          >
            {syncMode === "shared" ? "\u{1F517} Synced" : "\u{1F513} Independent"}
          </button>
          <button
            onClick={() => setMessages([])}
            className="px-2 py-1 rounded text-[10px] font-mono text-muted hover:text-foreground cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Dual panels */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel */}
        <ChatPanel
          side="left"
          messages={messages}
          onSend={handleSendLeft}
          loading={loadingLeft}
          onStop={() => abortLeftRef.current?.abort()}
          config={leftConfig}
          onProviderChange={(p) => handleProviderChange("left", p)}
          onModelChange={(m) => handleModelChange("left", m)}
          settings={settings}
        />

        {/* Divider */}
        <div className="w-px bg-border shrink-0" />

        {/* Right panel */}
        <ChatPanel
          side="right"
          messages={messages}
          onSend={handleSendRight}
          loading={loadingRight}
          onStop={() => abortRightRef.current?.abort()}
          config={rightConfig}
          onProviderChange={(p) => handleProviderChange("right", p)}
          onModelChange={(m) => handleModelChange("right", m)}
          settings={settings}
        />
      </div>
    </div>
  );
}
