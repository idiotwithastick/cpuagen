// Server-side security state — in-memory with logging
// Persists within a serverless function instance lifecycle

interface SecurityEvent {
  type: "site_auth_fail" | "admin_auth_fail" | "site_lockout" | "admin_lockout" | "admin_login" | "admin_action" | "enforcement_pass" | "enforcement_block" | "teep_cached";
  ip: string;
  timestamp: number;
  details?: string;
}

interface LockoutState {
  siteLocked: boolean;
  adminLocked: boolean;
  siteLockTime?: number;
  adminLockTime?: number;
  siteFailedAttempts: Map<string, number>; // by IP
  adminFailedAttempts: Map<string, number>; // by IP
  totalSiteFailures: number;
  totalAdminFailures: number;
  events: SecurityEvent[];
  enforcementStats: {
    totalRequests: number;
    totalPassed: number;
    totalBlocked: number;
    barrierFailCounts: Record<string, number>;
    lastRequestTime?: number;
    teepsCached: number;
  };
}

// Global state (persists within serverless instance)
const state: LockoutState = {
  siteLocked: false,
  adminLocked: false,
  siteFailedAttempts: new Map(),
  adminFailedAttempts: new Map(),
  totalSiteFailures: 0,
  totalAdminFailures: 0,
  events: [],
  enforcementStats: {
    totalRequests: 0,
    totalPassed: 0,
    totalBlocked: 0,
    barrierFailCounts: {},
    teepsCached: 0,
  },
};

const SITE_FAIL_LIMIT = 20;
const ADMIN_FAIL_LIMIT = 10;

function addEvent(event: Omit<SecurityEvent, "timestamp">) {
  state.events.push({ ...event, timestamp: Date.now() });
  // Keep last 1000 events
  if (state.events.length > 1000) {
    state.events = state.events.slice(-1000);
  }
}

export function recordSiteAuthFail(ip: string): { locked: boolean; attempts: number } {
  const current = (state.siteFailedAttempts.get(ip) || 0) + 1;
  state.siteFailedAttempts.set(ip, current);
  state.totalSiteFailures++;

  addEvent({ type: "site_auth_fail", ip, details: `Attempt ${current}/${SITE_FAIL_LIMIT}` });

  if (current >= SITE_FAIL_LIMIT) {
    state.siteLocked = true;
    state.siteLockTime = Date.now();
    addEvent({ type: "site_lockout", ip, details: `Site locked after ${current} failures from IP ${ip}` });
    return { locked: true, attempts: current };
  }

  return { locked: false, attempts: current };
}

export function recordSiteAuthSuccess(ip: string) {
  state.siteFailedAttempts.delete(ip);
}

export function recordAdminAuthFail(ip: string): { locked: boolean; attempts: number } {
  const current = (state.adminFailedAttempts.get(ip) || 0) + 1;
  state.adminFailedAttempts.set(ip, current);
  state.totalAdminFailures++;

  addEvent({ type: "admin_auth_fail", ip, details: `Attempt ${current}/${ADMIN_FAIL_LIMIT}` });

  if (state.totalAdminFailures >= ADMIN_FAIL_LIMIT) {
    state.adminLocked = true;
    state.adminLockTime = Date.now();
    addEvent({ type: "admin_lockout", ip, details: `Admin locked + site taken down after ${state.totalAdminFailures} total failures` });
    // Admin lockout also takes down the site
    state.siteLocked = true;
    state.siteLockTime = Date.now();
    return { locked: true, attempts: current };
  }

  return { locked: false, attempts: current };
}

export function recordAdminLogin(ip: string) {
  state.adminFailedAttempts.delete(ip);
  addEvent({ type: "admin_login", ip });
}

export function isSiteLocked(): boolean {
  return state.siteLocked;
}

export function isAdminLocked(): boolean {
  return state.adminLocked;
}

