import { NextRequest } from "next/server";
import { optimizeArmyPurchase } from "@/lib/warhammer-db";
import { thermosolve, cbfCheck } from "@/lib/enforcement";
import type { ArmyListItem } from "@/lib/warhammer-types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { items: ArmyListItem[] };
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return Response.json(
        { ok: false, error: "items array required" },
        { status: 400 },
      );
    }

    if (body.items.length > 50) {
      return Response.json(
        { ok: false, error: "Max 50 items per optimization" },
        { status: 400 },
      );
    }

    const sig = thermosolve(`warhammer-optimize:${body.items.length}-items`);
    const cbf = cbfCheck(sig);
    if (!cbf.allSafe) {
      return Response.json(
        { ok: false, error: "Request blocked by enforcement" },
        { status: 403 },
      );
    }

    const result = await optimizeArmyPurchase(body.items);
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error("Warhammer optimize API error:", error);
    return Response.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
