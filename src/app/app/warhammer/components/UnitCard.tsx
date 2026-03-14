"use client";

import type { WHProductWithPrices } from "@/lib/warhammer-types";
import { RETAILER_NAMES } from "@/lib/warhammer-types";

interface UnitCardProps {
  product: WHProductWithPrices;
  onClick?: () => void;
}

export default function UnitCard({ product, onClick }: UnitCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-surface border border-border rounded-lg p-4 hover:border-accent/50 transition-colors cursor-pointer"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-foreground text-sm leading-tight">
          {product.name}
        </h3>
        {product.best_price_per_model !== null && (
          <span className="ml-2 text-xs bg-accent/20 text-accent-light px-2 py-0.5 rounded-full whitespace-nowrap">
            ${product.best_price_per_model.toFixed(2)}/model
          </span>
        )}
      </div>

      <div className="flex gap-3 text-xs text-muted">
        <span>
          {product.models_in_box} model
          {product.models_in_box !== 1 ? "s" : ""}
        </span>
        {product.points_per_unit > 0 && (
          <span>{product.points_per_unit} pts</span>
        )}
        {product.best_retailer && (
          <span className="text-success">
            {RETAILER_NAMES[product.best_retailer] || product.best_retailer}
          </span>
        )}
      </div>

      {product.best_price_per_point !== null &&
        product.best_price_per_point > 0 && (
          <div className="mt-1 text-xs text-muted">
            ${product.best_price_per_point.toFixed(4)}/pt
          </div>
        )}

      <div className="mt-2 text-xs text-muted">
        {product.prices.length} retailer
        {product.prices.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