export function getLockoutData(): {
  siteLocked: boolean;
  adminLocked: boolean;
  siteLockTime?: number;
  adminLockTime?: number;
  totalSiteFailures: number;
  totalAdminFailures: number;
  recentEvents: SecurityEvent[];
  siteFailsByIp: Record<string, number>;
  adminFailsByIp: Record<string, number>;
} {
  const siteFailsByIp: Record<string, number> = {};
  state.siteFailedAttempts.forEach((v, k) => { siteFailsByIp[k] = v; });
  const adminFailsByIp: Record<string, number> = {};
  state.adminFailedAttempts.forEach((v, k) => { adminFailsByIp[k] = v; });

  return {
    siteLocked: state.siteLocked,
    adminLocked: state.adminLocked,
    siteLockTime: state.siteLockTime,
    adminLockTime: state.adminLockTime,
    totalSiteFailures: state.totalSiteFailures,
    totalAdminFailures: state.totalAdminFailures,
    recentEvents: state.events.slice(-50),
    siteFailsByIp,
    adminFailsByIp,
  };
}

export function recordEnforcementRequest(passed: boolean, failedBarriers?: string[], ip?: string, stage?: string) {
  state.enforcementStats.totalRequests++;
  if (passed) {
    state.enforcementStats.totalPassed++;
    addEvent({ type: "enforcement_pass", ip: ip || "unknown", details: `${stage || "check"} — all barriers SAFE` });
  } else {
    state.enforcementStats.totalBlocked++;
    if (failedBarriers) {
      for (const b of failedBarriers) {
        state.enforcementStats.barrierFailCounts[b] = (state.enforcementStats.barrierFailCounts[b] || 0) + 1;
      }
    }
    addEvent({ type: "enforcement_block", ip: ip || "unknown", details: `${stage || "check"} — blocked: ${failedBarriers?.join(", ") || "unknown barriers"}` });
  }
  state.enforcementStats.lastRequestTime = Date.now();
}

export function recordTeepCached(teepId?: string, ip?: string) {
  state.enforcementStats.teepsCached++;
  addEvent({ type: "teep_cached", ip: ip || "unknown", details: teepId ? `TEEP ${teepId} cached` : "TEEP cached" });
}

export function getEnforcementStats() {
  return { ...state.enforcementStats };
}

export function getSecurityEvents(): SecurityEvent[] {
  return [...state.events];
}

export function unlockSite() {
  state.siteLocked = false;
  state.siteLockTime = undefined;
  state.totalSiteFailures = 0;
  state.siteFailedAttempts.clear();
  addEvent({ type: "admin_action", ip: "admin", details: "Site unlocked by admin" });
}

export function unlockAdmin() {
  state.adminLocked = false;
  state.adminLockTime = undefined;
  state.totalAdminFailures = 0;
  state.adminFailedAttempts.clear();
  addEvent({ type: "admin_action", ip: "admin", details: "Admin unlocked by admin" });
}

// ========================================================================
// v14.0 EARLY ACCESS LEDGER — Email signup + passcode gating
// ========================================================================

interface EarlyAccessEntry {
  email: string;
  ip: string;
  timestamp: number;
  passcode: string;         // 6-char alphanumeric code
  passcodeUsed: boolean;    // Has the user redeemed the code
  passcodeSentAt?: number;  // When admin sent the code
  accessGranted: boolean;   // Can this user access the app
}

const earlyAccessLedger = new Map<string, EarlyAccessEntry>(); // email → entry

function generatePasscode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No O/0/I/1 confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function earlyAccessSignup(email: string, ip: string): { ok: boolean; alreadyExists: boolean } {
  const normalized = email.toLowerCase().trim();
  if (earlyAccessLedger.has(normalized)) {
    return { ok: true, alreadyExists: true };
  }

  const entry: EarlyAccessEntry = {
    email: normalized,
    ip,
    timestamp: Date.now(),
    passcode: generatePasscode(),
    passcodeUsed: false,
    accessGranted: false,
  };

  earlyAccessLedger.set(normalized, entry);
  addEvent({ type: "admin_action", ip, details: `Early access signup: ${normalized}` });
  return { ok: true, alreadyExists: false };
}

