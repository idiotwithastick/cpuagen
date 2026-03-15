import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAdminToken, isAdminSession, withAdminToken } from "@/lib/admin";

// Mock sessionStorage
const mockStorage = new Map<string, string>();
const mockSessionStorage = {
  getItem: vi.fn((key: string) => mockStorage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => mockStorage.set(key, value)),
  removeItem: vi.fn((key: string) => mockStorage.delete(key)),
  clear: vi.fn(() => mockStorage.clear()),
  get length() { return mockStorage.size; },
  key: vi.fn(() => null),
};

Object.defineProperty(globalThis, "sessionStorage", {
  value: mockSessionStorage,
  writable: true,
});

describe("admin utilities", () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  describe("getAdminToken", () => {
    it("returns null when no token in sessionStorage", () => {
      expect(getAdminToken()).toBeNull();
    });

    it("returns null for non-admin token", () => {
      const token = btoa("otheruser:12345:127.0.0.1");
      mockStorage.set("cpuagen-admin-token", token);
      expect(getAdminToken()).toBeNull();
    });

    it("returns the token for valid admin user", () => {
      const token = btoa("wforeman:12345:127.0.0.1");
      mockStorage.set("cpuagen-admin-token", token);
      expect(getAdminToken()).toBe(token);
    });

    it("returns null for invalid base64", () => {
      mockStorage.set("cpuagen-admin-token", "not-valid-base64!!!");
      // atob may throw, function should catch
      expect(getAdminToken()).toBeNull();
    });
  });

  describe("isAdminSession", () => {
    it("returns false when not admin", () => {
      expect(isAdminSession()).toBe(false);
    });

    it("returns true when admin token is present", () => {
      const token = btoa("wforeman:12345:127.0.0.1");
      mockStorage.set("cpuagen-admin-token", token);
      expect(isAdminSession()).toBe(true);
    });
  });

  describe("withAdminToken", () => {
    it("returns body unchanged when not admin", () => {
      const body = { messages: [], provider: "demo" };
      const result = withAdminToken(body);
      expect(result).toEqual(body);
      expect(result).not.toHaveProperty("adminToken");
    });

    it("injects adminToken when admin session is active", () => {
      const token = btoa("wforeman:12345:127.0.0.1");
      mockStorage.set("cpuagen-admin-token", token);
      const body = { messages: [], provider: "demo" };
      const result = withAdminToken(body);
      expect(result).toHaveProperty("adminToken", token);
      expect(result.messages).toEqual([]);
      expect(result.provider).toBe("demo");
    });

    it("does not mutate the original body object", () => {
      const token = btoa("wforeman:12345:127.0.0.1");
      mockStorage.set("cpuagen-admin-token", token);
      const body = { messages: [], provider: "demo" };
      const result = withAdminToken(body);
      expect(body).not.toHaveProperty("adminToken");
      expect(result).toHaveProperty("adminToken");
    });
  });
});
