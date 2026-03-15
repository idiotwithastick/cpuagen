import { NextRequest } from "next/server";
import { getPricesForProduct, getLastScrapeTime } from "@/lib/warhammer-db";
import { thermosolve, cbfCheck } from "@/lib/enforcement";

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
    const sig = thermosolve(`warhammer-prices:${productId}`);
    const cbf = cbfCheck(sig);
    if (!cbf.allSafe) {
      return Response.json(
        { ok: false, error: "Request blocked by enforcement" },
        { status: 403 },
      );
    }

    // Special case: just get last scrape time without querying a fake product
    if (productId === "_check_time") {
      const lastScrape = await getLastScrapeTime();
      return Response.json({ ok: true, prices: [], last_updated: lastScrape });
    }

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