export function validatePasscode(email: string, passcode: string): { valid: boolean; reason?: string } {
  const normalized = email.toLowerCase().trim();
  const entry = earlyAccessLedger.get(normalized);
  if (!entry) return { valid: false, reason: "Email not found in early access list" };
  if (entry.passcode !== passcode.toUpperCase().trim()) return { valid: false, reason: "Invalid passcode" };
  if (entry.passcodeUsed && entry.accessGranted) return { valid: true }; // Already redeemed, still valid

  entry.passcodeUsed = true;
  entry.accessGranted = true;
  addEvent({ type: "admin_action", ip: "passcode", details: `Passcode redeemed: ${normalized}` });
  return { valid: true };
}

export function isEmailGranted(email: string): boolean {
  const entry = earlyAccessLedger.get(email.toLowerCase().trim());
  return entry?.accessGranted ?? false;
}

export function getEarlyAccessLedger(): Array<{
  email: string;
  timestamp: number;
  passcode: string;
  passcodeUsed: boolean;
  passcodeSentAt?: number;
  accessGranted: boolean;
}> {
  return Array.from(earlyAccessLedger.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ email, timestamp, passcode, passcodeUsed, passcodeSentAt, accessGranted }) => ({
      email, timestamp, passcode, passcodeUsed, passcodeSentAt, accessGranted,
    }));
}

export function markPasscodeSent(email: string): boolean {
  const entry = earlyAccessLedger.get(email.toLowerCase().trim());
  if (!entry) return false;
  entry.passcodeSentAt = Date.now();
  return true;
}

export function grantAccess(email: string): boolean {
  const entry = earlyAccessLedger.get(email.toLowerCase().trim());
  if (!entry) return false;
  entry.accessGranted = true;
  return true;
}

export function revokeAccess(email: string): boolean {
  const entry = earlyAccessLedger.get(email.toLowerCase().trim());
  if (!entry) return false;
  entry.accessGranted = false;
  return true;
}

export function getEarlyAccessStats(): { total: number; granted: number; pending: number; redeemed: number } {
  let granted = 0, pending = 0, redeemed = 0;
  for (const entry of earlyAccessLedger.values()) {
    if (entry.accessGranted) granted++;
    if (!entry.passcodeSentAt) pending++;
    if (entry.passcodeUsed) redeemed++;
  }
  return { total: earlyAccessLedger.size, granted, pending, redeemed };
}

// ========================================================================
// FEEDBACK / BUG REPORTS — Stored in-memory, visible in admin dashboard
// ========================================================================

interface FeedbackEntry {
  id: string;
  type: "bug" | "suggestion";
  subject: string;
  description: string;
  email?: string;
  page?: string;
  ip: string;
  timestamp: number;
  status: "new" | "reviewed" | "resolved" | "dismissed";
  solvePrompt?: string;
  solveStatus?: "pending_review" | "approved" | "rejected" | "completed";
  solveGeneratedAt?: number;
  solveApprovedAt?: number;
}

const feedbackStore: FeedbackEntry[] = [];

export function saveFeedback(entry: Omit<FeedbackEntry, "id" | "timestamp" | "status">): FeedbackEntry {
  const fb: FeedbackEntry = {
    ...entry,
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    status: "new",
  };
  feedbackStore.unshift(fb); // newest first
  // Keep last 500
  if (feedbackStore.length > 500) feedbackStore.length = 500;
  addEvent({ type: "admin_action", ip: entry.ip, details: `Feedback submitted: [${entry.type}] ${entry.subject.slice(0, 60)}` });
  return fb;
}

export function getFeedbackList(): FeedbackEntry[] {
  return [...feedbackStore];
}

