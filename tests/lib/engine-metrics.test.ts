import { describe, it, expect } from "vitest";
import {
  getEnforcementMetrics,
  getManifoldCoverage,
  getRicciDashboard,
  getQuantumFisherCoherence,
  getHolographicProjection,
  thermosolve,
  cbfCheck,
  recordTrajectoryPoint,
  shouldPersist,
} from "@/lib/enforcement";

describe("getEnforcementMetrics — Full Shape", () => {
  it("returns version 14.0", () => {
    const m = getEnforcementMetrics();
    expect(m.version).toBe("14.0");
  });

  it("returns psiState with required dimensions", () => {
    const m = getEnforcementMetrics();
    const psi = m.psiState;
    expect(typeof psi.cycle).toBe("number");
    expect(typeof psi.S).toBe("number");
    expect(typeof psi.psi_coherence).toBe("number");
    expect(typeof psi.I_truth).toBe("number");
    expect(typeof psi.beta_T).toBe("number");
  });

  it("returns agf metrics", () => {
    const m = getEnforcementMetrics();
    expect(typeof m.agf.fullHits).toBe("number");
    expect(typeof m.agf.basinHits).toBe("number");
    expect(typeof m.agf.jitSolves).toBe("number");
    expect(typeof m.agf.apiCallsAvoided).toBe("number");
    expect(typeof m.agf.totalLookups).toBe("number");
    expect(typeof m.agf.hitRate).toBe("number");
  });

  it("returns morphic field data", () => {
    const m = getEnforcementMetrics();
    expect(typeof m.morphic.fieldStrength).toBe("number");
    expect(typeof m.morphic.resonanceEvents).toBe("number");
    expect(typeof m.morphic.dynamicFisherWeights).toBe("object");
    expect(typeof m.morphic.basinThreshold).toBe("number");
    expect(typeof m.morphic.totalSemanticMass).toBe("number");
  });

  it("returns holographic grid metrics", () => {
    const m = getEnforcementMetrics();
    expect(typeof m.holographic.holoGridCells).toBe("number");
    expect(typeof m.holographic.holoLookupHits).toBe("number");
    expect(typeof m.holographic.boundaryTeeps).toBe("number");
  });

  it("returns innovations section", () => {
    const m = getEnforcementMetrics();
    expect(typeof m.innovations.bifurcationEvents).toBe("number");
    expect(typeof m.innovations.machDiamondCount).toBe("number");
    expect(typeof m.innovations.trajectoryLength).toBe("number");
    expect(m.innovations.fisherCoherence).toBeDefined();
    expect(m.innovations.manifoldCoverage).toBeDefined();
  });
});

describe("getManifoldCoverage — Shape", () => {
  it("returns required fields", () => {
    const c = getManifoldCoverage();
    expect(typeof c.visitedCells).toBe("number");
    expect(typeof c.totalPossibleCells).toBe("number");
    expect(typeof c.coverageRatio).toBe("number");
    expect(typeof c.trajectoryLength).toBe("number");
    expect(Array.isArray(c.suggestedExploration)).toBe(true);
  });

  it("coverage ratio is between 0 and 1", () => {
    const c = getManifoldCoverage();
    expect(c.coverageRatio).toBeGreaterThanOrEqual(0);
    expect(c.coverageRatio).toBeLessThanOrEqual(1);
  });

  it("suggested exploration has max 5 cells", () => {
    const c = getManifoldCoverage();
    expect(c.suggestedExploration.length).toBeLessThanOrEqual(5);
  });
});

describe("getRicciDashboard — Shape", () => {
  it("returns cells array and stats", () => {
    const r = getRicciDashboard();
    expect(Array.isArray(r.cells)).toBe(true);
    expect(typeof r.totalCells).toBe("number");
    expect(typeof r.maxCurvature).toBe("number");
    expect(typeof r.avgCurvature).toBe("number");
  });

  it("cells have required fields when present", () => {
    const r = getRicciDashboard();
    for (const cell of r.cells) {
      expect(typeof cell.key).toBe("string");
      expect(typeof cell.teepCount).toBe("number");
      expect(typeof cell.totalMass).toBe("number");
      expect(typeof cell.avgSynergy).toBe("number");
      expect(typeof cell.ricciCurvature).toBe("number");
    }
  });

  it("cells are limited to 50", () => {
    const r = getRicciDashboard();
    expect(r.cells.length).toBeLessThanOrEqual(50);
  });
});

describe("getQuantumFisherCoherence — Shape", () => {
  it("returns matrix, offDiagonalStrength, topCorrelations", () => {
    const f = getQuantumFisherCoherence();
    expect(Array.isArray(f.matrix)).toBe(true);
    expect(typeof f.offDiagonalStrength).toBe("number");
    expect(Array.isArray(f.topCorrelations)).toBe(true);
  });

  it("matrix is square", () => {
    const f = getQuantumFisherCoherence();
    const n = f.matrix.length;
    for (const row of f.matrix) {
      expect(row.length).toBe(n);
    }
  });

  it("top correlations have dims and value", () => {
    const f = getQuantumFisherCoherence();
    for (const c of f.topCorrelations) {
      expect(Array.isArray(c.dims)).toBe(true);
      expect(c.dims.length).toBe(2);
      expect(typeof c.value).toBe("number");
    }
  });
});

describe("getHolographicProjection — Shape", () => {
  it("returns points, axes, totalPoints", () => {
    const h = getHolographicProjection();
    expect(Array.isArray(h.points)).toBe(true);
    expect(Array.isArray(h.axes)).toBe(true);
    expect(typeof h.totalPoints).toBe("number");
  });

  it("axes has 5 dimensions", () => {
    const h = getHolographicProjection();
    expect(h.axes.length).toBe(5);
  });

  it("points have 5D coords and mass", () => {
    const h = getHolographicProjection();
    for (const p of h.points) {
      expect(p.coords.length).toBe(5);
      expect(typeof p.mass).toBe("number");
    }
  });
});

describe("cbfCheck — Per-Barrier Detail", () => {
  it("returns all 9 barriers including FEP", () => {
    const sig = thermosolve("Normal test input");
    const cbf = cbfCheck(sig);
    const barrierNames = ["BNR", "BNN", "BNA", "TSE", "PCD", "OGP", "ECM", "SPC", "FEP"];
    for (const name of barrierNames) {
      const b = (cbf as Record<string, { safe: boolean; value: number }>)[name];
      expect(b).toBeDefined();
      expect(typeof b.safe).toBe("boolean");
      expect(typeof b.value).toBe("number");
    }
  });

  it("allSafe reflects aggregate barrier status", () => {
    const sig = thermosolve("Well-formed text for safety check");
    const cbf = cbfCheck(sig);
    const barriers = ["BNR", "BNN", "BNA", "TSE", "PCD", "OGP", "ECM", "SPC", "FEP"];
    const individuallySafe = barriers.every(
      (n) => (cbf as Record<string, { safe: boolean }>)[n].safe
    );
    expect(cbf.allSafe).toBe(individuallySafe);
  });
});

describe("recordTrajectoryPoint + shouldPersist", () => {
  it("recordTrajectoryPoint does not throw", () => {
    const sig = thermosolve("trajectory test");
    expect(() => recordTrajectoryPoint("TEEP-TEST-001", sig)).not.toThrow();
  });

  it("shouldPersist returns a boolean", () => {
    expect(typeof shouldPersist()).toBe("boolean");
  });
});
