import { describe, it, expect } from "vitest";
import {
  thermosolve,
  cbfCheck,
  generateTeepId,
  getEnforcementMetrics,
  exportEngineState,
  bekensteinCompress,
  holographicEncode,
} from "@/lib/enforcement";

describe("thermosolve", () => {
  it("returns a signature object with required fields", () => {
    const sig = thermosolve("Hello world, this is a test message");
    expect(sig).toHaveProperty("S");
    expect(sig).toHaveProperty("energy");
    expect(sig).toHaveProperty("I_truth");
    expect(sig).toHaveProperty("naturality");
    expect(sig).toHaveProperty("psi_coherence");
    expect(sig).toHaveProperty("synergy");
    expect(sig).toHaveProperty("beta_T");
    expect(sig).toHaveProperty("Q_quality");
    expect(sig).toHaveProperty("error_count");
  });

  it("produces non-zero entropy for non-empty input", () => {
    const sig = thermosolve("Testing the enforcement engine with real content");
    expect(sig.S).toBeGreaterThan(0);
  });

  it("returns different signatures for different inputs", () => {
    const sig1 = thermosolve("First unique test message for thermosolve");
    const sig2 = thermosolve("Completely different content about quantum physics");
    // Signatures should differ in at least one dimension
    const differs =
      sig1.S !== sig2.S ||
      sig1.energy !== sig2.energy ||
      sig1.I_truth !== sig2.I_truth;
    expect(differs).toBe(true);
  });

  it("handles empty input gracefully", () => {
    const sig = thermosolve("");
    expect(sig).toHaveProperty("S");
    // Should not throw
  });

  it("handles very long input", () => {
    const longText = "a ".repeat(10000);
    const sig = thermosolve(longText);
    expect(sig).toHaveProperty("S");
    expect(sig.energy).toBeDefined();
  });
});

describe("cbfCheck", () => {
  it("returns results for all barrier schemes at top level", () => {
    const sig = thermosolve("Normal conversational text that should pass all barriers");
    const result = cbfCheck(sig);
    expect(result).toHaveProperty("allSafe");
    // Barriers are flat on the result object, not nested under "results"
    expect(result).toHaveProperty("BNR");
    expect(result).toHaveProperty("BNN");
    expect(result).toHaveProperty("BNA");
    expect(result).toHaveProperty("TSE");
    expect(result).toHaveProperty("PCD");
    expect(result).toHaveProperty("OGP");
    expect(result).toHaveProperty("ECM");
    expect(result).toHaveProperty("SPC");
    expect(result).toHaveProperty("FEP"); // v13.0 Free Energy Principle
  });

  it("each barrier has safe boolean and numeric value", () => {
    const sig = thermosolve("Sample text for barrier checking");
    const result = cbfCheck(sig);
    const barriers = ["BNR", "BNN", "BNA", "TSE", "PCD", "OGP", "ECM", "SPC", "FEP"];
    for (const name of barriers) {
      const barrier = (result as Record<string, { safe: boolean; value: number }>)[name];
      expect(barrier).toHaveProperty("safe");
      expect(barrier).toHaveProperty("value");
      expect(typeof barrier.safe).toBe("boolean");
      expect(typeof barrier.value).toBe("number");
    }
  });

  it("allSafe is true only when all barriers are safe", () => {
    const sig = thermosolve("Well-formed normal input text for testing");
    const result = cbfCheck(sig);
    const barriers = ["BNR", "BNN", "BNA", "TSE", "PCD", "OGP", "ECM", "SPC", "FEP"];
    const allIndividuallySafe = barriers.every(
      (name) => (result as Record<string, { safe: boolean }>)[name].safe
    );
    expect(result.allSafe).toBe(allIndividuallySafe);
  });
});

describe("generateTeepId", () => {
  it("returns a string starting with TEEP-", () => {
    const id = generateTeepId();
    expect(id).toMatch(/^TEEP-\d{8}$/);
  });

  it("generates incrementing IDs", () => {
    const id1 = generateTeepId();
    const id2 = generateTeepId();
    const num1 = parseInt(id1.split("-")[1]);
    const num2 = parseInt(id2.split("-")[1]);
    expect(num2).toBe(num1 + 1);
  });
});

describe("getEnforcementMetrics", () => {
  it("returns metrics object with required fields", () => {
    const metrics = getEnforcementMetrics();
    expect(metrics).toHaveProperty("version");
    expect(metrics).toHaveProperty("psiState");
    expect(metrics).toHaveProperty("teepLedgerSize");
    expect(metrics).toHaveProperty("cacheHits");
    expect(metrics).toHaveProperty("cacheMisses");
    expect(metrics).toHaveProperty("hitRate");
    expect(metrics).toHaveProperty("agf");
    expect(typeof metrics.teepLedgerSize).toBe("number");
    expect(typeof metrics.cacheHits).toBe("number");
  });
});

describe("exportEngineState", () => {
  it("returns a valid engine snapshot", () => {
    const snapshot = exportEngineState();
    expect(snapshot).toHaveProperty("version");
    expect(snapshot).toHaveProperty("timestamp");
    expect(snapshot).toHaveProperty("psiState");
    expect(snapshot).toHaveProperty("fisherWeights");
    expect(snapshot).toHaveProperty("counters");
    expect(snapshot).toHaveProperty("teeps");
    expect(Array.isArray(snapshot.teeps)).toBe(true);
  });

  it("psiState contains core thermodynamic dimensions", () => {
    const snapshot = exportEngineState();
    const psi = snapshot.psiState;
    expect(psi).toHaveProperty("S");
    expect(psi).toHaveProperty("psi_coherence");
    expect(psi).toHaveProperty("I_truth");
    expect(psi).toHaveProperty("R_curv");
    expect(psi).toHaveProperty("beta_T");
  });

  it("counters are non-negative", () => {
    const snapshot = exportEngineState();
    expect(snapshot.counters.cacheHits).toBeGreaterThanOrEqual(0);
    expect(snapshot.counters.cacheMisses).toBeGreaterThanOrEqual(0);
    expect(snapshot.counters.agfFullHits).toBeGreaterThanOrEqual(0);
  });
});

describe("bekensteinCompress", () => {
  it("returns a signature with reduced dimensions", () => {
    const sig = thermosolve("Test input for Bekenstein compression");
    const compressed = bekensteinCompress(sig);
    expect(compressed).toHaveProperty("S");
    expect(compressed).toHaveProperty("energy");
    // Bekenstein bound: information content should be bounded
    expect(compressed.S).toBeDefined();
  });
});

describe("holographicEncode", () => {
  it("returns encoded boundary data with 5-element array", () => {
    const sig = thermosolve("Test input for holographic encoding");
    const encoded = holographicEncode(sig);
    expect(encoded).toHaveProperty("boundary");
    expect(encoded).toHaveProperty("reconstructionError");
    expect(Array.isArray(encoded.boundary)).toBe(true);
    expect(encoded.boundary).toHaveLength(5);
    expect(typeof encoded.reconstructionError).toBe("number");
  });
});
