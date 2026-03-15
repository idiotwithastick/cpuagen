"use client";

import { useState } from "react";

type FeedbackType = "bug" | "suggestion";

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [feedbackId, setFeedbackId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Solve prompt state
  const [solvePrompt, setSolvePrompt] = useState("");
  const [solveLoading, setSolveLoading] = useState(false);
  const [solveCopied, setSolveCopied] = useState(false);
  const [solveStatus, setSolveStatus] = useState<"" | "generated" | "approved" | "rejected">("");

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
        setFeedbackId(data.id);
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Network error — please try again");
    }
    setLoading(false);
  };

  const generateSolve = async () => {
    if (!feedbackId) return;
    setSolveLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "solve", id: feedbackId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSolvePrompt(data.prompt);
        setSolveStatus("generated");
      }
    } catch { /* ignore */ }
    setSolveLoading(false);
  };

  const copySolve = () => {
    navigator.clipboard.writeText(solvePrompt);
    setSolveCopied(true);
    setTimeout(() => setSolveCopied(false), 2000);
  };

  const approveSolve = async () => {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", id: feedbackId }),
    });
    const data = await res.json();
    if (res.ok && data.ok) setSolveStatus("approved");
  };

  const rejectSolve = async () => {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", id: feedbackId }),
    });
    const data = await res.json();
    if (res.ok && data.ok) setSolveStatus("rejected");
  };

  const resetForm = () => {
    setSubmitted(false);
    setSubject("");
    setDescription("");
    setError("");
    setFeedbackId("");
    setSolvePrompt("");
    setSolveStatus("");
  };

  if (submitted) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-4xl mb-4">{type === "bug" ? "\uD83D\uDC1B" : "\uD83D\uDCA1"}</div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Thank you!</h2>
            <p className="text-muted text-sm mb-2">
              Your {type === "bug" ? "bug report" : "suggestion"} has been submitted.
            </p>
            <p className="text-[10px] font-mono text-muted/60 mb-6">ID: {feedbackId}</p>
          </div>

          {/* Generate a Solve section */}
          {!solvePrompt && (
            <div className="bg-surface border border-border rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-lg">
                  {"\u{1F9E0}"}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-sm mb-1">Generate a Solve</h3>
                  <p className="text-muted text-xs mb-4">
                    Create an engineered prompt that can be given to the AI development agent to autonomously fix this {type === "bug" ? "bug" : "feature request"}.
                    The generated prompt will need admin approval before it can be executed.
                  </p>
                  <button
                    onClick={generateSolve}
                    disabled={solveLoading}
                    className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-accent to-accent-light text-white font-semibold text-sm transition-all hover:opacity-90 cursor-pointer disabled:opacity-50"
                  >
                    {solveLoading ? "Generating..." : "\u{26A1} Generate Solve Prompt"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Generated solve prompt */}
          {solvePrompt && (
            <div className="bg-surface border border-accent/20 rounded-xl overflow-hidden mb-6">
              <div className="flex items-center justify-between px-4 py-3 bg-accent/5 border-b border-accent/10">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{"\u{26A1}"}</span>
                  <span className="text-xs font-semibold text-foreground">Generated Solve Prompt</span>
                  {solveStatus === "approved" && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-success/10 text-success border border-success/20">
                      APPROVED
                    </span>
                  )}
                  {solveStatus === "rejected" && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-danger/10 text-danger border border-danger/20">
                      REJECTED
                    </span>
                  )}
                  {solveStatus === "generated" && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-warning/10 text-warning border border-warning/20">
                      PENDING REVIEW
                    </span>
                  )}
                </div>
                <button
                  onClick={copySolve}
                  className="px-3 py-1 rounded text-[10px] font-mono text-accent-light bg-accent/10 hover:bg-accent/20 border border-accent/20 cursor-pointer transition-colors"
                >
                  {solveCopied ? "\u2713 Copied!" : "Copy Prompt"}
                </button>
              </div>
              <pre className="p-4 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
                {solvePrompt}
              </pre>

              {/* Admin action buttons */}
              {solveStatus === "generated" && (
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-light/50 border-t border-border">
                  <span className="text-[10px] text-muted font-mono flex-1">
                    Review this prompt. Approve to add to the autonomous solve queue, or reject to discard.
                  </span>
                  <button
                    onClick={approveSolve}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-success/10 text-success border border-success/20 hover:bg-success/20 cursor-pointer transition-colors"
                  >
                    {"\u2713"} Approve
                  </button>
                  <button
                    onClick={rejectSolve}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 cursor-pointer transition-colors"
                  >
                    {"\u2717"} Reject
                  </button>
                </div>
              )}

              {solveStatus === "approved" && (
                <div className="px-4 py-3 bg-success/5 border-t border-success/10">
                  <p className="text-[10px] font-mono text-success/80">
                    {"\u2713"} This solve has been approved. The development agent can pick it up from the solve queue at GET /api/feedback.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <button
              onClick={resetForm}
              className="px-6 py-2.5 rounded-lg bg-surface hover:bg-surface-light text-foreground font-semibold text-sm transition-all cursor-pointer border border-border"
            >
              Submit Another
            </button>
          </div>
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
            Help us improve CPUAGEN. Report a bug or suggest a feature — then generate a solve prompt for autonomous fixing.
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
