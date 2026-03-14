"use client";

import { useState, useCallback } from "react";
import type {
  WHProduct,
  ArmyOptimizationResult,
  GameSystem,
} from "@/lib/warhammer-types";
import { GAME_SYSTEMS, RETAILER_NAMES } from "@/lib/warhammer-types";

interface ArmyItem {
  product: WHProduct;
  quantity: number;
}

export default function ArmyBuilderTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WHProduct[]>([]);
  const [gameSystem, setGameSystem] = useState<GameSystem>("40K");
  const [armyList, setArmyList] = useState<ArmyItem[]>([]);
  const [result, setResult] = useState<ArmyOptimizationResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  const searchUnits = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({
        action: "search",
        q: searchQuery,
        game_system: gameSystem,
      });
      const res = await fetch(`/api/warhammer/products?${params}`);
      const data = await res.json();
      if (data.ok) setSearchResults(data.products.slice(0, 10));
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, gameSystem]);

  const addToArmy = (product: WHProduct) => {
    const existing = armyList.find((i) => i.product.id === product.id);
    if (existing) {
      setArmyList(
        armyList.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        ),
      );
    } else {
      setArmyList([...armyList, { product, quantity: 1 }]);
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeFromArmy = (productId: string) => {
    setArmyList(armyList.filter((i) => i.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) return removeFromArmy(productId);
    setArmyList(
      armyList.map((i) =>
        i.product.id === productId ? { ...i, quantity } : i,
      ),
    );
  };

  const optimize = useCallback(async () => {
    if (armyList.length === 0) return;
    setOptimizing(true);
    try {
      const res = await fetch("/api/warhammer/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: armyList.map((i) => ({
            product_id: i.product.id,
            quantity: i.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (data.ok) setResult(data.result);
    } catch (err) {
      console.error("Optimize failed:", err);
    } finally {
      setOptimizing(false);
    }
  }, [armyList]);

  return (
    <div className="space-y-4">
      {/* Add units */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-muted mb-2">
          Add Units to Army List
        </h3>
        <div className="flex gap-2">
          <select
            value={gameSystem}
            onChange={(e) => setGameSystem(e.target.value as GameSystem)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
          >
            {GAME_SYSTEMS.map((gs) => (
              <option key={gs.id} value={gs.id}>
                {gs.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchUnits()}
            placeholder="Search for a unit to add..."
            className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none text-sm"
          />
          <button
            onClick={searchUnits}
            disabled={searching}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 disabled:opacity-50 text-sm"
          >
            {searching ? "..." : "Find"}
          </button>
        </div>

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-2 border border-border rounded-lg divide-y divide-border/50">
            {searchResults.map((product) => (
              <button
                key={product.id}
                onClick={() => addToArmy(product)}
                className="w-full text-left px-3 py-2 hover:bg-surface-light text-sm flex justify-between"
              >
                <span>{product.name}</span>
                <span className="text-muted">
                  {product.models_in_box} model
                  {product.models_in_box !== 1 ? "s" : ""}
                  {product.points_per_unit > 0 &&
                    ` / ${product.points_per_unit} pts`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Army list */}
      {armyList.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-muted">
              Army List (
              {armyList.reduce((sum, i) => sum + i.quantity, 0)} boxes)
            </h3>
            <button
              onClick={optimize}
              disabled={optimizing}
              className="px-6 py-2 bg-success text-white rounded-lg hover:bg-success/80 disabled:opacity-50 text-sm font-medium"
            >
              {optimizing ? "Optimizing..." : "Find Best Prices"}
            </button>
          </div>
          <div className="space-y-2">
            {armyList.map((item) => (
              <div
                key={item.product.id}
                className="flex items-center gap-3 text-sm"
              >
                <button
                  onClick={() => removeFromArmy(item.product.id)}
                  className="text-danger hover:text-danger/80 text-xs"
                >
                  x
                </button>
                <span className="flex-1">{item.product.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      updateQuantity(item.product.id, item.quantity - 1)
                    }
                    className="w-6 h-6 bg-background border border-border rounded text-center hover:border-accent/50"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      updateQuantity(item.product.id, item.quantity + 1)
                    }
                    className="w-6 h-6 bg-background border border-border rounded text-center hover:border-accent/50"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimization result */}
      {result && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-muted mb-3">
            Optimized Shopping List
          </h3>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-background rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-accent">
                ${result.total_cost.toFixed(2)}
              </div>
              <div className="text-xs text-muted">Total Cost</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-foreground">
                {result.total_models}
              </div>
              <div className="text-xs text-muted">Total Models</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-foreground">
                {result.total_points}
              </div>
              <div className="text-xs text-muted">Total Points</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-success">
                ${result.avg_price_per_model.toFixed(2)}
              </div>
              <div className="text-xs text-muted">Avg $/Model</div>
            </div>
          </div>

          {/* Item breakdown */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 px-2">Unit</th>
                  <th className="py-2 px-2 text-center">Qty</th>
                  <th className="py-2 px-2">Retailer</th>
                  <th className="py-2 px-2 text-right">Unit $</th>
                  <th className="py-2 px-2 text-right">Total</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 px-2">{item.product_name}</td>
                    <td className="py-2 px-2 text-center">{item.quantity}</td>
                    <td className="py-2 px-2 text-success">
                      {RETAILER_NAMES[item.retailer] || item.retailer}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      ${item.unit_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      ${item.total_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-2">
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent-light text-xs"
                        >
                          Buy
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
