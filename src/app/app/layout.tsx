"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("cpuagen-feedback-cta-dismissed")) setFeedbackDismissed(true);
    } catch { /* ignore */ }
  }, []);

  // Detect admin session from sessionStorage token
  useEffect(() => {
    try {
      const token = sessionStorage.getItem("cpuagen-admin-token");
      if (token) {
        const decoded = atob(token);
        const adminUser = "wforeman";
        setIsAdmin(decoded.startsWith(adminUser + ":"));
      }
    } catch { /* not admin */ }
  }, []);

  const nav = [
    { href: "/app/chat", label: "Chat", icon: "\u{1F4AC}", active: pathname?.startsWith("/app/chat") },
    { href: "/app/workspace", label: "Workspace", icon: "\u{1F4C1}", active: pathname?.startsWith("/app/workspace") },
    { href: "/app/code", label: "Code", icon: "\u{1F4BB}", active: pathname?.startsWith("/app/code") },
    { href: "/app/dual", label: "Dual", icon: "\u{1F91D}", active: pathname?.startsWith("/app/dual") },
    { href: "/app/cowork", label: "Cowork", icon: "\u{1F9D1}\u200D\u{1F4BB}", active: pathname?.startsWith("/app/cowork") },
    { href: "/app/automate", label: "Automate", icon: "\u{1F916}", active: pathname?.startsWith("/app/automate") },
    { href: "/app/agent", label: "Agent Loop", icon: "\u{1F504}", active: pathname?.startsWith("/app/agent") },
    { href: "/app/dashboard", label: "Dashboard", icon: "\u{1F4CA}", active: pathname?.startsWith("/app/dashboard") },
    { href: "/app/memory", label: "Memory", icon: "\u{1F9E0}", active: pathname?.startsWith("/app/memory") },
    { href: "/app/extensions", label: "Extensions", icon: "\u{1F9E9}", active: pathname?.startsWith("/app/extensions") },
    { href: "/app/dev", label: "Dev Lab", icon: "\u{1F9EA}", active: pathname?.startsWith("/app/dev") },
    { href: "/app/settings", label: "Settings", icon: "\u2699\uFE0F", active: pathname?.startsWith("/app/settings") },
    { href: "/app/feedback", label: "Feedback", icon: "\u{1F4E8}", active: pathname?.startsWith("/app/feedback") },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-56 bg-surface border-r border-border flex flex-col transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-border shrink-0">
          <div className="w-6 h-6 rounded bg-accent/20 border border-accent/40 flex items-center justify-center">
            <span className="text-accent-light text-xs font-bold">C</span>
          </div>
          <span className="font-semibold tracking-tight text-sm">CPUAGEN</span>
          <span className={`text-[10px] font-mono ml-auto px-1.5 py-0.5 rounded border ${
            isAdmin
              ? "text-warning bg-warning/10 border-warning/30"
              : "text-accent-light bg-accent/10 border-accent/20"
          }`}>
            {isAdmin ? "ADMIN" : "ALPHA"}
          </span>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-1">
          {nav.map((item) => (
            <div key={item.href} className="relative">
              <Link
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  item.active
                    ? "bg-accent/10 text-accent-light border border-accent/20"
                    : "text-muted hover:text-foreground hover:bg-surface-light"
                }`}
              >
                <span className="w-5 text-center">
                  {item.icon}
                </span>
                {item.label}
              </Link>
              {item.href === "/app/feedback" && !feedbackDismissed && !item.active && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 w-52">
                  <div className="relative bg-accent/95 text-white text-[10px] leading-tight rounded-lg px-3 py-2 shadow-lg shadow-accent/20 border border-accent/40">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFeedbackDismissed(true);
                        try { localStorage.setItem("cpuagen-feedback-cta-dismissed", "1"); } catch { /* ignore */ }
                      }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface border border-border text-muted hover:text-foreground flex items-center justify-center text-[8px] leading-none"
                    >
                      {"\u2715"}
                    </button>
                    <span className="font-semibold">Your ideas go live!</span> Submit suggestions and you may see them deployed autonomously.
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-4 text-accent/95 animate-bounce text-lg leading-none">
                      {"\u2193"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-border shrink-0">
          {isAdmin && (
            <div className="px-3 py-2 mb-2 rounded-lg bg-warning/5 border border-warning/20">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 bg-warning rounded-full animate-pulse" />
                <span className="text-[10px] font-mono text-warning">ADMIN MODE</span>
              </div>
              <div className="text-[10px] text-muted font-mono">
                Full SSD-RCI access | No obfuscation
              </div>
            </div>
          )}
          <div className="px-3 py-2 mb-2 rounded-lg bg-surface-light/50">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              <span className="text-[10px] font-mono text-success">ENGINE LIVE</span>
            </div>
            <div className="text-[10px] text-muted font-mono">
              7.3M+ cached | all barriers active
            </div>
          </div>
          <div className="flex gap-1">
            <Link
              href="/"
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted hover:text-foreground hover:bg-surface-light transition-colors"
            >
              \u2190 Home
            </Link>
            {!isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs text-muted hover:text-warning hover:bg-warning/5 transition-colors"
              >
                Admin
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden h-14 flex items-center px-4 border-b border-border bg-surface/50 backdrop-blur-xl shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-muted hover:text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <span className="ml-3 font-semibold text-sm">CPUAGEN</span>
        </div>
        {children}
      </div>
    </div>
  );
}
