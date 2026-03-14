"use client";

import type { WHPrice } from "@/lib/warhammer-types";
import { RETAILER_NAMES } from "@/lib/warhammer-types";

interface PriceTableProps {
  prices: WHPrice[];
  modelsInBox: number;
  pointsPerUnit: number;
}

export default function PriceTable({
  prices,
  modelsInBox,
  pointsPerUnit,
}: PriceTableProps) {
  if (prices.length === 0) {
    return <p className="text-muted text-sm">No prices found.</p>;
  }

  const bestPpm = Math.min(
    ...prices.filter((p) => p.in_stock).map((p) => p.price_per_model),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="py-2 px-3">Retailer</th>
            <th className="py-2 px-3 text-right">Price</th>
            <th className="py-2 px-3 text-right">$/Model</th>
            {pointsPerUnit > 0 && (
              <th className="py-2 px-3 text-right">$/Point</th>
            )}
            <th className="py-2 px-3 text-center">Stock</th>
            <th className="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {prices.map((price) => {
            const isBest =
              price.in_stock && price.price_per_model === bestPpm;
            return (
              <tr
                key={price.id}
                className={`border-b border-border/50 ${isBest ? "bg-success/10" : ""} ${!price.in_stock ? "opacity-50" : ""}`}
              >
                <td className="py-2 px-3 font-medium">
                  {RETAILER_NAMES[price.retailer] || price.retailer}
                  {isBest && (
                    <span className="ml-2 text-xs text-success font-bold">
                      BEST
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  ${price.price.toFixed(2)}
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  ${price.price_per_model.toFixed(2)}
                </td>
                {pointsPerUnit > 0 && (
                  <td className="py-2 px-3 text-right font-mono">
                    ${price.price_per_point.toFixed(4)}
                  </td>
                )}
                <td className="py-2 px-3 text-center">
                  {price.in_stock ? (
                    <span className="text-success">In Stock</span>
                  ) : (
                    <span className="text-danger">OOS</span>
                  )}
                </td>
                <td className="py-2 px-3">
                  {price.url && (
                    <a
                      href={price.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent-light text-xs"
                    >
                      Buy &rarr;
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
