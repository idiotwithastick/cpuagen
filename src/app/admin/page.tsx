"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.locked) {
        setLocked(true);
        setError(data.error);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        setAttemptsRemaining(data.attemptsRemaining ?? attemptsRemaining - 1);
        return;
      }

      // Store admin token
      sessionStorage.setItem("cpuagen-admin-token", data.token);
      // Full page navigation avoids RSC 503 issue with Next.js 16 middleware
      window.location.href = "/admin/dashboard";
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-red-900/20 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-red-400">
              <path d="M10 2v6M10 12v1M5 7l2 3M15 7l-2 3M4 14h12M6 14v4M14 14v4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#e4e4e7]">CPUAGEN Admin</h1>
          <p className="text-xs text-[#71717a] mt-1 font-mono">CPUAGEN Admin Console</p>
        </div>

        {locked ? (
          <div className="p-6 rounded-xl bg-red-950/50 border border-red-500/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-mono text-red-400">LOCKOUT ACTIVE</span>
            </div>
            <p className="text-sm text-red-300/80">{error}</p>
            <p className="text-xs text-red-400/60 mt-3 font-mono">
              All security data has been preserved. Contact system administrator.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-[#71717a] mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#0c0c12] border border-[#1e1e2e] text-[#e4e4e7] text-sm font-mono focus:outline-none focus:border-red-500/50 transition-colors"
                placeholder="admin"
                autoFocus
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#71717a] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#0c0c12] border border-[#1e1e2e] text-[#e4e4e7] text-sm font-mono focus:outline-none focus:border-red-500/50 transition-colors"
                placeholder="••••••••"
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/20">
                <p className="text-xs text-red-400">{error}</p>
                <p className="text-[10px] text-red-400/60 mt-1 font-mono">
                  {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining before lockout
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-2.5 rounded-lg bg-red-900 hover:bg-red-800 text-white font-semibold text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? "Authenticating..." : "Access Admin Console"}
            </button>

            <div className="text-center">
              <a href="/" className="text-[10px] text-[#71717a] hover:text-[#e4e4e7] transition-colors font-mono">
                &larr; Back to CPUAGEN
              </a>
            </div>
          </form>
        )}

        {/* Enforcement badge */}
        <div className="mt-6 p-3 rounded-lg bg-[#0c0c12] border border-[#1e1e2e]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            <span className="text-[10px] font-mono text-[#71717a]">CPUAGEN Enforcement Active</span>
          </div>
          <div className="text-[10px] font-mono text-[#71717a]/60 mt-1">
            All admin actions enforced through safety barrier series
          </div>
        </div>
      </div>
    </div>
  );
}
