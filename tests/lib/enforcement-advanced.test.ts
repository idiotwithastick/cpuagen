import { describe, it, expect } from "vitest";
import {
  thermosolve,
  findNearestTeeps,
  cannonCondition,
  getQuantumFisherCoherence,
  ensembleThermosolve,
  shouldPersist,
  getRicciDashboard,
  getHolographicProjection,
  getManifoldCoverage,
  holographicDecode,
  holographicEncode,
  getRecentTeeps,
  detectMachDiamonds,
  traceTeepChain,
} from "@/lib/enforcement";

describe("findNearestTeeps", () => {
  it("returns an array (possibly empty for fresh ledger)", () => {
    const sig = thermosolve("Test content for nearest TEEP search");
    const result = findNearestTeeps(sig, 5);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

describe("cannonCondition", () => {
  it("returns a conditioned signature with core fields", () => {
    const sig = thermosolve("Input text for cannon conditioning");
    const conditioned = cannonCondition(sig);
    expect(conditioned).toHaveProperty("S");
    expect(conditioned).toHaveProperty("energy");
    expect(typeof conditioned.S).toBe("number");
  });
});

describe("getQuantumFisherCoherence", () => {
  it("returns matrix, offDiagonalStrength, and topCorrelations", () => {
    const result = getQuantumFisherCoherence();
    expect(result).toHaveProperty("matrix");
    expect(result).toHaveProperty("offDiagonalStrength");
    expect(result).toHaveProperty("topCorrelations");
    expect(Array.isArray(result.matrix)).toBe(true);
    expect(typeof result.offDiagonalStrength).toBe("number");
    expect(Array.isArray(result.topCorrelations)).toBe(true);
  });
});

describe("ensembleThermosolve", () => {
  it("computes consensus from multiple provider responses", () => {
    const inputs = [
      { provider: "anthropic", content: "First provider response about testing" },
      { provider: "openai", content: "Second provider response about testing" },
      { provider: "google", content: "Third provider response about testing" },
    ];
    const result = ensembleThermosolve(inputs);
    expect(result).toHaveProperty("consensus");
    expect(result).toHaveProperty("outliers");
    expect(result).toHaveProperty("agreement");
    expect(result.consensus).toHaveProperty("S");
    expect(typeof result.agreement).toBe("number");
  });

  it("handles single provider response", () => {
    const result = ensembleThermosolve([
      { provider: "anthropic", content: "Single provider response" },
    ]);
    expect(result.consensus).toHaveProperty("S");
    expect(result.agreement).toBe(1);
    expect(result.outliers).toEqual([]);
  });

  it("handles empty input", () => {
    const result = ensembleThermosolve([]);
    expect(result.agreement).toBe(0);
  });
});

describe("shouldPersist", () => {
  it("returns a boolean", () => {
    const result = shouldPersist();
    expect(typeof result).toBe("boolean");
  });
});

describe("getRicciDashboard", () => {
  it("returns cells array and curvature metrics", () => {
    const result = getRicciDashboard();
    expect(result).toHaveProperty("cells");
    expect(result).toHaveProperty("totalCells");
    expect(result).toHaveProperty("maxCurvature");
    expect(result).toHaveProperty("avgCurvature");
    expect(Array.isArray(result.cells)).toBe(true);
    expect(typeof result.totalCells).toBe("number");
    expect(typeof result.maxCurvature).toBe("number");
  });
});

describe("getHolographicProjection", () => {
  it("returns projection with points array", () => {
    const result = getHolographicProjection(10);
    expect(result).toHaveProperty("points");
    expect(Array.isArray(result.points)).toBe(true);
    expect(result.points.length).toBeLessThanOrEqual(10);
  });
});

describe("getManifoldCoverage", () => {
  it("returns coverage metrics with correct field names", () => {
    const result = getManifoldCoverage();
    expect(result).toHaveProperty("visitedCells");
    expect(result).toHaveProperty("totalPossibleCells");
    expect(result).toHaveProperty("coverageRatio");
    expect(result).toHaveProperty("trajectoryLength");
    expect(result).toHaveProperty("suggestedExploration");
    expect(typeof result.visitedCells).toBe("number");
    expect(typeof result.coverageRatio).toBe("number");
    expect(Array.isArray(result.suggestedExploration)).toBe(true);
  });
});

describe("holographicEncode/Decode round-trip", () => {
  it("encode produces boundary array and reconstruction error", () => {
    const sig = thermosolve("Test signal for holographic encoding");
    const encoded = holographicEncode(sig);
    expect(encoded).toHaveProperty("boundary");
    expect(encoded).toHaveProperty("reconstructionError");
    expect(encoded.boundary).toHaveLength(5);
  });

  it("decode reconstructs a signature from boundary", () => {
    const sig = thermosolve("Test signal for holographic round-trip");
    const encoded = holographicEncode(sig);
    const decoded = holographicDecode(encoded.boundary);
    expect(decoded).toHaveProperty("S");
    expect(decoded).toHaveProperty("phi");
    expect(typeof decoded.S).toBe("number");
  });
});

describe("getRecentTeeps", () => {
  it("returns an array bounded by limit", () => {
    const result = getRecentTeeps(5);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

describe("detectMachDiamonds", () => {
  it("returns empty for less than 2 queries", () => {
    expect(detectMachDiamonds([])).toEqual([]);
    expect(detectMachDiamonds([{ content: "single" }])).toEqual([]);
  });

  it("returns array for 2+ queries", () => {
    const result = detectMachDiamonds([
      { content: "First query about thermodynamics" },
      { content: "Second query about thermodynamics" },
    ]);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("traceTeepChain", () => {
  it("returns an array for any TEEP ID", () => {
    const result = traceTeepChain("TEEP-00000001");
    expect(Array.isArray(result)).toBe(true);
  });

  it("respects maxDepth parameter", () => {
    const result = traceTeepChain("TEEP-00000001", "both", 3);
    for (const entry of result) {
      expect(entry.depth).toBeLessThanOrEqual(3);
    }
  });
});
