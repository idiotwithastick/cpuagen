import { NextRequest } from "next/server";
import { getPricesForProduct, getLastScrapeTime } from "@/lib/warhammer-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const productId = searchParams.get("product_id");

  if (!productId) {
    return Response.json(
      { ok: false, error: "product_id required" },
      { status: 400 },
    );
  }

  try {
    const prices = await getPricesForProduct(productId);
    const lastScrape = await getLastScrapeTime();

    return Response.json({
      ok: true,
      prices,
      last_updated: lastScrape,
    });
  } catch (error) {
    console.error("Warhammer prices API error:", error);
    return Response.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
