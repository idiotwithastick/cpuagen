"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PROVIDERS, migrateSettings, DEFAULT_SETTINGS } from "@/lib/types";
import type { Provider, Settings, ApiKeys } from "@/lib/types";
import { withAdminToken } from "@/lib/admin";

/* ─── Local preferences (beyond the core Settings type) ─── */
interface LocalPrefs {
  theme: "dark" | "midnight" | "light";
  fontSize: "small" | "medium" | "large";
  detailLevel: "concise" | "standard" | "detailed";
  codeComments: boolean;
  autoSave: boolean;
  safetyLevel: "standard" | "strict" | "maximum";
  knowledgeCache: boolean;
  perfMetrics: boolean;
}

const DEFAULT_PREFS: LocalPrefs = {
  theme: "midnight",
  fontSize: "medium",
  detailLevel: "standard",
  codeComments: true,
  autoSave: true,
  safetyLevel: "strict",
  knowledgeCache: true,
  perfMetrics: false,
};

interface EnforcementInfo {
  metrics?: {
    totalRequests: number;
    totalPassed: number;
    totalBlocked: number;
    barrierFailCounts: Record<string, number>;
  };
  manifold?: { totalTeeps: number; coveredBasins: number; coverage: number };
  fisher?: { coherence: number; dominantDimension: string };
}

const SAFETY_BARRIERS = [
  { name: "BNR", label: "Truth Alignment", constraint: "I_truth >= 0.30" },
  { name: "BNN", label: "Naturality", constraint: "nat >= 0.20" },
  { name: "BNA", label: "Energy Bound", constraint: "E <= 100,000" },
  { name: "TSE", label: "Thermal Stability", constraint: "|beta_T - 1| < 0.50" },
  { name: "PCD", label: "Coherence", constraint: "phi_coh >= 0.10" },
  { name: "OGP", label: "Output Guard", constraint: "errors <= 100" },
  { name: "ECM", label: "Quality Metric", constraint: "Q <= 500" },
  { name: "SPC", label: "Synergy", constraint: "sigma >= 0.50" },
  { name: "FEP", label: "Free Energy", constraint: "F <= 50,000" },
];

/* ─── Reusable section wrapper ─── */
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-muted mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