export function getFeedbackStats(): { total: number; bugs: number; suggestions: number; new: number; reviewed: number; resolved: number } {
  let bugs = 0, suggestions = 0, newCount = 0, reviewed = 0, resolved = 0;
  for (const fb of feedbackStore) {
    if (fb.type === "bug") bugs++;
    else suggestions++;
    if (fb.status === "new") newCount++;
    else if (fb.status === "reviewed") reviewed++;
    else if (fb.status === "resolved") resolved++;
  }
  return { total: feedbackStore.length, bugs, suggestions, new: newCount, reviewed, resolved };
}

export function updateFeedbackStatus(id: string, status: FeedbackEntry["status"]): boolean {
  const fb = feedbackStore.find((f) => f.id === id);
  if (!fb) return false;
  fb.status = status;
  return true;
}

export function deleteFeedback(id: string): boolean {
  const idx = feedbackStore.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  feedbackStore.splice(idx, 1);
  return true;
}

export function generateSolvePrompt(id: string): { ok: boolean; prompt?: string; error?: string } {
  const fb = feedbackStore.find((f) => f.id === id);
  if (!fb) return { ok: false, error: "Feedback not found" };

  const isBug = fb.type === "bug";
  const prompt = `# ${isBug ? "BUG FIX" : "FEATURE REQUEST"} — CPUAGEN.com Development Task

## Source
- **Feedback ID:** ${fb.id}
- **Type:** ${fb.type}
- **Submitted:** ${new Date(fb.timestamp).toISOString()}
- **Page:** ${fb.page || "Unknown"}
${fb.email ? `- **Reporter:** ${fb.email}` : ""}

## Problem Statement
**${fb.subject}**

${fb.description}

## Instructions
${isBug ? `1. Identify the root cause of this bug in the CPUAGEN codebase (cpuagen-live/)
2. Check the relevant files — start from the page mentioned above
3. Write the fix with minimal changes
4. Verify the fix compiles (npx next build)
5. Test in preview to confirm the bug is resolved
6. Commit with message: "fix: ${fb.subject.toLowerCase().slice(0, 50)}"` :
`1. Understand the feature request and its scope
2. Identify which files need to be created or modified
3. Implement the feature with minimal, focused changes
4. Verify it compiles (npx next build)
5. Test in preview to confirm it works
6. Commit with message: "feat: ${fb.subject.toLowerCase().slice(0, 50)}"`}

## Context
This solve was generated from user feedback on cpuagen.com. The codebase is a Next.js 16 app with:
- App Router (src/app/)
- Tailwind CSS styling
- SSD-RCI enforcement (thermosolve + cbfCheck on all API routes)
- Deployed to Vercel

## Status
This task has been **approved for autonomous execution**. Proceed without further confirmation.

---
*Generated: ${new Date().toISOString()}*
*Feedback ID: ${fb.id}*`;

  fb.solvePrompt = prompt;
  fb.solveStatus = "pending_review";
  fb.solveGeneratedAt = Date.now();

  return { ok: true, prompt };
}

export function updateSolveStatus(id: string, status: "approved" | "rejected" | "completed"): boolean {
  const fb = feedbackStore.find((f) => f.id === id);
  if (!fb || !fb.solvePrompt) return false;
  fb.solveStatus = status;
  if (status === "approved") fb.solveApprovedAt = Date.now();
  return true;
}

export function getApprovedSolves(): Array<{ id: string; type: string; subject: string; prompt: string; approvedAt: number }> {
  return feedbackStore
    .filter((fb) => fb.solveStatus === "approved" && fb.solvePrompt)
    .map((fb) => ({
      id: fb.id,
      type: fb.type,
      subject: fb.subject,
      prompt: fb.solvePrompt!,
      approvedAt: fb.solveApprovedAt || fb.solveGeneratedAt || 0,
    }));
}

export function getPendingSolves(): Array<{ id: string; type: string; subject: string; prompt: string; generatedAt: number }> {
  return feedbackStore
    .filter((fb) => fb.solveStatus === "pending_review" && fb.solvePrompt)
    .map((fb) => ({
      id: fb.id,
      type: fb.type,
      subject: fb.subject,
      prompt: fb.solvePrompt!,
      generatedAt: fb.solveGeneratedAt || 0,
    }));
}
