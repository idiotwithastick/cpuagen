// Warhammer Price Finder — TypeScript Types

export type GameSystem = "40K" | "HERESY" | "AOS" | "KILLTEAM" | "NECROMUNDA";

export interface WHFaction {
  id: string;
  name: string;
  game_system: GameSystem;
  unit_count: number;
}

export interface WHProduct {
  id: string;
  name: string;
  faction_id: string;
  game_system: GameSystem;
  models_in_box: number;
  points_per_unit: number;
  gw_sku: string | null;
  image_url: string | null;
  keywords: string | null;
  updated_at: number;
}

export interface WHPrice {
  id: string;
  product_id: string;
  retailer: string;
  price: number;
  currency: string;
  url: string | null;
  in_stock: boolean;
  price_per_model: number;
  price_per_point: number;
  scraped_at: number;
}

export interface WHProductWithPrices extends WHProduct {
  prices: WHPrice[];
  best_price_per_model: number | null;
  best_price_per_point: number | null;
  best_retailer: string | null;
}

export interface ArmyListItem {
  product_id: string;
  quantity: number;
}

export interface OptimizedPurchase {
  product_id: string;
  product_name: string;
  quantity: number;
  retailer: string;
  unit_price: number;
  total_price: number;
  url: string | null;
  price_per_model: number;
  price_per_point: number;
}

export interface ArmyOptimizationResult {
  items: OptimizedPurchase[];
  total_cost: number;
  total_models: number;
  total_points: number;
  avg_price_per_model: number;
  avg_price_per_point: number;
}

export const GAME_SYSTEMS: { id: GameSystem; name: string }[] = [
  { id: "40K", name: "Warhammer 40,000" },
  { id: "HERESY", name: "Horus Heresy" },
  { id: "AOS", name: "Age of Sigmar" },
  { id: "KILLTEAM", name: "Kill Team" },
  { id: "NECROMUNDA", name: "Necromunda" },
];

export const RETAILER_NAMES: Record<string, string> = {
  "games-workshop": "Games Workshop",
  "miniature-market": "Miniature Market",
  "element-games": "Element Games",
  "wayland-games": "Wayland Games",
  "noble-knight": "Noble Knight Games",
  "ebay": "eBay",
};
