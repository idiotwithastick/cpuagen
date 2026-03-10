"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const nav = [
    { href: "/app/chat", label: "Chat", active: pathname?.startsWith("/app/chat") },
    { href: "/app/settings", label: "Settings", active: pathname?.startsWith("/app/settings") },
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
          <span className="text-[10px] text-accent-light font-mono ml-auto px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20">
            ALPHA
          </span>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? "bg-accent/10 text-accent-light border border-accent/20"
                  : "text-muted hover:text-foreground hover:bg-surface-light"
              }`}
            >
              <span className="w-5 text-center">
                {item.label === "Chat" ? "\u{1F4AC}" : "\u2699\uFE0F"}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border shrink-0">
          <div className="px-3 py-2 mb-2 rounded-lg bg-surface-light/50">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              <span className="text-[10px] font-mono text-success">ENGINE LIVE</span>
            </div>
            <div className="text-[10px] text-muted font-mono">
              7.3M+ cached | 8/8 barriers
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted hover:text-foreground hover:bg-surface-light transition-colors"
          >
            \u2190 Back to home
          </Link>
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
