"use client";

import { useState } from "react";

type FeedbackType = "bug" | "suggestion";

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          subject: subject.trim(),
          description: description.trim(),
          email: email.trim() || undefined,
          page: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSubmitted(true);
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Network error — please try again");
    }
    setLoading(false);
  };

  const resetForm = () => {
    setSubmitted(false);
    setSubject("");
    setDescription("");
    setError("");
  };

  if (submitted) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">{type === "bug" ? "\uD83D\uDC1B" : "\uD83D\uDCA1"}</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Thank you!</h2>
          <p className="text-muted text-sm mb-6">
            Your {type === "bug" ? "bug report" : "suggestion"} has been submitted.
            We review every submission and will follow up if needed.
          </p>
          <button
            onClick={resetForm}
            className="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-all cursor-pointer"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Bug Reports & Suggestions</h1>
          <p className="text-muted text-sm">
            Help us improve CPUAGEN. Report a bug or suggest a feature.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type selector */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Type</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setType("bug")}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                  type === "bug"
                    ? "bg-danger/10 border-danger/40 text-danger"
                    : "bg-surface border-border text-muted hover:text-foreground hover:border-border-light"
                }`}
              >
                {"\uD83D\uDC1B"} Bug Report
              </button>
              <button
                type="button"
                onClick={() => setType("suggestion")}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                  type === "suggestion"
                    ? "bg-accent/10 border-accent/40 text-accent-light"
                    : "bg-surface border-border text-muted hover:text-foreground hover:border-border-light"
                }`}
              >
                {"\uD83D\uDCA1"} Suggestion
              </button>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Subject <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={type === "bug" ? "Brief description of the issue" : "What would you like to see?"}
              required
              maxLength={200}
              disabled={loading}
              className="w-full px-4 py-3 rounded-lg bg-surface border border-border text-foreground placeholder:text-muted/50 font-mono text-sm focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Description <span className="text-danger">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === "bug"
                  ? "Steps to reproduce:\n1. Go to...\n2. Click on...\n3. See error...\n\nExpected behavior:\nWhat should happen\n\nActual behavior:\nWhat actually happened"
                  : "Describe your suggestion in detail. What problem does it solve? How would it work?"
              }
              required
              maxLength={5000}
              rows={8}
              disabled={loading}
              className="w-full px-4 py-3 rounded-lg bg-surface border border-border text-foreground placeholder:text-muted/50 font-mono text-sm focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50 resize-y min-h-[160px]"
            />
            <div className="text-right text-[10px] text-muted mt-1">{description.length}/5000</div>
          </div>

          {/* Email (optional) */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Your Email <span className="text-muted/60">(optional — for follow-up)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              disabled={loading}
              className="w-full px-4 py-3 rounded-lg bg-surface border border-border text-foreground placeholder:text-muted/50 font-mono text-sm focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
            />
          </div>

          {/* Error display */}
          {error && (
            <div className="text-danger text-xs font-mono bg-danger/10 border border-danger/20 rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !subject.trim() || !description.trim()}
            className="w-full px-6 py-3 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-all duration-200 hover:glow-accent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting..." : `Submit ${type === "bug" ? "Bug Report" : "Suggestion"}`}
          </button>
        </form>
      </div>
    </div>
  );
}
