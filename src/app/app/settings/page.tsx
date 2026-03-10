"use client";

import { useState, useEffect } from "react";
import { PROVIDERS } from "@/lib/types";
import type { Provider } from "@/lib/types";

export default function SettingsPage() {
  const [provider, setProvider] = useState<Provider | "">("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("cpuagen-settings");
      if (s) {
        const parsed = JSON.parse(s);
        setProvider(parsed.provider || "");
        setApiKey(parsed.apiKey || "");
        setModel(parsed.model || "");
        setSystemPrompt(parsed.systemPrompt || "");
      }
    } catch {
      // ignore
    }
  }, []);

  const providerConfig = PROVIDERS.find((p) => p.id === provider);
  const isDemo = providerConfig?.noKeyRequired;
  const canSave = provider && model && (isDemo || apiKey);
  const canTest = canSave && !testing;

  const handleProviderChange = (newProvider: Provider | "") => {
    setProvider(newProvider);
    setTestResult(null);
    if (newProvider) {
      const config = PROVIDERS.find((p) => p.id === newProvider);
      if (config) {
        setModel(config.defaultModel);
        if (config.noKeyRequired) setApiKey("");
      }
    } else {
      setModel("");
    }
  };

  const handleSave = () => {
    localStorage.setItem(
      "cpuagen-settings",
      JSON.stringify({ provider, apiKey, model, systemPrompt }),
    );
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
          provider,
          apiKey,
          model,
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

  return (
    <div className="flex-1 overflow-y-auto p-6 sm:p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-sm text-muted mb-8">
          Connect your LLM provider. Your API key is stored locally and never
          saved on our servers.
        </p>

        {/* Provider */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Provider</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer text-left ${
                  provider === p.id
                    ? "border-accent/40 bg-accent/10 text-accent-light"
                    : "border-border bg-surface hover:border-accent/20 text-muted hover:text-foreground"
                } ${p.noKeyRequired ? "ring-1 ring-success/20" : ""}`}
              >
                {p.name}
                {p.noKeyRequired && (
                  <span className="block text-[10px] text-success mt-0.5">No API key needed</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* API Key — hidden for demo */}
        {!isDemo && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
              placeholder={providerConfig?.apiKeyPlaceholder || "Select a provider first"}
              disabled={!provider}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted/40 font-mono text-sm focus:outline-none focus:border-accent/40 transition-colors disabled:opacity-40"
            />
            <p className="mt-1.5 text-[11px] text-muted">
              Stored in your browser only. Never sent to CPUAGEN servers.
            </p>
          </div>
        )}

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

        {/* Model */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Model</label>
          <select
            value={model}
            onChange={(e) => { setModel(e.target.value); setTestResult(null); }}
            disabled={!provider}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent/40 transition-colors disabled:opacity-40 appearance-none cursor-pointer"
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
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
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
            <li>Pre-enforcement: thermosolve signature + 8 CBF validation</li>
            <li>Message forwarded to your LLM via your API key</li>
            <li>Post-enforcement: response validated + TEEP cached</li>
            <li>You see the response with full enforcement metadata</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
