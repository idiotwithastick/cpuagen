import { describe, it, expect } from "vitest";
import { defaultProviderSlots } from "@/lib/agent-orchestrator";
import type { ProviderSlot, TaskType } from "@/lib/agent-orchestrator";

describe("defaultProviderSlots", () => {
  it("returns empty array when no keys provided", () => {
    const slots = defaultProviderSlots({});
    expect(slots).toHaveLength(0);
  });

  it("creates anthropic slot when key provided", () => {
    const slots = defaultProviderSlots({ anthropic: "sk-test" });
    expect(slots).toHaveLength(1);
    expect(slots[0].provider).toBe("anthropic");
    expect(slots[0].apiKey).toBe("sk-test");
    expect(slots[0].enabled).toBe(true);
    expect(slots[0].priority).toBe(1);
  });

  it("creates openai slot with priority 2", () => {
    const slots = defaultProviderSlots({ openai: "sk-openai" });
    expect(slots).toHaveLength(1);
    expect(slots[0].provider).toBe("openai");
    expect(slots[0].priority).toBe(2);
  });

  it("creates google slot with priority 3", () => {
    const slots = defaultProviderSlots({ google: "goog-key" });
    expect(slots).toHaveLength(1);
    expect(slots[0].provider).toBe("google");
    expect(slots[0].priority).toBe(3);
  });

  it("creates xai slot with priority 4", () => {
    const slots = defaultProviderSlots({ xai: "xai-key" });
    expect(slots).toHaveLength(1);
    expect(slots[0].provider).toBe("xai");
    expect(slots[0].priority).toBe(4);
  });

  it("creates all 4 slots when all keys provided", () => {
    const slots = defaultProviderSlots({
      anthropic: "a",
      openai: "b",
      google: "c",
      xai: "d",
    });
    expect(slots).toHaveLength(4);
    const providers = slots.map((s) => s.provider);
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toContain("google");
    expect(providers).toContain("xai");
  });

  it("each slot has strengths array with valid TaskTypes", () => {
    const slots = defaultProviderSlots({
      anthropic: "a",
      openai: "b",
      google: "c",
      xai: "d",
    });
    const validTypes: TaskType[] = ["REASONING", "CODING", "RESEARCH", "CREATIVE", "MATH", "GENERAL"];
    for (const slot of slots) {
      expect(slot.strengths.length).toBeGreaterThan(0);
      for (const s of slot.strengths) {
        expect(validTypes).toContain(s);
      }
    }
  });

  it("anthropic has REASONING strength", () => {
    const slots = defaultProviderSlots({ anthropic: "a" });
    expect(slots[0].strengths).toContain("REASONING");
  });

  it("openai has CODING strength", () => {
    const slots = defaultProviderSlots({ openai: "a" });
    expect(slots[0].strengths).toContain("CODING");
  });

  it("google has RESEARCH strength", () => {
    const slots = defaultProviderSlots({ google: "a" });
    expect(slots[0].strengths).toContain("RESEARCH");
  });

  it("xai has CREATIVE strength", () => {
    const slots = defaultProviderSlots({ xai: "a" });
    expect(slots[0].strengths).toContain("CREATIVE");
  });

  it("slots are sorted by priority (ascending)", () => {
    const slots = defaultProviderSlots({
      xai: "d",
      anthropic: "a",
      google: "c",
      openai: "b",
    });
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].priority).toBeGreaterThan(slots[i - 1].priority);
    }
  });
});
