import { describe, it, expect } from "vitest";
import { GAME_SYSTEMS, RETAILER_NAMES } from "@/lib/warhammer-types";
import type { GameSystem, WHFaction, WHProduct, WHPrice, WHProductWithPrices, ArmyListItem, OptimizedPurchase, ArmyOptimizationResult } from "@/lib/warhammer-types";

describe("Warhammer Types — GAME_SYSTEMS", () => {
  it("contains 5 game systems", () => {
    expect(GAME_SYSTEMS).toHaveLength(5);
  });

  it("each system has id and name", () => {
    for (const gs of GAME_SYSTEMS) {
      expect(typeof gs.id).toBe("string");
      expect(typeof gs.name).toBe("string");
      expect(gs.id.length).toBeGreaterThan(0);
      expect(gs.name.length).toBeGreaterThan(0);
    }
  });

  it("includes known game systems: 40K, AOS, HERESY, KILLTEAM, NECROMUNDA", () => {
    const ids = GAME_SYSTEMS.map((gs) => gs.id);
    expect(ids).toContain("40K");
    expect(ids).toContain("AOS");
    expect(ids).toContain("HERESY");
    expect(ids).toContain("KILLTEAM");
    expect(ids).toContain("NECROMUNDA");
  });

  it("has unique ids", () => {
    const ids = GAME_SYSTEMS.map((gs) => gs.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Warhammer Types — RETAILER_NAMES", () => {
  it("contains at least 5 retailers", () => {
    expect(Object.keys(RETAILER_NAMES).length).toBeGreaterThanOrEqual(5);
  });

  it("maps slug keys to human-readable names", () => {
    for (const [slug, name] of Object.entries(RETAILER_NAMES)) {
      expect(typeof slug).toBe("string");
      expect(typeof name).toBe("string");
      expect(slug.length).toBeGreaterThan(0);
      expect(name.length).toBeGreaterThan(0);
      // Slugs should be lowercase with hyphens
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("includes Games Workshop", () => {
    expect(RETAILER_NAMES["games-workshop"]).toBe("Games Workshop");
  });
});

describe("Warhammer Types — Type Shape Verification", () => {
  it("WHFaction type has correct shape", () => {
    const faction: WHFaction = {
      id: "f1",
      name: "Space Marines",
      game_system: "40K",
      unit_count: 50,
    };
    expect(faction.id).toBe("f1");
    expect(faction.game_system).toBe("40K");
  });

  it("WHProduct type has correct shape", () => {
    const product: WHProduct = {
      id: "p1",
      name: "Intercessors",
      faction_id: "f1",
      game_system: "40K",
      models_in_box: 10,
      points_per_unit: 100,
      gw_sku: "48-75",
      image_url: null,
      keywords: "INFANTRY,PRIMARIS",
      updated_at: Date.now(),
    };
    expect(product.models_in_box).toBe(10);
    expect(product.gw_sku).toBe("48-75");
  });

  it("WHPrice type has correct shape", () => {
    const price: WHPrice = {
      id: "pr1",
      product_id: "p1",
      retailer: "games-workshop",
      price: 60,
      currency: "USD",
      url: "https://example.com",
      in_stock: true,
      price_per_model: 6,
      price_per_point: 0.6,
      scraped_at: Date.now(),
    };
    expect(price.price_per_model).toBe(6);
    expect(price.in_stock).toBe(true);
  });

  it("WHProductWithPrices extends WHProduct with prices array", () => {
    const pwp: WHProductWithPrices = {
      id: "p1",
      name: "Intercessors",
      faction_id: "f1",
      game_system: "40K",
      models_in_box: 10,
      points_per_unit: 100,
      gw_sku: null,
      image_url: null,
      keywords: null,
      updated_at: Date.now(),
      prices: [],
      best_price_per_model: 5.5,
      best_price_per_point: 0.55,
      best_retailer: "miniature-market",
    };
    expect(Array.isArray(pwp.prices)).toBe(true);
    expect(pwp.best_retailer).toBe("miniature-market");
  });

  it("ArmyOptimizationResult type has correct shape", () => {
    const result: ArmyOptimizationResult = {
      items: [],
      total_cost: 0,
      total_models: 0,
      total_points: 0,
      avg_price_per_model: 0,
      avg_price_per_point: 0,
    };
    expect(result.total_cost).toBe(0);
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("GameSystem type accepts only valid values", () => {
    const valid: GameSystem[] = ["40K", "HERESY", "AOS", "KILLTEAM", "NECROMUNDA"];
    expect(valid).toHaveLength(5);
    // Each should match one of the GAME_SYSTEMS entries
    for (const gs of valid) {
      expect(GAME_SYSTEMS.some((s) => s.id === gs)).toBe(true);
    }
  });
});
