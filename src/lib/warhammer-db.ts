// Warhammer Price Finder — Cloudflare D1 Query Helpers

import type {
  WHFaction,
  WHProduct,
  WHPrice,
  WHProductWithPrices,
  GameSystem,
  ArmyListItem,
  OptimizedPurchase,
  ArmyOptimizationResult,
} from "./warhammer-types";

const D1_DATABASE_ID = "66c4ee55-8fbe-45d5-9a98-e88328aaf595";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "b621d14f660c227bfec605351679bb86";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  if (!CF_API_TOKEN) {
    console.error("[warhammer-db] CF_API_TOKEN is empty — D1 queries will fail");
    return [];
  }
  const res = await fetch(`${D1_API_BASE}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`[warhammer-db] D1 HTTP ${res.status}: ${await res.text()}`);
    return [];
  }
  const data = (await res.json()) as {
    success: boolean;
    result: { results: T[] }[];
    errors?: { message: string }[];
  };
  if (!data.success) {
    console.error("[warhammer-db] D1 query failed:", data.errors);
    return [];
  }
  return data.result?.[0]?.results || [];
}

export async function getFactions(gameSystem?: GameSystem): Promise<WHFaction[]> {
  if (gameSystem) {
    return d1Query<WHFaction>(
      "SELECT * FROM wh_factions WHERE game_system = ? ORDER BY name",
      [gameSystem],
    );
  }
  return d1Query<WHFaction>("SELECT * FROM wh_factions ORDER BY game_system, name");
}

export async function searchProducts(
  query: string,
  gameSystem?: GameSystem,
  factionId?: string,
): Promise<WHProduct[]> {
  let sql = "SELECT * FROM wh_products WHERE name LIKE ?";
  const params: (string | number)[] = [`%${query}%`];
  if (gameSystem) {
    sql += " AND game_system = ?";
    params.push(gameSystem);
  }
  if (factionId) {
    sql += " AND faction_id = ?";
    params.push(factionId);
  }
  sql += " ORDER BY name LIMIT 100";
  return d1Query<WHProduct>(sql, params);
}

export async function getProductsByFaction(factionId: string): Promise<WHProduct[]> {
  return d1Query<WHProduct>(
    "SELECT * FROM wh_products WHERE faction_id = ? ORDER BY name",
    [factionId],
  );
}

export async function getPricesForProduct(productId: string): Promise<WHPrice[]> {
  const rows = await d1Query<Record<string, unknown>>(
    "SELECT * FROM wh_prices WHERE product_id = ? ORDER BY price_per_model ASC",
    [productId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    product_id: r.product_id as string,
    retailer: r.retailer as string,
    price: r.price as number,
    currency: r.currency as string,
    url: r.url as string | null,
    in_stock: Boolean(r.in_stock),
    price_per_model: r.price_per_model as number,
    price_per_point: r.price_per_point as number,
    scraped_at: r.scraped_at as number,
  }));
}

export async function getProductsWithBestPrices(
  gameSystem?: GameSystem,
  factionId?: string,
  sortBy: "price_per_model" | "price_per_point" | "price" = "price_per_model",
  limit = 50,
  offset = 0,
): Promise<WHProductWithPrices[]> {
  let where = "WHERE 1=1";
  const params: (string | number)[] = [];
  if (gameSystem) {
    where += " AND p.game_system = ?";
    params.push(gameSystem);
  }
  if (factionId) {
    where += " AND p.faction_id = ?";
    params.push(factionId);
  }

  const products = await d1Query<WHProduct>(
    `SELECT p.* FROM wh_products p ${where} ORDER BY p.name LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const results: WHProductWithPrices[] = [];
  for (const product of products) {
    const prices = await getPricesForProduct(product.id);
    const inStockPrices = prices.filter((p) => p.in_stock);
    const bestPrice = inStockPrices.length > 0 ? inStockPrices[0] : null;
    results.push({
      ...product,
      prices,
      best_price_per_model: bestPrice?.price_per_model ?? null,
      best_price_per_point: bestPrice?.price_per_point ?? null,
      best_retailer: bestPrice?.retailer ?? null,
    });
  }

  results.sort((a, b) => {
    const aVal =
      sortBy === "price_per_model"
        ? a.best_price_per_model
        : sortBy === "price_per_point"
          ? a.best_price_per_point
          : a.prices[0]?.price ?? Infinity;
    const bVal =
      sortBy === "price_per_model"
        ? b.best_price_per_model
        : sortBy === "price_per_point"
          ? b.best_price_per_point
          : b.prices[0]?.price ?? Infinity;
    return (aVal ?? Infinity) - (bVal ?? Infinity);
  });

  return results;
}

export async function optimizeArmyPurchase(
  items: ArmyListItem[],
): Promise<ArmyOptimizationResult> {
  const purchases: OptimizedPurchase[] = [];
  let totalCost = 0;
  let totalModels = 0;
  let totalPoints = 0;

  for (const item of items) {
    const [product] = await d1Query<WHProduct>(
      "SELECT * FROM wh_products WHERE id = ?",
      [item.product_id],
    );
    if (!product) continue;

    const prices = await getPricesForProduct(item.product_id);
    const bestPrice = prices.find((p) => p.in_stock) || prices[0];
    if (!bestPrice) continue;

    const totalForItem = bestPrice.price * item.quantity;
    purchases.push({
      product_id: item.product_id,
      product_name: product.name,
      quantity: item.quantity,
      retailer: bestPrice.retailer,
      unit_price: bestPrice.price,
      total_price: totalForItem,
      url: bestPrice.url,
      price_per_model: bestPrice.price_per_model,
      price_per_point: bestPrice.price_per_point,
    });

    totalCost += totalForItem;
    totalModels += product.models_in_box * item.quantity;
    totalPoints += product.points_per_unit * item.quantity;
  }

  return {
    items: purchases,
    total_cost: Math.round(totalCost * 100) / 100,
    total_models: totalModels,
    total_points: totalPoints,
    avg_price_per_model:
      totalModels > 0 ? Math.round((totalCost / totalModels) * 100) / 100 : 0,
    avg_price_per_point:
      totalPoints > 0 ? Math.round((totalCost / totalPoints) * 10000) / 10000 : 0,
  };
}

export async function getLastScrapeTime(): Promise<number | null> {
  const rows = await d1Query<{ finished_at: number }>(
    "SELECT finished_at FROM wh_scrape_log ORDER BY finished_at DESC LIMIT 1",
  );
  return rows[0]?.finished_at ?? null;
}
