import { NextRequest } from "next/server";
import {
  searchProducts,
  getProductsWithBestPrices,
  getFactions,
} from "@/lib/warhammer-db";
import { thermosolve, cbfCheck } from "@/lib/enforcement";
import type { GameSystem } from "@/lib/warhammer-types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action") || "search";
  const query = searchParams.get("q") || "";
  const gameSystem = searchParams.get("game_system") as GameSystem | null;
  const factionId = searchParams.get("faction_id") || undefined;
  const sortBy = (searchParams.get("sort") || "price_per_model") as
    | "price_per_model"
    | "price_per_point"
    | "price";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const sig = thermosolve(`warhammer-products:${action}:${query}`);
    const cbf = cbfCheck(sig);
    if (!cbf.allSafe) {
      return Response.json(
        { ok: false, error: "Request blocked by enforcement" },
        { status: 403 },
      );
    }

    if (action === "factions") {
      const factions = await getFactions(gameSystem || undefined);
      return Response.json({ ok: true, factions });
    }

    if (action === "search" && query) {
      const products = await searchProducts(
        query,
        gameSystem || undefined,
        factionId,
      );
      return Response.json({ ok: true, products });
    }

    if (action === "browse") {
      const products = await getProductsWithBestPrices(
        gameSystem || undefined,
        factionId,
        sortBy,
        limit,
        offset,
      );
      return Response.json({ ok: true, products });
    }

    return Response.json(
      { ok: false, error: "Invalid action or missing query" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Warhammer products API error:", error);
    return Response.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
