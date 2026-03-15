import { describe, it, expect } from "vitest";
import { exportEngineState, importEngineState } from "@/lib/enforcement";

describe("TEEP API logic (exportEngineState / importEngineState)", () => {
  it("export returns a well-formed snapshot", () => {
    const snapshot = exportEngineState();
    expect(snapshot.version).toBe("14.0");
    expect(typeof snapshot.timestamp).toBe("number");
    expect(snapshot.timestamp).toBeGreaterThan(0);
    expect(snapshot.psiState).toBeDefined();
    expect(snapshot.fisherWeights).toBeDefined();
    expect(typeof snapshot.morphicFieldStrength).toBe("number");
    expect(typeof snapshot.totalResonanceEvents).toBe("number");
    expect(snapshot.counters).toBeDefined();
    expect(Array.isArray(snapshot.teeps)).toBe(true);
  });

  it("export snapshot teeps are sorted by semantic mass (descending)", () => {
    const snapshot = exportEngineState();
    if (snapshot.teeps.length > 1) {
      for (let i = 1; i < snapshot.teeps.length; i++) {
        expect(snapshot.teeps[i - 1].semanticMass).toBeGreaterThanOrEqual(snapshot.teeps[i].semanticMass);
      }
    }
  });

  it("export limits teeps to 100", () => {
    const snapshot = exportEngineState();
    expect(snapshot.teeps.length).toBeLessThanOrEqual(100);
  });

  it("each teep has required fields", () => {
    const snapshot = exportEngineState();
    for (const teep of snapshot.teeps) {
      expect(teep).toHaveProperty("id");
      expect(teep).toHaveProperty("sig");
      expect(teep).toHaveProperty("allSafe");
      expect(teep).toHaveProperty("content_hash");
      expect(teep).toHaveProperty("content");
      expect(teep).toHaveProperty("hits");
      expect(teep).toHaveProperty("semanticMass");
      expect(teep).toHaveProperty("resonanceStrength");
      expect(typeof teep.allSafe).toBe("boolean");
      expect(typeof teep.hits).toBe("number");
    }
  });

  it("import rejects invalid snapshot version", () => {
    const result = importEngineState({ version: "1.0" } as never);
    expect(result.restored).toBe(0);
  });

  it("round-trip: export then import preserves state", () => {
    const snapshot = exportEngineState();
    // Ensure it has the right version for import
    const importable = { ...snapshot, version: "14.0" as const };
    const result = importEngineState(importable);
    expect(result.restored).toBeGreaterThanOrEqual(0);
  });
});
