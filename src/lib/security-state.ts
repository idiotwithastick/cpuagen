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
const ADMIN_FAIL_LIMIT = 3;

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
