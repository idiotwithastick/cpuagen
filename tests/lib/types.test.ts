import { describe, it, expect } from "vitest";
import { migrateSettings, DEFAULT_SETTINGS, PROVIDERS, FILE_LIMITS } from "@/lib/types";

describe("migrateSettings", () => {
  it("returns settings unchanged if already in new format", () => {
    const settings = {
      activeProvider: "anthropic",
      activeModel: "claude-3-opus",
      systemPrompt: "You are helpful",
      apiKeys: { anthropic: "sk-test" },
    };
    const result = migrateSettings(settings);
    expect(result.activeProvider).toBe("anthropic");
    expect(result.activeModel).toBe("claude-3-opus");
    expect(result.apiKeys.anthropic).toBe("sk-test");
  });

  it("migrates old format with provider/apiKey/model fields", () => {
    const oldSettings = {
      provider: "openai",
      apiKey: "sk-old-key",
      model: "gpt-4",
      systemPrompt: "Be concise",
    };
    const result = migrateSettings(oldSettings);
    expect(result.activeProvider).toBe("openai");
    expect(result.activeModel).toBe("gpt-4");
    expect(result.systemPrompt).toBe("Be concise");
    expect(result.apiKeys.openai).toBe("sk-old-key");
  });

  it("handles demo provider migration without API key", () => {
    const oldSettings = {
      provider: "demo",
      apiKey: "",
      model: "gemini-2.0-flash",
    };
    const result = migrateSettings(oldSettings);
    expect(result.activeProvider).toBe("demo");
    expect(result.apiKeys).toEqual({});
  });

  it("handles empty/missing fields gracefully", () => {
    const result = migrateSettings({});
    expect(result.activeProvider).toBe("demo");
    expect(result.activeModel).toBe("");
    expect(result.systemPrompt).toBe("");
    expect(result.apiKeys).toEqual({});
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("has demo as default provider", () => {
    expect(DEFAULT_SETTINGS.activeProvider).toBe("demo");
  });

  it("has a default model set", () => {
    expect(DEFAULT_SETTINGS.activeModel).toBeTruthy();
  });

  it("has empty apiKeys", () => {
    expect(DEFAULT_SETTINGS.apiKeys).toEqual({});
  });
});

describe("PROVIDERS", () => {
  it("has at least 5 providers configured", () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(5);
  });

  it("each provider has required fields", () => {
    for (const p of PROVIDERS) {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("name");
      expect(p).toHaveProperty("models");
      expect(p).toHaveProperty("defaultModel");
      expect(p.models.length).toBeGreaterThan(0);
    }
  });

  it("has a demo provider with noKeyRequired", () => {
    const demo = PROVIDERS.find((p) => p.id === "demo");
    expect(demo).toBeDefined();
    expect(demo?.noKeyRequired).toBe(true);
  });

  it("includes major providers: anthropic, openai, google", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("google");
  });
});

describe("FILE_LIMITS", () => {
  it("has a max file size of 20MB", () => {
    expect(FILE_LIMITS.maxFileSize).toBe(20 * 1024 * 1024);
  });

  it("allows common image types", () => {
    expect(FILE_LIMITS.allowedMimeTypes).toContain("image/png");
    expect(FILE_LIMITS.allowedMimeTypes).toContain("image/jpeg");
  });

  it("allows PDF", () => {
    expect(FILE_LIMITS.allowedMimeTypes).toContain("application/pdf");
  });

  it("code extension regex matches common files", () => {
    expect(FILE_LIMITS.codeExtensions.test("main.py")).toBe(true);
    expect(FILE_LIMITS.codeExtensions.test("index.ts")).toBe(true);
    expect(FILE_LIMITS.codeExtensions.test("app.tsx")).toBe(true);
    expect(FILE_LIMITS.codeExtensions.test("style.css")).toBe(false); // CSS not in code extensions
    expect(FILE_LIMITS.codeExtensions.test("photo.png")).toBe(false);
  });
});