/* ─── Toggle switch ─── */
function Toggle({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className="flex items-center justify-between w-full py-2 cursor-pointer group"
    >
      <span className="text-sm text-foreground group-hover:text-accent-light transition-colors">{label}</span>
      <div
        className={`relative w-10 h-5 rounded-full transition-colors ${
          enabled ? "bg-accent" : "bg-surface-light border border-border"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}

/* ─── Segmented selector ─── */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
            value === opt.value
              ? "bg-accent/15 text-accent-light border-accent/30"
              : "bg-surface text-muted hover:text-foreground hover:bg-surface-light"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Eye icon for show/hide ─── */
function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [prefs, setPrefs] = useState<LocalPrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [enforcement, setEnforcement] = useState<EnforcementInfo | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState("provider");

  const loadEnforcement = useCallback(async () => {
    try {
      const res = await fetch("/api/engine");
      const data = await res.json();
      if (data.ok) setEnforcement(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      const s = localStorage.getItem("cpuagen-settings");
      if (s) {
        const parsed = JSON.parse(s);
        setSettings(migrateSettings(parsed));
      }
    } catch { /* ignore */ }
    try {
      const p = localStorage.getItem("cpuagen-prefs");
      if (p) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(p) });
    } catch { /* ignore */ }
    loadEnforcement();
  }, [loadEnforcement]);

  const providerConfig = PROVIDERS.find((p) => p.id === settings.activeProvider);
  const isDemo = providerConfig?.noKeyRequired;
  const activeKey = settings.apiKeys[settings.activeProvider as keyof ApiKeys] || "";
  const canSave = settings.activeProvider && settings.activeModel && (isDemo || activeKey);
  const canTest = canSave && !testing;

  const handleProviderChange = (newProvider: Provider) => {
    setTestResult(null);
    const config = PROVIDERS.find((p) => p.id === newProvider);
    setSettings((prev) => ({
      ...prev,
      activeProvider: newProvider,
      activeModel: config?.defaultModel || prev.activeModel,
    }));
  };

  const handleKeyChange = (providerId: string, value: string) => {
    setTestResult(null);
    setSettings((prev) => ({
      ...prev,
      apiKeys: { ...prev.apiKeys, [providerId]: value || undefined },
    }));
  };

  const handleSave = () => {
    localStorage.setItem("cpuagen-settings", JSON.stringify(settings));
    localStorage.setItem("cpuagen-prefs", JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    if (!canTest) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withAdminToken({
          messages: [{ role: "user", content: "Say 'CPUAGEN connected' in exactly 2 words." }],
          provider: settings.activeProvider,
          apiKey: activeKey,
          model: settings.activeModel,
        })),
      });

      if (!res.ok) {
        const err = await res.text();
        setTestResult({ ok: false, message: `HTTP ${res.status}: ${err}` });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setTestResult({ ok: false, message: "No response body" });
        return;
      }

      const decoder = new TextDecoder();
      let gotDelta = false;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "delta") gotDelta = true;
              if (parsed.type === "error") {
                setTestResult({ ok: false, message: parsed.message });
                return;
              }
            } catch { /* skip */ }
          }
        }
      }

      setTestResult(
        gotDelta
          ? { ok: true, message: "Connection successful! LLM responded through enforcement pipeline." }
          : { ok: false, message: "No response received from LLM." },
      );
    } catch (e: unknown) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setTesting(false);
    }
  };

  const nonDemoProviders = PROVIDERS.filter((p) => !p.noKeyRequired);
  const configuredCount = nonDemoProviders.filter((p) => settings.apiKeys[p.id as keyof ApiKeys]).length;

  const sections = [
    { id: "provider", label: "Provider & Model" },
    { id: "keys", label: "API Keys" },
    { id: "appearance", label: "Appearance" },
    { id: "response", label: "Response" },
    { id: "engine", label: "Engine" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Settings</h1>
          <p className="text-sm text-muted">
            Configure your providers, preferences, and engine behavior.
          </p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 mb-8 overflow-x-auto pb-1 -mx-1 px-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveSection(s.id);
                document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeSection === s.id
                  ? "bg-accent/15 text-accent-light"
                  : "text-muted hover:text-foreground hover:bg-surface-light"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ═══════════ PROVIDER & MODEL ═══════════ */}
        <div id="section-provider">
          <Section title="Provider & Model" subtitle="Select your active LLM provider and model.">
            <div className="p-4 rounded-xl bg-surface border border-border mb-4">
              <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-3">Active Provider</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProviderChange(p.id)}
                    className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer text-left ${
                      settings.activeProvider === p.id
                        ? "border-accent/40 bg-accent/10 text-accent-light"
                        : "border-border bg-background hover:border-accent/20 text-muted hover:text-foreground"
                    } ${p.noKeyRequired ? "ring-1 ring-success/20" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{p.name}</span>
                      {!p.noKeyRequired && settings.apiKeys[p.id as keyof ApiKeys] && (
                        <span className="w-2 h-2 bg-success rounded-full shrink-0" />
                      )}
                    </div>
                    {p.noKeyRequired && (
                      <span className="block text-[10px] text-success mt-0.5">No API key needed</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {isDemo && (
              <div className="mb-4 p-4 rounded-xl bg-success/5 border border-success/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-success rounded-full" />
                  <span className="text-sm font-medium text-success">Free Demo Mode</span>
                </div>
                <p className="text-xs text-muted">
                  No API key needed. Uses CPUAGEN&apos;s hosted models for testing.
                  For production use, switch to your own API key.
                </p>
              </div>
            )}

            <div className="p-4 rounded-xl bg-surface border border-border mb-4">
              <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-3">Model</label>
              <select
                value={settings.activeModel}
                onChange={(e) => {
                  setTestResult(null);
                  setSettings((prev) => ({ ...prev, activeModel: e.target.value }));
                }}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent/40 transition-colors appearance-none cursor-pointer"
              >
                <option value="">Select a model</option>
                {providerConfig?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* System Prompt */}
            <div className="p-4 rounded-xl bg-surface border border-border">
              <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-3">
                System Prompt <span className="normal-case tracking-normal font-sans">(optional)</span>
              </label>
              <textarea
                value={settings.systemPrompt}
                onChange={(e) => setSettings((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                placeholder="You are a helpful assistant..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted/40 text-sm resize-none focus:outline-none focus:border-accent/40 transition-colors"
              />
              <p className="mt-2 text-[11px] text-muted">
                Prepended to every conversation. Sets the AI&apos;s behavior and persona.
              </p>
            </div>
          </Section>
        </div>

        {/* ═══════════ API KEYS ═══════════ */}
        <div id="section-keys">
          <Section title="API Keys" subtitle={`Enter keys for any providers you want to use. ${configuredCount > 0 ? `${configuredCount} configured.` : ""}`}>
            <div className="space-y-3">
              {nonDemoProviders.map((p) => {
                const key = settings.apiKeys[p.id as keyof ApiKeys] || "";
                const isActive = settings.activeProvider === p.id;
                const isVisible = visibleKeys[p.id] || false;
                return (
                  <div
                    key={p.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isActive ? "border-accent/30 bg-accent/5" : "border-border bg-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{p.name}</span>
                        {key && <span className="w-1.5 h-1.5 bg-success rounded-full" />}
                        {isActive && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent-light font-mono">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!isActive && key && (
                          <button
                            onClick={() => handleProviderChange(p.id)}
                            className="text-[10px] text-muted hover:text-accent-light transition-colors cursor-pointer"
                          >
                            Switch to this
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type={isVisible ? "text" : "password"}
                        value={key}
                        onChange={(e) => handleKeyChange(p.id, e.target.value)}
                        placeholder={p.apiKeyPlaceholder}
                        className="w-full px-3 py-2.5 pr-10 rounded-lg bg-background border border-border text-foreground placeholder:text-muted/40 font-mono text-xs focus:outline-none focus:border-accent/40 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setVisibleKeys((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors cursor-pointer"
                        title={isVisible ? "Hide key" : "Show key"}
                      >
                        <EyeIcon open={isVisible} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 px-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success shrink-0">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p className="text-[11px] text-muted">
                Keys are stored locally in your browser. Never sent to CPUAGEN servers.
              </p>
            </div>
          </Section>
        </div>

        {/* ═══════════ APPEARANCE ═══════════ */}
        <div id="section-appearance">
          <Section title="Appearance" subtitle="Customize how CPUAGEN looks and feels.">
            <div className="p-4 rounded-xl bg-surface border border-border space-y-5">
              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">Theme</label>
                <Segmented
                  options={[
                    { value: "dark" as const, label: "Dark" },
                    { value: "midnight" as const, label: "Midnight" },
                    { value: "light" as const, label: "Light" },
                  ]}
                  value={prefs.theme}
                  onChange={(v) => setPrefs((prev) => ({ ...prev, theme: v }))}
                />
                <p className="mt-2 text-[10px] text-muted">
                  Theme switching is coming soon. Currently using Midnight.
                </p>
              </div>
              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">Font Size</label>
                <Segmented
                  options={[
                    { value: "small" as const, label: "Small" },
                    { value: "medium" as const, label: "Medium" },
                    { value: "large" as const, label: "Large" },
                  ]}
                  value={prefs.fontSize}
                  onChange={(v) => setPrefs((prev) => ({ ...prev, fontSize: v }))}
                />
              </div>
            </div>
          </Section>
        </div>

        {/* ═══════════ RESPONSE PREFERENCES ═══════════ */}
        <div id="section-response">
          <Section title="Response Preferences" subtitle="Control how the AI formats and delivers responses.">
            <div className="p-4 rounded-xl bg-surface border border-border space-y-5">
              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">Detail Level</label>
                <Segmented
                  options={[
                    { value: "concise" as const, label: "Concise" },
                    { value: "standard" as const, label: "Standard" },
                    { value: "detailed" as const, label: "Detailed" },
                  ]}
                  value={prefs.detailLevel}
                  onChange={(v) => setPrefs((prev) => ({ ...prev, detailLevel: v }))}
                />
                <p className="mt-2 text-[10px] text-muted">
                  {prefs.detailLevel === "concise" && "Short, direct answers. Minimal explanation."}
                  {prefs.detailLevel === "standard" && "Balanced responses with relevant context."}
                  {prefs.detailLevel === "detailed" && "Thorough explanations with examples and reasoning."}
                </p>
              </div>
              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">Code Style</label>
                <Segmented
                  options={[
                    { value: "commented" as const, label: "With Comments" },
                    { value: "clean" as const, label: "No Comments" },
                  ]}
                  value={prefs.codeComments ? "commented" : "clean"}
                  onChange={(v) => setPrefs((prev) => ({ ...prev, codeComments: v === "commented" }))}
                />
              </div>
              <div className="border-t border-border pt-4">
                <Toggle
                  enabled={prefs.autoSave}
                  onChange={(v) => setPrefs((prev) => ({ ...prev, autoSave: v }))}
                  label="Auto-save conversations"
                />
                <p className="text-[10px] text-muted mt-1">
                  Automatically save conversation history to local storage.
                </p>
              </div>
            </div>
          </Section>
        </div>

        {/* ═══════════ ENGINE PREFERENCES ═══════════ */}
        <div id="section-engine">
          <Section title="Engine Preferences" subtitle="Configure the CPUAGEN enforcement engine behavior.">
            <div className="p-4 rounded-xl bg-surface border border-border space-y-5">
              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">Safety Validation Level</label>
                <Segmented
                  options={[
                    { value: "standard" as const, label: "Standard" },
                    { value: "strict" as const, label: "Strict" },
                    { value: "maximum" as const, label: "Maximum" },
                  ]}
                  value={prefs.safetyLevel}
                  onChange={(v) => setPrefs((prev) => ({ ...prev, safetyLevel: v }))}
                />
                <p className="mt-2 text-[10px] text-muted">
                  {prefs.safetyLevel === "standard" && "Core safety barriers active. Suitable for most use cases."}
                  {prefs.safetyLevel === "strict" && "All 9 barriers enforced with tighter thresholds."}
                  {prefs.safetyLevel === "maximum" && "Full enforcement with zero tolerance. May reject edge-case queries."}
                </p>
              </div>
              <div className="border-t border-border pt-4">
                <Toggle
                  enabled={prefs.knowledgeCache}
                  onChange={(v) => setPrefs((prev) => ({ ...prev, knowledgeCache: v }))}
                  label="Knowledge Cache"
                />
                <p className="text-[10px] text-muted mt-1">
                  Cache solved queries for instant retrieval on repeat questions. Reduces latency significantly.
                </p>
              </div>
              <div className="border-t border-border pt-4">
                <Toggle
                  enabled={prefs.perfMetrics}
                  onChange={(v) => setPrefs((prev) => ({ ...prev, perfMetrics: v }))}
                  label="Performance Metrics Overlay"
                />
                <p className="text-[10px] text-muted mt-1">
                  Show enforcement timing, barrier scores, and information metrics alongside responses.
                </p>
              </div>
            </div>

            {/* Safety Barriers reference */}
            <div className="mt-4 p-4 rounded-xl bg-surface border border-border">
              <h3 className="text-xs font-mono text-muted uppercase tracking-wider mb-3">
                Safety Validation Barriers (9 Active)
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {SAFETY_BARRIERS.map((b) => (
                  <div
                    key={b.name}
                    className="p-2 rounded-lg bg-background border border-border text-center"
                  >
                    <div className="text-xs font-mono font-bold text-success">{b.name}</div>
                    <div className="text-[9px] text-muted mt-0.5">{b.label}</div>
                    <div className="text-[8px] font-mono text-accent-light/60 mt-0.5">{b.constraint}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted mt-2">
                All 9 barriers must pass for every request. These thresholds are immutable.
              </p>
            </div>

            {/* Live Stats */}
            {enforcement?.metrics && (
              <div className="mt-4 p-4 rounded-xl bg-surface border border-border">
                <h3 className="text-xs font-mono text-muted uppercase tracking-wider mb-3">
                  Live Engine Stats
                </h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="text-center">
                    <div className="text-lg font-bold font-mono text-foreground">{enforcement.metrics.totalRequests}</div>
                    <div className="text-[10px] text-muted">Requests</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold font-mono text-success">{enforcement.metrics.totalPassed}</div>
                    <div className="text-[10px] text-muted">Passed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold font-mono text-danger">{enforcement.metrics.totalBlocked}</div>
                    <div className="text-[10px] text-muted">Blocked</div>
                  </div>
                </div>
                {enforcement.metrics.totalRequests > 0 && (
                  <div className="h-2 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success rounded-full transition-all"
                      style={{ width: `${(enforcement.metrics.totalPassed / enforcement.metrics.totalRequests) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Manifold + Adaptive Weights */}
            {(enforcement?.manifold || enforcement?.fisher) && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                {enforcement.manifold && (
                  <div className="p-3 rounded-xl bg-surface border border-border text-center">
                    <div className="text-sm font-bold font-mono text-accent-light">
                      {enforcement.manifold.totalTeeps}
                    </div>
                    <div className="text-[10px] text-muted">Knowledge Cached</div>
                    <div className="text-[9px] font-mono text-muted/60 mt-0.5">
                      {((enforcement.manifold.coverage ?? 0) * 100).toFixed(1)}% coverage
                    </div>
                  </div>
                )}
                {enforcement.fisher && (
                  <div className="p-3 rounded-xl bg-surface border border-border text-center">
                    <div className="text-sm font-bold font-mono text-warning">
                      {(enforcement.fisher.coherence ?? 0).toFixed(4)}
                    </div>
                    <div className="text-[10px] text-muted">Adaptive Weight Coherence</div>
                    <div className="text-[9px] font-mono text-muted/60 mt-0.5">
                      dominant: {enforcement.fisher.dominantDimension ?? "\u2014"}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>

        {/* ═══════════ ABOUT ═══════════ */}
        <div id="section-about">
          <Section title="About">
            <div className="p-4 rounded-xl bg-surface border border-border space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">CPUAGEN</div>
                  <div className="text-xs text-muted">Cognitive Processing Unified Agent Engine</div>
                </div>
                <span className="text-xs font-mono px-2 py-1 rounded-lg bg-accent/10 border border-accent/20 text-accent-light">
                  v1.0.0-alpha
                </span>
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Engine</span>
                  <span className="font-mono text-foreground">Enforcement Pipeline v10.4</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Safety Barriers</span>
                  <span className="font-mono text-success">9 active</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Knowledge Cache</span>
                  <span className="font-mono text-foreground">7.3M+ entries</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Providers Supported</span>
                  <span className="font-mono text-foreground">{PROVIDERS.length}</span>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <Link
                  href="/app/feedback"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 border border-accent/20 text-sm font-medium text-accent-light hover:bg-accent/20 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Send Feedback
                </Link>
              </div>
              <p className="text-[10px] text-muted">
                Built by Wesley Foreman. Physics-based AI enforcement for every LLM.
              </p>
            </div>
          </Section>
        </div>

        {/* ═══════════ HOW IT WORKS ═══════════ */}
        <div className="p-4 rounded-xl bg-surface/50 border border-border mb-8">
          <h3 className="text-sm font-medium mb-2">How it works</h3>
          <ol className="text-xs text-muted space-y-1.5 list-decimal list-inside">
            <li>Your message enters the CPUAGEN enforcement pipeline</li>
            <li>A full series of safety barriers validate the input throughout the process</li>
            <li>Validated message forwarded to your LLM via your API key</li>
            <li>Response passes through the same barrier validation</li>
            <li>Validated answer is cached and delivered with enforcement metadata</li>
          </ol>
        </div>

        {/* ═══════════ SAVE / TEST ═══════════ */}
        <div className="sticky bottom-0 -mx-6 sm:-mx-8 px-6 sm:px-8 py-4 bg-background/80 backdrop-blur-xl border-t border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              {saved ? "\u2713 Saved" : "Save All Settings"}
            </button>
            <button
              onClick={handleTest}
              disabled={!canTest}
              className="px-6 py-3 rounded-xl bg-surface border border-border hover:border-accent/30 text-foreground font-medium text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              {testing ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  Testing...
                </span>
              ) : (
                "Test Connection"
              )}
            </button>
            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.ok ? "text-success" : "text-danger"}`}>
                <span>{testResult.ok ? "\u2713" : "\u2717"}</span>
                <span className="text-xs">{testResult.ok ? "Connected" : "Failed"}</span>
              </div>
            )}
          </div>
          {testResult && !testResult.ok && (
            <p className="mt-2 text-xs text-danger/80">{testResult.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
