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
          dS&le;0
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
        "Universal Gateway",
        "Physics Engine",
        "CBF (8 Schemes)",
        "TEEP Cache",
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
    { label: "GATEWAY", desc: "26 pathways" },
    { label: "PHYSICS", desc: "dS \u2264 0" },
    { label: "CBF", desc: "8/8 SAFE" },
    { label: "TEEP", desc: "Basin cached" },
    { label: "OUTPUT", desc: "Validated" },
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
                ? "border-success/40 bg-success/5"
                : i === step
                  ? "border-accent/60 bg-accent/10 glow-accent"
                  : "border-border bg-surface/30"
            }`}
          >
            <span
              className={`text-[10px] font-mono tracking-wider ${
                i < step
                  ? "text-success"
                  : i === step
                    ? "text-accent-light"
                    : "text-muted"
              }`}
            >
              {s.label}
            </span>
            <span className="text-[9px] text-muted mt-0.5">{s.desc}</span>
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-success font-mono text-sm">
        <span className="w-2 h-2 bg-success rounded-full animate-pulse-live" />
        You&apos;re on the list. We&apos;ll be in touch.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-md">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        required
        className="flex-1 px-4 py-3 rounded-lg bg-surface border border-border text-foreground placeholder:text-muted/50 font-mono text-sm focus:outline-none focus:border-accent/50 transition-colors"
      />
      <button
        type="submit"
        className="px-6 py-3 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-all duration-200 hover:glow-accent cursor-pointer"
      >
        Early Access
      </button>
    </form>
  );
}

/* ─── Main page ─── */
export default function Home() {
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
            Engine live &mdash; 7.3M+ solved basins
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Your LLM.
            <br />
            <span className="text-accent-light glow-text">Our physics.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            CPUAGEN is the enforcement layer between you and your AI. Every
            prompt is physics-validated. Every response is barrier-checked.
            Every answer is permanently cached. Bring Claude, GPT, Gemini,
            Grok &mdash; we make them honest.
          </p>

          <div className="flex flex-col items-center gap-4 mb-16">
            <WaitlistForm />
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
            <div className="text-xs text-muted mt-1">Solved Basins</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">8/8</div>
            <div className="text-xs text-muted mt-1">Control Barriers</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">&lt;1ms</div>
            <div className="text-xs text-muted mt-1">Cache Lookup</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-accent-light">
              <AnimatedNumber target={26} />
            </div>
            <div className="text-xs text-muted mt-1">Enforced Pathways</div>
          </div>
        </div>
      </section>

      {/* Pipeline demo */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Every message. Enforced.</h2>
          <p className="text-muted text-center mb-12 max-w-xl mx-auto">
            Your prompt never touches the LLM raw. It passes through thermodynamic
            physics, 8 control barriers, and a 7.3M-entry knowledge cache first.
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={"\u2696\uFE0F"}
              title="Physics-Based Enforcement"
              description="Every response follows thermodynamic gradient descent. The math guarantees convergence to truth, not just statistical likelihood."
              metric={"d\u03C8/dt = -\u03B7\u2207S[\u03C8]"}
            />
            <FeatureCard
              icon={"\uD83D\uDEE1\uFE0F"}
              title="8 Control Barriers"
              description="Truth, naturality, energy, temperature, coherence, error, quality, and synergy. All 8 must pass or the output is blocked."
              metric={"ALL SAFE \u2192 EMIT | ANY UNSAFE \u2192 BLOCK"}
            />
            <FeatureCard
              icon={"\u26A1"}
              title="TEEP Knowledge Cache"
              description="Once a question is solved, it's solved forever. 7.3M+ pre-solved basins mean most queries return in under 1ms."
              metric={"O(1) lookup \u00B7 O(N\u2192\u221E) growth"}
            />
            <FeatureCard
              icon={"\uD83C\uDF10"}
              title="Bring Any LLM"
              description="Claude, GPT-4o, Gemini, Grok, Llama. Plug in your API key. CPUAGEN enforces the same physics on all of them."
              metric={"5+ providers \u00B7 13 models"}
            />
            <FeatureCard
              icon={"\uD83D\uDCCA"}
              title="Multi-Model Consensus"
              description="For critical decisions, query multiple LLMs simultaneously and converge on a physics-validated consensus answer."
              metric="Cross-model basin convergence"
            />
            <FeatureCard
              icon={"\uD83D\uDEE0\uFE0F"}
              title="Workspace Mode"
              description={"Coming soon: Full IDE in the browser. Edit real files, run real code, build real software \u2014 all through the enforcement layer."}
              metric={"Phase 2 \u00B7 2026"}
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
            CPUAGEN sits between you and the model. Nothing gets through without physics validation.
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
                  "8 control barriers block bad output",
                  "Solved once, cached forever (7.3M+)",
                  "Physics-validated thermodynamic proof",
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
            <span>Powered by SSD-RCI v10.4</span>
            <span>&copy; {new Date().getFullYear()} Wesley Foreman</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
