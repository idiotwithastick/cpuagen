"use client";

import { useState, useEffect } from "react";
import { PROVIDERS, migrateSettings, DEFAULT_SETTINGS } from "@/lib/types";
import type { Provider, Settings, ApiKeys } from "@/lib/types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("cpuagen-settings");
      if (s) {
        const parsed = JSON.parse(s);
        setSettings(migrateSettings(parsed));
      }
    } catch {
      // ignore
    }
  }, []);

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
        body: JSON.stringify({
          messages: [{ role: "user", content: "Say 'CPUAGEN connected' in exactly 2 words." }],
          provider: settings.activeProvider,
          apiKey: activeKey,
          model: settings.activeModel,
        }),
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
            } catch {
              // skip
            }
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

  return (
    <div className="flex-1 overflow-y-auto p-6 sm:p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-sm text-muted mb-8">
          Connect your LLM providers. API keys are stored locally and never
          saved on our servers.
        </p>

        {/* Active Provider */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Active Provider</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer text-left ${
                  settings.activeProvider === p.id
                    ? "border-accent/40 bg-accent/10 text-accent-light"
                    : "border-border bg-surface hover:border-accent/20 text-muted hover:text-foreground"
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
          <div className="mb-6 p-4 rounded-xl bg-success/5 border border-success/20">
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

        {/* API Keys — all providers at once */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">
            API Keys
          </label>
          <p className="text-[11px] text-muted mb-3">
            Enter keys for any providers you want to use. {configuredCount > 0 && (
              <span className="text-success">{configuredCount} configured</span>
            )}
          </p>
          <div className="space-y-3">
            {nonDemoProviders.map((p) => {
              const key = settings.apiKeys[p.id as keyof ApiKeys] || "";
              const isActive = settings.activeProvider === p.id;
              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl border transition-colors ${
                    isActive ? "border-accent/30 bg-accent/5" : "border-border bg-surface/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{p.name}</span>
                      {key && <span className="w-1.5 h-1.5 bg-success rounded-full" />}
                      {isActive && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent-light font-mono">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    {!isActive && key && (
                      <button
                        onClick={() => handleProviderChange(p.id)}
                        className="text-[10px] text-muted hover:text-accent-light transition-colors cursor-pointer"
                      >
                        Switch to this
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => handleKeyChange(p.id, e.target.value)}
                    placeholder={p.apiKeyPlaceholder}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted/40 font-mono text-xs focus:outline-none focus:border-accent/40 transition-colors"
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Stored in your browser only. Never sent to CPUAGEN servers.
          </p>
        </div>

        {/* Model */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Model</label>
          <select
            value={settings.activeModel}
            onChange={(e) => {
              setTestResult(null);
              setSettings((prev) => ({ ...prev, activeModel: e.target.value }));
            }}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent/40 transition-colors appearance-none cursor-pointer"
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
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">
            System Prompt <span className="text-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={settings.systemPrompt}
            onChange={(e) => setSettings((prev) => ({ ...prev, systemPrompt: e.target.value }))}
            placeholder="You are a helpful assistant..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted/40 text-sm resize-none focus:outline-none focus:border-accent/40 transition-colors"
          />
          <p className="mt-1.5 text-[11px] text-muted">
            Prepended to every conversation. Sets the AI&apos;s behavior and persona.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            {saved ? "\u2713 Saved" : "Save Settings"}
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
        </div>

        {/* Test result */}
        {testResult && (
          <div
            className={`p-4 rounded-xl border text-sm ${
              testResult.ok
                ? "bg-success/5 border-success/20 text-success"
                : "bg-danger/5 border-danger/20 text-danger"
            }`}
          >
            <div className="font-medium mb-1">
              {testResult.ok ? "\u2713 Connected" : "\u2717 Connection Failed"}
            </div>
            <div className="text-xs opacity-80">{testResult.message}</div>
          </div>
        )}

        {/* Info */}
        <div className="mt-10 p-4 rounded-xl bg-surface/50 border border-border">
          <h3 className="text-sm font-medium mb-2">How it works</h3>
          <ol className="text-xs text-muted space-y-1.5 list-decimal list-inside">
            <li>Your message enters the CPUAGEN enforcement pipeline</li>
            <li>8 safety barriers validate the input throughout the process</li>
            <li>Validated message forwarded to your LLM via your API key</li>
            <li>Response passes through the same barrier validation</li>
            <li>Validated answer is cached and delivered with enforcement metadata</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
