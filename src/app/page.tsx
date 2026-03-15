"use client";

import { useState, useEffect } from "react";

/* ─── Animated counter ─── */
function AnimatedNumber({
  target,
  suffix = "",
  duration = 2000,
}: {
  target: number;
  suffix?: string;
  duration?: number;
}) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const steps = 60;
    const increment = target / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setCurrent(Math.min(Math.round(increment * step), target));
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target, duration]);
  return (
    <span>
      {current.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ─── Physics visualization ─── */
function PhysicsOrb() {
  return (
    <div className="relative w-64 h-64 mx-auto">
      <div className="absolute inset-0 rounded-full border border-accent/20 animate-[spin_20s_linear_infinite]" />
      <div className="absolute inset-4 rounded-full border border-accent/30 animate-[spin_15s_linear_infinite_reverse]" />
      <div className="absolute inset-8 rounded-full border border-accent-light/20 animate-[spin_10s_linear_infinite]" />
      <div className="absolute inset-16 rounded-full bg-gradient-to-br from-accent/40 to-accent-light/20 glow-accent flex items-center justify-center">
        <div className="text-accent-light font-mono text-xs tracking-widest">
          ENFORCED
        </div>
      </div>
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <div
          key={deg}
          className="absolute w-1.5 h-1.5 bg-accent-light rounded-full"
          style={{
            top: `${50 - 46 * Math.cos((deg * Math.PI) / 180)}%`,
            left: `${50 + 46 * Math.sin((deg * Math.PI) / 180)}%`,
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Feature card ─── */
function FeatureCard({
  icon,
  title,
  description,
  metric,
}: {
  icon: string;
  title: string;
  description: string;
  metric?: string;
}) {
  return (
    <div className="group relative p-6 rounded-xl bg-surface/50 border border-border hover:border-accent/30 transition-all duration-300 hover:glow-accent">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
      {metric && (
        <div className="mt-4 pt-3 border-t border-border">
          <span className="font-mono text-xs text-accent-light">{metric}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Architecture diagram ─── */
function ArchitectureDiagram() {
  const layers = [
    {
      label: "YOUR DEVICE",
      items: ["Browser", "Phone", "Desktop"],
      color: "border-foreground/20",
    },
    {
      label: "CPUAGEN ENGINE",
      items: [
        "Validation Gateway",
        "Enforcement Engine",
        "Safety Barriers (9)",
        "Knowledge Cache",
      ],
      color: "border-accent/40",
      highlight: true,
    },
    {
      label: "YOUR LLM",
      items: ["Claude", "GPT-4o", "Gemini", "Grok", "Llama"],
      color: "border-foreground/20",
    },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-3">
      {layers.map((layer, i) => (
        <div key={layer.label}>
          <div
            className={`rounded-lg border ${layer.color} ${layer.highlight ? "bg-accent/5 glow-accent" : "bg-surface/30"} p-4`}
          >
            <div
              className={`text-xs font-mono tracking-widest mb-2 ${layer.highlight ? "text-accent-light" : "text-muted"}`}
            >
              {layer.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {layer.items.map((item) => (
                <span
                  key={item}
                  className={`text-xs px-2 py-1 rounded ${layer.highlight ? "bg-accent/10 text-accent-light" : "bg-surface-light text-muted"}`}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          {i < layers.length - 1 && (
            <div className="flex justify-center py-1">
              <div className="w-px h-4 bg-border" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Enforcement pipeline demo ─── */
function EnforcementDemo() {
  const [step, setStep] = useState(0);
  const steps = [
    { label: "INBOUND", desc: "Prompt received" },
    { label: "GATEWAY", desc: "Route & classify" },
    { label: "VALIDATE", desc: "Barrier series active", highlight: true },
    { label: "LLM", desc: "Model responds" },
    { label: "REVALIDATE", desc: "Output checked", highlight: true },
    { label: "DELIVER", desc: "Basin stored & sent" },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => (s + 1) % (steps.length + 2));
    }, 800);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <div
            className={`flex flex-col items-center px-3 py-2 rounded-lg border transition-all duration-300 min-w-[90px] ${
              i < step
                ? s.highlight ? "border-success/50 bg-success/10 ring-1 ring-success/20" : "border-success/40 bg-success/5"
                : i === step
                  ? s.highlight ? "border-accent/80 bg-accent/15 glow-accent ring-1 ring-accent/30" : "border-accent/60 bg-accent/10 glow-accent"
                  : s.highlight ? "border-accent/20 bg-accent/5" : "border-border bg-surface/30"
            }`}
          >
            <span
              className={`text-[10px] font-mono tracking-wider ${
                i < step
                  ? "text-success"
                  : i === step
                    ? "text-accent-light"
                    : s.highlight ? "text-accent-light/60" : "text-muted"
              }`}
            >
              {s.label}
            </span>
            <span className={`text-[9px] mt-0.5 ${s.highlight ? "text-accent-light/50" : "text-muted"}`}>{s.desc}</span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`hidden sm:block w-3 h-px ${i < step ? "bg-success/40" : "bg-border"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Waitlist form ─── */
function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alreadyExists, setAlreadyExists] = useState(false);

  // Check localStorage on mount — hide form if already signed up
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cpuagen_waitlist_email");
      if (stored) {
        setEmail(stored);
        setSubmitted(true);
        setAlreadyExists(true);
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe", email }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSubmitted(true);
        setAlreadyExists(data.alreadyExists);
        try { localStorage.setItem("cpuagen_waitlist_email", email.toLowerCase().trim()); } catch { /* */ }
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Network error — please try again");
    }
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-success font-mono text-sm">
        <span className="w-2 h-2 bg-success rounded-full animate-pulse-live" />
        {alreadyExists
          ? "You\u2019re already on the list! Check your email for your access code."
          : "You\u2019re in! We\u2019ll send your access code soon."}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 w-full max-w-md">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          required
          disabled={loading}
          className="flex-1 px-4 py-3 rounded-lg bg-surface border border-border text-foreground placeholder:text-muted/50 font-mono text-sm focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-all duration-200 hover:glow-accent cursor-pointer disabled:opacity-50"
        >
          {loading ? "..." : "Early Access"}
        </button>
      </div>
      {error && <div className="text-red-400 text-xs font-mono">{error}</div>}
    </form>
  );
}

/* ─── Email-gated Launch Console ─── */
function EmailGatedLaunch() {
  const [email, setEmail] = useState("");
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cpuagen_console_email");
      if (stored) setHasAccess(true);
    } catch { /* */ }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@") || !trimmed.includes(".")) {
      setError("Please enter a valid email");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe", email: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        try {
          localStorage.setItem("cpuagen_console_email", trimmed);
          localStorage.setItem("cpuagen_waitlist_email", trimmed);
        } catch { /* */ }
        setHasAccess(true);
        window.location.href = "/app/chat";
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Network error — please try again");
    }
    setLoading(false);
  };

  if (hasAccess) {
    return (
      <a
        href="/app/chat"
        className="px-8 py-3 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-all duration-200 hover:glow-accent"
      >
        Launch Console
      </a>
    );
  }

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="px-8 py-3 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-all duration-200 hover:glow-accent cursor-pointer"
      >
        Launch Console
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email to continue"
          required
          autoFocus
          disabled={loading}
          className="px-4 py-3 rounded-lg bg-surface border border-accent/30 text-foreground placeholder:text-muted/50 font-mono text-sm focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50 w-64"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-all duration-200 hover:glow-accent cursor-pointer disabled:opacity-50"
        >
          {loading ? "..." : "Go"}
        </button>
      </div>
      {error && <div className="text-red-400 text-xs font-mono">{error}</div>}
      <p className="text-[10px] text-muted">Your email lets us notify you of updates</p>
    </form>
  );
}

/* ─── Live engine stats hook ─── */
function useLiveStats() {
  const [stats, setStats] = useState<{
    teepCount: number;
    cacheHits: number;
    hitRate: string;
    morphicField: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/teep")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          const s = data.snapshot;
          const total = s.counters.cacheHits + s.counters.cacheMisses;
          setStats({
            teepCount: s.teeps.length,
            cacheHits: s.counters.cacheHits,
            hitRate: total > 0 ? ((s.counters.cacheHits / total) * 100).toFixed(0) : "0",
            morphicField: s.morphicFieldStrength,
          });
        }
      })
      .catch(() => {});
  }, []);

  return stats;
}

/* ─── Main page ─── */
export default function Home() {
  const liveStats = useLiveStats();
  return (
    <main className="min-h-screen grid-bg">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent/20 border border-accent/40 flex items-center justify-center">
              <span className="text-accent-light text-xs font-bold">C</span>
            </div>
            <span className="font-semibold tracking-tight">CPUAGEN</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted hover:text-foreground transition-colors hidden sm:block">
              Features
            </a>
            <a href="#architecture" className="text-muted hover:text-foreground transition-colors hidden sm:block">
              Architecture
            </a>
            <a
              href="#waitlist"
              className="px-4 py-1.5 rounded-md bg-accent/10 border border-accent/30 text-accent-light text-sm hover:bg-accent/20 transition-colors"
            >
              Get Access
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 radial-fade">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface/50 text-xs text-muted mb-8">
            <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse-live" />
            Engine live &mdash; millions of validated responses
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Your LLM.
            <br />
            <span className="text-accent-light glow-text">Our physics.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            CPUAGEN (CPU Agentic Engine) is the enforcement layer between you and your AI. Every
            prompt is validated. Every response passes a full series of safety
            barriers. Every solved state compounds into reusable knowledge. Bring Claude, GPT,
            Gemini, Grok &mdash; we make them honest.
          </p>

          <div className="flex flex-col items-center gap-4 mb-16">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <EmailGatedLaunch />
              <span className="text-muted text-xs">or</span>
              <WaitlistForm />
            </div>
            <p className="text-xs text-muted">
              No credit card. Bring your own API key.
            </p>
          </div>

          <PhysicsOrb />
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-surface/30">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">
              <AnimatedNumber target={7300000} suffix="+" />
            </div>
            <div className="text-xs text-muted mt-1">Validated Responses</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">
              {liveStats ? `${liveStats.hitRate}%` : "ALL"}
            </div>
            <div className="text-xs text-muted mt-1">
              {liveStats ? "Live Cache Hit Rate" : "Safety Barriers"}
            </div>
            {liveStats && (
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                <span className="text-[9px] text-success font-mono">LIVE</span>
              </div>
            )}
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">
              {liveStats ? liveStats.teepCount : "<1ms"}
            </div>
            <div className="text-xs text-muted mt-1">
              {liveStats ? "Active TEEPs" : "Cache Lookup"}
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">6</div>
            <div className="text-xs text-muted mt-1">LLM Providers</div>
          </div>
        </div>
      </section>

      {/* Pipeline demo */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Every message. Enforced.</h2>
          <p className="text-muted text-center mb-12 max-w-xl mx-auto">
            Your prompt never touches the LLM raw. Every step of the validation
            process is protected by a full series of safety barriers that enforce correctness throughout.
          </p>
          <EnforcementDemo />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6 bg-surface/20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">What you get</h2>
          <p className="text-muted text-center mb-12 max-w-xl mx-auto">
            Not another chatbot wrapper. A physics engine that sits between you and any LLM.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <FeatureCard
              icon={"\u2696\uFE0F"}
              title="Validated AI Responses"
              description="Every response passes through our proprietary validation engine. Mathematically guaranteed convergence to accurate answers, not just statistical guessing."
              metric="Proprietary enforcement engine"
            />
            <FeatureCard
              icon={"\uD83D\uDEE1\uFE0F"}
              title="9 Safety Barriers"
              description="Nine independent safety checks validate every output across truth, coherence, quality, and more. All 9 must pass or the output is blocked — no exceptions."
              metric={"ALL 9 SAFE \u2192 EMIT | ANY UNSAFE \u2192 BLOCK"}
            />
            <FeatureCard
              icon={"\u26A1"}
              title="Basin State Memory"
              description="Once a query is solved, its thermodynamic basin state is stored as a TEEP. Millions of pre-solved states let the LLM render from known attractors, skipping costly re-computation."
              metric="7.3M+ solved basins"
            />
            <FeatureCard
              icon={"\uD83C\uDF10"}
              title="Bring Any LLM"
              description="Claude, GPT-4o, Gemini, Grok, Llama. Plug in your API key. CPUAGEN enforces the same validation on all of them."
              metric="5+ providers · 13+ models"
            />
            <FeatureCard
              icon={"\uD83D\uDD2C"}
              title="Intelligent Retrieval"
              description="Advanced indexing makes knowledge lookups dramatically faster. Queries find validated answers through intelligent multi-pass retrieval across millions of cached states."
              metric="Sub-millisecond lookups"
            />
            <FeatureCard
              icon={"\uD83D\uDE80"}
              title="Multi-Stage Compression"
              description="Proprietary multi-stage entropy compression pipeline reduces prompts to their semantic essence before validation. Watch the full pipeline in the interactive Physics Lab."
              metric="Proprietary compression pipeline"
            />
            <FeatureCard
              icon={"\uD83D\uDCCA"}
              title="Ensemble Consensus"
              description="Query 2-6 LLM providers simultaneously. Validate each response independently, compute weighted centroids, detect outliers, and converge on a validated consensus answer."
              metric="Multi-provider agreement scoring"
            />
            <FeatureCard
              icon={"\uD83C\uDFAF"}
              title="Adaptive Geometry"
              description="The enforcement engine uses advanced differential geometry to learn which dimensions of meaning matter most. Weights adapt in real-time as the system processes more queries."
              metric="Self-tuning validation weights"
            />
            <FeatureCard
              icon={"\uD83D\uDEE0\uFE0F"}
              title="Code + Workspace + Lab"
              description={"Full IDE in the browser. Chat, code canvas, PDF markup, dev lab, and interactive Physics Lab \u2014 all through the enforcement layer. Try the Lab to see the validation engine in real-time."}
              metric="Chat · Lab · Code · Dual · Dev"
            />
            <FeatureCard
              icon={"\uD83D\uDDDC\uFE0F"}
              title="Maximum-Density Storage"
              description="Every knowledge signature is compressed to the theoretical maximum information density. Optimal storage while preserving all meaningful semantic content — no bits wasted."
              metric="Theoretical max compression"
            />
            <FeatureCard
              icon={"\uD83D\uDCA0"}
              title="Convergence Detection"
              description="When multiple queries converge on the same semantic region, the engine detects interference patterns that mark high-confidence knowledge zones. More convergence means higher trust."
              metric="Multi-query confidence scoring"
            />
            <FeatureCard
              icon={"\uD83D\uDD17"}
              title="TEEP Chain Tracing"
              description="Every TEEP records its causal lineage: parent queries and child results form a directed acyclic graph. Trace knowledge provenance backward to root causes or forward to consequences."
              metric="Full causal DAG traversal"
            />
            <FeatureCard
              icon={"\uD83D\uDD04"}
              title="Multi-Turn Agent Loop"
              description="Tier 2 autonomous agents plan, execute tools, observe results, and iterate. Web search, code execution, calculations, URL fetching — all validated at every step."
              metric="Plan · Execute · Observe · Decide"
            />
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section id="architecture" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Your device &rarr; Our engine &rarr; Your LLM
          </h2>
          <p className="text-muted text-center mb-12 max-w-xl mx-auto">
            CPUAGEN sits between you and the model. Nothing gets through without validation.
          </p>
          <ArchitectureDiagram />
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20 px-6 bg-surface/20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Raw LLM vs CPUAGEN</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border border-danger/20 bg-danger/5">
              <h3 className="font-semibold text-danger mb-4">Without CPUAGEN</h3>
              <ul className="space-y-3 text-sm text-muted">
                {[
                  "LLM hallucinates with no enforcement",
                  "Same question re-computed every time",
                  "No truth validation on output",
                  "Locked to one provider",
                  "Knowledge dies with the session",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="text-danger mt-0.5">{"\u2717"}</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-6 rounded-xl border border-success/20 bg-success/5">
              <h3 className="font-semibold text-success mb-4">With CPUAGEN</h3>
              <ul className="space-y-3 text-sm text-muted">
                {[
                  "Full barrier series blocks bad output",
                  "Solved once, cached forever",
                  "Mathematically validated responses",
                  "Any LLM, same enforcement",
                  "Knowledge compounds across sessions",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="text-success mt-0.5">{"\u2713"}</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section id="waitlist" className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Get early access</h2>
          <p className="text-muted mb-8">
            CPUAGEN is in private alpha. Join the waitlist to be first in line.
          </p>
          <div className="flex justify-center mb-4">
            <WaitlistForm />
          </div>
          <p className="text-xs text-muted">Free tier available. Bring your own API key. No lock-in.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-accent/20 border border-accent/40 flex items-center justify-center">
              <span className="text-accent-light text-[10px] font-bold">C</span>
            </div>
            <span className="text-sm font-semibold">CPUAGEN</span>
            <span className="text-xs text-muted ml-2">Physics-Based AI Enforcement</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted">
            <a href="/app/feedback" className="hover:text-foreground transition-colors">Bug Report / Suggestions</a>
            <span>Powered by CPUAGEN Engine</span>
            <span>&copy; {new Date().getFullYear()} Wesley Foreman</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
