"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  WHFaction,
  WHProductWithPrices,
  GameSystem,
} from "@/lib/warhammer-types";
import { GAME_SYSTEMS } from "@/lib/warhammer-types";
import PriceTable from "./PriceTable";
import UnitCard from "./UnitCard";

type SortBy = "price_per_model" | "price_per_point" | "price";

export default function BrowseTab() {
  const [gameSystem, setGameSystem] = useState<GameSystem>("40K");
  const [factions, setFactions] = useState<WHFaction[]>([]);
  const [selectedFaction, setSelectedFaction] = useState<string>("");
  const [products, setProducts] = useState<WHProductWithPrices[]>([]);
  const [selectedProduct, setSelectedProduct] =
    useState<WHProductWithPrices | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("price_per_model");
  const [loading, setLoading] = useState(false);

  // Load factions when game system changes
  useEffect(() => {
    (async () => {
      const res = await fetch(
        `/api/warhammer/products?action=factions&game_system=${gameSystem}`,
      );
      const data = await res.json();
      if (data.ok) {
        setFactions(data.factions);
        setSelectedFaction("");
        setProducts([]);
        setSelectedProduct(null);
      }
    })();
  }, [gameSystem]);

  // Load products when faction changes
  const loadProducts = useCallback(async () => {
    if (!selectedFaction) return;
    setLoading(true);
    setSelectedProduct(null);
    try {
      const params = new URLSearchParams({
        action: "browse",
        game_system: gameSystem,
        faction_id: selectedFaction,
        sort: sortBy,
        limit: "100",
      });
      const res = await fetch(`/api/warhammer/products?${params}`);
      const data = await res.json();
      if (data.ok) setProducts(data.products);
    } catch (err) {
      console.error("Browse failed:", err);
    } finally {
      setLoading(false);
    }
  }, [gameSystem, selectedFaction, sortBy]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  return (
    <div className="space-y-4">
      {/* Game system tabs */}
      <div className="flex gap-2 flex-wrap">
        {GAME_SYSTEMS.map((gs) => (
          <button
            key={gs.id}
            onClick={() => setGameSystem(gs.id)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              gameSystem === gs.id
                ? "bg-accent text-white"
                : "bg-surface border border-border text-foreground hover:border-accent/50"
            }`}
          >
            {gs.name}
          </button>
        ))}
      </div>

      {/* Faction selector + sort */}
      <div className="flex gap-2">
        <select
          value={selectedFaction}
          onChange={(e) => setSelectedFaction(e.target.value)}
          className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-foreground"
        >
          <option value="">Select a faction...</option>
          {factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="px-3 py-2 bg-surface border border-border rounded-lg text-foreground"
        >
          <option value="price_per_model">Sort: $/Model</option>
          <option value="price_per_point">Sort: $/Point</option>
          <option value="price">Sort: Total Price</option>
        </select>
      </div>

      {/* Products grid */}
      {loading && <p className="text-muted text-center py-8">Loading...</p>}

      {!loading && products.length > 0 && !selectedProduct && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map((product) => (
            <UnitCard
              key={product.id}
              product={product}
              onClick={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      )}

      {selectedProduct && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">{selectedProduct.name}</h3>
            <button
              onClick={() => setSelectedProduct(null)}
              className="text-muted hover:text-foreground text-sm"
            >
              Back to list
            </button>
          </div>
          <PriceTable
            prices={selectedProduct.prices}
            modelsInBox={selectedProduct.models_in_box}
            pointsPerUnit={selectedProduct.points_per_unit}
          />
        </div>
      )}

      {!loading && products.length === 0 && selectedFaction && (
        <p className="text-muted text-center py-8">
          No products found for this faction.
        </p>
      )}
    </div>
  );
}
