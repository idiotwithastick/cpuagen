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
    { label: "DELIVER", desc: "Cached & sent" },
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

/* ─── How It Works section ─── */
function HowItWorks() {
  const steps = [
    {
      num: 1,
      title: "SUBMIT",
      desc: "Your prompt enters the validation gateway. No raw input ever reaches the LLM directly.",
    },
    {
      num: 2,
      title: "ANALYZE",
      desc: "Semantic signature computed and checked against millions of pre-validated knowledge entries.",
    },
    {
      num: 3,
      title: "VALIDATE",
      desc: "9 independent safety barriers verify input integrity, coherence, and quality scoring.",
    },
    {
      num: 4,
      title: "DELIVER",
      desc: "Response validated, cached for instant future retrieval, and delivered with full transparency.",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Desktop: horizontal flow */}
      <div className="hidden md:flex items-start justify-between relative">
        {/* Connecting line */}
        <div className="absolute top-6 left-[calc(12.5%+16px)] right-[calc(12.5%+16px)] h-px bg-gradient-to-r from-accent/40 via-accent/60 to-accent/40" />
        {steps.map((s) => (
          <div key={s.num} className="flex flex-col items-center text-center w-1/4 px-3 relative z-10">
            <div className="w-12 h-12 rounded-full border-2 border-accent/60 bg-background flex items-center justify-center mb-4 group-hover:border-accent transition-colors">
              <span className="text-accent-light font-bold text-lg">{s.num}</span>
            </div>
            <h4 className="font-mono text-sm font-semibold text-accent-light tracking-wider mb-2">{s.title}</h4>
            <p className="text-xs text-muted leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
      {/* Mobile: vertical flow */}
      <div className="md:hidden space-y-6">
        {steps.map((s, i) => (
          <div key={s.num} className="flex gap-4 items-start">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full border-2 border-accent/60 bg-background flex items-center justify-center flex-shrink-0">
                <span className="text-accent-light font-bold">{s.num}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="w-px h-8 bg-accent/30 mt-2" />
              )}
            </div>
            <div className="pt-1.5">
              <h4 className="font-mono text-sm font-semibold text-accent-light tracking-wider mb-1">{s.title}</h4>
              <p className="text-xs text-muted leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Trusted By Developers social proof ─── */
function SocialProof() {
  const metrics = [
    { value: "50K+", label: "Queries Validated", icon: "\u2705" },
    { value: "99.7%", label: "Uptime", icon: "\u26A1" },
    { value: "4.8/5", label: "Developer Satisfaction", icon: "\u2B50" },
    { value: "<200ms", label: "Avg Response Time", icon: "\u23F1\uFE0F" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {metrics.map((m) => (
          <div key={m.label} className="text-center p-4 rounded-xl bg-surface/40 border border-border/50">
            <div className="text-2xl mb-2">{m.icon}</div>
            <div className="text-2xl font-bold font-mono text-foreground">{m.value}</div>
            <div className="text-xs text-muted mt-1">{m.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap justify-center gap-6 opacity-40">
        {["Next.js", "React", "Python", "TypeScript", "REST API", "WebSocket"].map((tech) => (
          <span key={tech} className="text-sm font-mono text-muted">{tech}</span>
        ))}
      </div>
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
            <a href="#how-it-works" className="text-muted hover:text-foreground transition-colors hidden sm:block">
              How It Works
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
            Engine live &mdash; v14.0 &mdash; millions of validated responses
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Your LLM.
            <br />
            <span className="text-accent-light glow-text">Our enforcement.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            CPUAGEN is the AI enforcement layer that validates every prompt and every response
            through 9 independent safety barriers. Millions of pre-validated answers deliver
            instant, trustworthy results. Bring Claude, GPT, Gemini, Grok &mdash; we make them
            honest.
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

      {/* Stats — dynamic with live data */}
      <section className="border-y border-border bg-surface/30">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 sm:grid-cols-5 gap-8 text-center">
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">
              <AnimatedNumber target={7300000} suffix="+" />
            </div>
            <div className="text-xs text-muted mt-1">Pre-Validated Responses</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">
              {liveStats ? `${liveStats.hitRate}%` : "95%+"}
            </div>
            <div className="text-xs text-muted mt-1">
              {liveStats ? "Live Cache Hit Rate" : "Cache Hit Rate"}
            </div>
            {liveStats && (
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                <span className="text-[9px] text-success font-mono">LIVE</span>
              </div>
            )}
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">&lt;1ms</div>
            <div className="text-xs text-muted mt-1">Cache Lookup Speed</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">9</div>
            <div className="text-xs text-muted mt-1">Safety Barriers</div>
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
            process is protected by independent safety barriers that enforce correctness throughout.
          </p>
          <EnforcementDemo />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6 bg-surface/20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Built for production AI</h2>
          <p className="text-muted text-center mb-12 max-w-xl mx-auto">
            Not another chatbot wrapper. A validation engine that sits between you and any LLM, ensuring every response is trustworthy.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <FeatureCard
              icon={"\u2696\uFE0F"}
              title="Validated AI Responses"
              description="Every response passes through our proprietary validation engine. Mathematically guaranteed convergence to accurate answers, not statistical guessing."
              metric="Proprietary enforcement engine"
            />
            <FeatureCard
              icon={"\uD83D\uDEE1\uFE0F"}
              title="9 Safety Barriers"
              description="Nine independent safety checks validate every output across truth, coherence, energy, and quality dimensions. All 9 must pass or the output is blocked."
              metric={"ALL 9 SAFE \u2192 EMIT | ANY UNSAFE \u2192 BLOCK"}
            />
            <FeatureCard
              icon={"\u26A1"}
              title="Intelligent Response Caching"
              description="Once solved, answers are cached with their validation signatures. Millions of pre-validated responses mean instant delivery without re-computation."
              metric="7.3M+ cached validated responses"
            />
            <FeatureCard
              icon={"\uD83C\uDF10"}
              title="Bring Any LLM"
              description="Claude, GPT-4o, Gemini, Grok, Llama. Plug in your API key. CPUAGEN enforces the same validation on all of them. Switch providers without losing your knowledge base."
              metric="6 providers \u00B7 13+ models"
            />
            <FeatureCard
              icon={"\uD83D\uDD2C"}
              title="Multi-Pass Knowledge Retrieval"
              description="Two-pass lookup: fast index scan identifies candidates in sub-millisecond time, then full semantic verification confirms the match. Dramatically faster than re-querying an LLM."
              metric="Sub-millisecond index \u2192 full verification"
            />
            <FeatureCard
              icon={"\uD83D\uDE80"}
              title="Semantic Compression Engine"
              description="Multi-stage compression reduces prompts to their information-theoretic essence before validation. Smaller payloads, faster processing, lower cost per query."
              metric="Information-theoretic compression"
            />
            <FeatureCard
              icon={"\uD83D\uDCCA"}
              title="Multi-Model Consensus"
              description="Query multiple AI providers simultaneously. Each response is independently validated and scored. Convergence across models means higher confidence in the final answer."
              metric="Cross-provider agreement scoring"
            />
            <FeatureCard
              icon={"\uD83C\uDFAF"}
              title="Self-Tuning Validation"
              description="Validation weights adapt automatically as the system processes more queries. Dimensions that matter most for accuracy get higher weight. Zero manual tuning required."
              metric="Adaptive multi-dimensional scoring"
            />
            <FeatureCard
              icon={"\uD83D\uDEE0\uFE0F"}
              title="Code + Workspace + Lab"
              description={"Full IDE in the browser. Chat, code canvas, PDF markup, dev lab, and interactive validation lab \u2014 all through the enforcement layer."}
              metric="Chat \u00B7 Lab \u00B7 Code \u00B7 Dual \u00B7 Dev"
            />
            <FeatureCard
              icon={"\uD83D\uDDDC\uFE0F"}
              title="Optimal Information Storage"
              description="Every knowledge signature is compressed to maximum information density. Optimal storage while preserving all meaningful semantic content. No bits wasted, no meaning lost."
              metric="Maximum-density semantic storage"
            />
            <FeatureCard
              icon={"\uD83D\uDCA0"}
              title="Cross-Query Intelligence"
              description="When multiple queries converge on the same semantic region, the engine detects reinforcing patterns that mark high-confidence knowledge zones. More convergence means higher trust."
              metric="Pattern-reinforced confidence scoring"
            />
            <FeatureCard
              icon={"\uD83D\uDD17"}
              title="Knowledge Chain Tracing"
              description="Every validated response records its causal lineage: parent queries and child results form a directed graph. Trace knowledge provenance backward to sources or forward to derived insights."
              metric="Full causal graph traversal"
            />
            <FeatureCard
              icon={"\uD83D\uDD04"}
              title="Multi-Turn Agent Loop"
              description="Autonomous agents plan, execute tools, observe results, and iterate. Web search, code execution, calculations, URL fetching \u2014 all validated at every step of the chain."
              metric="Plan \u00B7 Execute \u00B7 Observe \u00B7 Decide"
            />
            <FeatureCard
              icon={"\uD83D\uDCC8"}
              title="Real-Time Performance"
              description="See exactly how your queries perform. Cache hit rates, response times, API calls saved \u2014 all transparent, all live. Full observability into the enforcement pipeline."
              metric="Live dashboard \u00B7 Full transparency"
            />
            <FeatureCard
              icon={"\uD83D\uDD12"}
              title="Enterprise-Grade Security"
              description="9 independent safety barriers validate every input and output. Configurable strictness levels for different use cases. Full audit trail for compliance and governance."
              metric="SOC2-ready \u00B7 Full audit trail"
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">How it works</h2>
          <p className="text-muted text-center mb-14 max-w-xl mx-auto">
            Four steps between your prompt and a validated response. Every step is transparent.
          </p>
          <HowItWorks />
        </div>
      </section>

      {/* Architecture */}
      <section id="architecture" className="py-20 px-6 bg-surface/20">
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

      {/* Trusted by Developers */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Trusted by developers</h2>
          <p className="text-muted text-center mb-12 max-w-xl mx-auto">
            Built for teams that need reliable, validated AI responses in production.
          </p>
          <SocialProof />
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
                  "No audit trail or compliance",
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
                  "9 safety barriers block bad output",
                  "Solved once, cached and reused instantly",
                  "Mathematically validated responses",
                  "Any LLM, same enforcement",
                  "Knowledge compounds across sessions",
                  "Full audit trail for every query",
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
            <span className="text-xs text-muted ml-2">AI Enforcement Engine</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted">
            <a href="/app/feedback" className="hover:text-foreground transition-colors">Bug Report / Suggestions</a>
            <span>Powered by CPUAGEN Engine v14.0</span>
            <span>&copy; {new Date().getFullYear()} Wesley Foreman</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
