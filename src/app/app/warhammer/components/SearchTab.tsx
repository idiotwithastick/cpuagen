"use client";

import { useState, useCallback } from "react";
import type { WHProductWithPrices, GameSystem } from "@/lib/warhammer-types";
import { GAME_SYSTEMS } from "@/lib/warhammer-types";
import PriceTable from "./PriceTable";
import UnitCard from "./UnitCard";

export default function SearchTab() {
  const [query, setQuery] = useState("");
  const [gameSystem, setGameSystem] = useState<GameSystem | "">("");
  const [results, setResults] = useState<WHProductWithPrices[]>([]);
  const [selectedProduct, setSelectedProduct] =
    useState<WHProductWithPrices | null>(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSelectedProduct(null);
    try {
      const params = new URLSearchParams({
        action: "search",
        q: query,
        ...(gameSystem && { game_system: gameSystem }),
      });
      const res = await fetch(`/api/warhammer/products?${params}`);
      const data = await res.json();
      if (data.ok) {
        // Products already include prices from server-side JOIN — no N+1
        setResults(data.products);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  }, [query, gameSystem]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search units... (e.g., Intercessors, Boyz, Lich Guard)"
          className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
        />
        <select
          value={gameSystem}
          onChange={(e) => setGameSystem(e.target.value as GameSystem | "")}
          className="px-3 py-2 bg-surface border border-border rounded-lg text-foreground"
        >
          <option value="">All Systems</option>
          {GAME_SYSTEMS.map((gs) => (
            <option key={gs.id} value={gs.id}>
              {gs.name}
            </option>
          ))}
        </select>
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Search"}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && !selectedProduct && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map((product) => (
            <UnitCard
              key={product.id}
              product={product}
              onClick={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      )}

      {/* Selected product detail */}
      {selectedProduct && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">{selectedProduct.name}</h3>
            <button
              onClick={() => setSelectedProduct(null)}
              className="text-muted hover:text-foreground text-sm"
            >
              Back to results
            </button>
          </div>
          <div className="flex gap-4 text-sm text-muted mb-4">
            <span>{selectedProduct.game_system}</span>
            <span>{selectedProduct.models_in_box} models/box</span>
            {selectedProduct.points_per_unit > 0 && (
              <span>{selectedProduct.points_per_unit} points</span>
            )}
          </div>
          <PriceTable
            prices={selectedProduct.prices}
            modelsInBox={selectedProduct.models_in_box}
            pointsPerUnit={selectedProduct.points_per_unit}
          />
        </div>
      )}

      {results.length === 0 && !loading && query && (
        <p className="text-muted text-center py-8">
          No results found for &quot;{query}&quot;
        </p>
      )}
    </div>
  );
}
