import { describe, it, expect, beforeEach } from "vitest";

// Security state uses module-level singletons, so we need fresh imports per test group.
// We import dynamically to reset state between describe blocks.

describe("Security State — Lockout System", () => {
  let mod: typeof import("@/lib/security-state");

  beforeEach(async () => {
    // Re-import to get fresh module state
    // vitest caches modules, so we use the same instance — tests must account for cumulative state
    mod = await import("@/lib/security-state");
  });

  it("isSiteLocked returns false initially (or from prior state)", () => {
    // On first run this is false; if prior tests ran it may be true
    expect(typeof mod.isSiteLocked()).toBe("boolean");
  });

  it("isAdminLocked returns boolean", () => {
    expect(typeof mod.isAdminLocked()).toBe("boolean");
  });

  it("recordSiteAuthFail increments attempts", () => {
    const r1 = mod.recordSiteAuthFail("10.0.0.99");
    const r2 = mod.recordSiteAuthFail("10.0.0.99");
    expect(r2.attempts).toBe(r1.attempts + 1);
  });

  it("recordSiteAuthSuccess clears IP failures", () => {
    mod.recordSiteAuthFail("10.0.0.50");
    mod.recordSiteAuthSuccess("10.0.0.50");
    // After clearing, next fail should start at 1
    const r = mod.recordSiteAuthFail("10.0.0.50");
    expect(r.attempts).toBe(1);
  });

  it("recordAdminAuthFail increments and returns attempts", () => {
    const r1 = mod.recordAdminAuthFail("10.0.0.70");
    const r2 = mod.recordAdminAuthFail("10.0.0.70");
    expect(r2.attempts).toBe(r1.attempts + 1);
  });

  it("recordAdminLogin clears IP admin failures", () => {
    mod.recordAdminAuthFail("10.0.0.80");
    mod.recordAdminLogin("10.0.0.80");
    // Next fail restarts at 1
    const r = mod.recordAdminAuthFail("10.0.0.80");
    expect(r.attempts).toBe(1);
  });

  it("getLockoutData returns well-formed object", () => {
    const data = mod.getLockoutData();
    expect(typeof data.siteLocked).toBe("boolean");
    expect(typeof data.adminLocked).toBe("boolean");
    expect(typeof data.totalSiteFailures).toBe("number");
    expect(typeof data.totalAdminFailures).toBe("number");
    expect(Array.isArray(data.recentEvents)).toBe(true);
    expect(data.recentEvents.length).toBeLessThanOrEqual(50);
    expect(typeof data.siteFailsByIp).toBe("object");
    expect(typeof data.adminFailsByIp).toBe("object");
  });

  it("getSecurityEvents returns an array", () => {
    const events = mod.getSecurityEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  it("unlockSite resets site lockout state", () => {
    mod.unlockSite();
    expect(mod.isSiteLocked()).toBe(false);
    const data = mod.getLockoutData();
    expect(data.totalSiteFailures).toBe(0);
  });

  it("unlockAdmin resets admin lockout state", () => {
    mod.unlockAdmin();
    expect(mod.isAdminLocked()).toBe(false);
    const data = mod.getLockoutData();
    expect(data.totalAdminFailures).toBe(0);
  });
});

describe("Security State — Enforcement Stats", () => {
  let mod: typeof import("@/lib/security-state");

  beforeEach(async () => {
    mod = await import("@/lib/security-state");
  });

  it("recordEnforcementRequest (passed) increments totalPassed", () => {
    const before = mod.getEnforcementStats();
    mod.recordEnforcementRequest(true, undefined, "10.0.0.1", "test");
    const after = mod.getEnforcementStats();
    expect(after.totalPassed).toBe(before.totalPassed + 1);
    expect(after.totalRequests).toBe(before.totalRequests + 1);
  });

  it("recordEnforcementRequest (blocked) increments totalBlocked and barrier counts", () => {
    const before = mod.getEnforcementStats();
    mod.recordEnforcementRequest(false, ["BNR", "TSE"], "10.0.0.2", "test");
    const after = mod.getEnforcementStats();
    expect(after.totalBlocked).toBe(before.totalBlocked + 1);
    expect(after.barrierFailCounts["BNR"]).toBeGreaterThanOrEqual(1);
    expect(after.barrierFailCounts["TSE"]).toBeGreaterThanOrEqual(1);
  });

  it("recordTeepCached increments teepsCached", () => {
    const before = mod.getEnforcementStats();
    mod.recordTeepCached("TEEP-001", "10.0.0.1");
    const after = mod.getEnforcementStats();
    expect(after.teepsCached).toBe(before.teepsCached + 1);
  });

  it("getEnforcementStats returns a snapshot (not a reference)", () => {
    const s1 = mod.getEnforcementStats();
    mod.recordEnforcementRequest(true);
    const s2 = mod.getEnforcementStats();
    // s1 should not have been mutated
    expect(s2.totalRequests).toBe(s1.totalRequests + 1);
  });
});

describe("Security State — Early Access Ledger", () => {
  let mod: typeof import("@/lib/security-state");

  beforeEach(async () => {
    mod = await import("@/lib/security-state");
  });

  it("earlyAccessSignup creates a new entry", () => {
    const email = `test-${Date.now()}@example.com`;
    const result = mod.earlyAccessSignup(email, "127.0.0.1");
    expect(result.ok).toBe(true);
    expect(result.alreadyExists).toBe(false);
  });

  it("earlyAccessSignup returns alreadyExists for duplicate", () => {
    const email = `dup-${Date.now()}@example.com`;
    mod.earlyAccessSignup(email, "127.0.0.1");
    const result = mod.earlyAccessSignup(email, "127.0.0.1");
    expect(result.ok).toBe(true);
    expect(result.alreadyExists).toBe(true);
  });

  it("earlyAccessSignup normalizes email (case-insensitive)", () => {
    const base = `case-${Date.now()}@example.com`;
    mod.earlyAccessSignup(base.toUpperCase(), "127.0.0.1");
    const r = mod.earlyAccessSignup(base.toLowerCase(), "127.0.0.1");
    expect(r.alreadyExists).toBe(true);
  });

  it("validatePasscode rejects unknown email", () => {
    const result = mod.validatePasscode("nonexistent@example.com", "ABCDEF");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not found");
  });

  it("validatePasscode rejects wrong code", () => {
    const email = `wrong-${Date.now()}@example.com`;
    mod.earlyAccessSignup(email, "127.0.0.1");
    const result = mod.validatePasscode(email, "ZZZZZZ");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Invalid");
  });

  it("validatePasscode accepts correct code and grants access", () => {
    const email = `valid-${Date.now()}@example.com`;
    mod.earlyAccessSignup(email, "127.0.0.1");
    // Get the passcode from the ledger
    const ledger = mod.getEarlyAccessLedger();
    const entry = ledger.find((e) => e.email === email.toLowerCase());
    expect(entry).toBeDefined();
    const result = mod.validatePasscode(email, entry!.passcode);
    expect(result.valid).toBe(true);
    expect(mod.isEmailGranted(email)).toBe(true);
  });

  it("isEmailGranted returns false for non-granted emails", () => {
    expect(mod.isEmailGranted("nobody@example.com")).toBe(false);
  });

  it("getEarlyAccessLedger returns sorted by timestamp descending", () => {
    const ledger = mod.getEarlyAccessLedger();
    for (let i = 1; i < ledger.length; i++) {
      expect(ledger[i - 1].timestamp).toBeGreaterThanOrEqual(ledger[i].timestamp);
    }
  });

  it("markPasscodeSent updates the entry", () => {
    const email = `sent-${Date.now()}@example.com`;
    mod.earlyAccessSignup(email, "127.0.0.1");
    const result = mod.markPasscodeSent(email);
    expect(result).toBe(true);
    const entry = mod.getEarlyAccessLedger().find((e) => e.email === email.toLowerCase());
    expect(entry?.passcodeSentAt).toBeDefined();
  });

  it("markPasscodeSent returns false for unknown email", () => {
    expect(mod.markPasscodeSent("nope@example.com")).toBe(false);
  });

  it("grantAccess and revokeAccess toggle accessGranted", () => {
    const email = `toggle-${Date.now()}@example.com`;
    mod.earlyAccessSignup(email, "127.0.0.1");
    mod.grantAccess(email);
    expect(mod.isEmailGranted(email)).toBe(true);
    mod.revokeAccess(email);
    expect(mod.isEmailGranted(email)).toBe(false);
  });

  it("grantAccess returns false for unknown email", () => {
    expect(mod.grantAccess("nope@example.com")).toBe(false);
  });

  it("revokeAccess returns false for unknown email", () => {
    expect(mod.revokeAccess("nope@example.com")).toBe(false);
  });

  it("getEarlyAccessStats returns well-formed stats", () => {
    const stats = mod.getEarlyAccessStats();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.granted).toBe("number");
    expect(typeof stats.pending).toBe("number");
    expect(typeof stats.redeemed).toBe("number");
    expect(stats.total).toBeGreaterThanOrEqual(0);
  });
});

describe("Security State — Feedback System", () => {
  let mod: typeof import("@/lib/security-state");

  beforeEach(async () => {
    mod = await import("@/lib/security-state");
  });

  it("saveFeedback creates a new entry with id/timestamp/status", () => {
    const fb = mod.saveFeedback({
      type: "bug",
      subject: "Test bug",
      description: "Something broke",
      email: "tester@example.com",
      page: "/app/chat",
      ip: "127.0.0.1",
    });
    expect(fb.id).toMatch(/^fb-/);
    expect(fb.timestamp).toBeGreaterThan(0);
    expect(fb.status).toBe("new");
    expect(fb.type).toBe("bug");
  });

  it("saveFeedback handles suggestion type", () => {
    const fb = mod.saveFeedback({
      type: "suggestion",
      subject: "Idea",
      description: "Would be nice if...",
      ip: "127.0.0.1",
    });
    expect(fb.type).toBe("suggestion");
  });

  it("getFeedbackList returns an array", () => {
    const list = mod.getFeedbackList();
    expect(Array.isArray(list)).toBe(true);
  });

  it("getFeedbackStats returns well-formed stats", () => {
    const stats = mod.getFeedbackStats();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.bugs).toBe("number");
    expect(typeof stats.suggestions).toBe("number");
    expect(typeof stats.new).toBe("number");
    expect(typeof stats.reviewed).toBe("number");
    expect(typeof stats.resolved).toBe("number");
  });

  it("updateFeedbackStatus changes status", () => {
    const fb = mod.saveFeedback({
      type: "bug",
      subject: "Status test",
      description: "desc",
      ip: "127.0.0.1",
    });
    const result = mod.updateFeedbackStatus(fb.id, "reviewed");
    expect(result).toBe(true);
    const updated = mod.getFeedbackList().find((f) => f.id === fb.id);
    expect(updated?.status).toBe("reviewed");
  });

  it("updateFeedbackStatus returns false for unknown id", () => {
    expect(mod.updateFeedbackStatus("fb-nonexistent", "resolved")).toBe(false);
  });

  it("deleteFeedback removes the entry", () => {
    const fb = mod.saveFeedback({
      type: "suggestion",
      subject: "Delete test",
      description: "desc",
      ip: "127.0.0.1",
    });
    const deleted = mod.deleteFeedback(fb.id);
    expect(deleted).toBe(true);
    expect(mod.getFeedbackList().find((f) => f.id === fb.id)).toBeUndefined();
  });

  it("deleteFeedback returns false for unknown id", () => {
    expect(mod.deleteFeedback("fb-nonexistent")).toBe(false);
  });
});
