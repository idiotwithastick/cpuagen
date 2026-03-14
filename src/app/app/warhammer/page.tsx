"use client";

import { useState, useEffect } from "react";
import SearchTab from "./components/SearchTab";
import BrowseTab from "./components/BrowseTab";
import ArmyBuilderTab from "./components/ArmyBuilderTab";

type Tab = "search" | "browse" | "army";

export default function WarhammerPage() {
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          "/api/warhammer/prices?product_id=_check_time",
        );
        const data = await res.json();
        if (data.last_updated) {
          const date = new Date(data.last_updated * 1000);
          setLastUpdated(date.toLocaleString());
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "search", label: "Search" },
    { id: "browse", label: "Browse by Faction" },
    { id: "army", label: "Army Builder" },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Warhammer Price Finder
          </h1>
          <p className="text-sm text-muted">
            Find the best price-per-model across retailers
          </p>
        </div>
        {lastUpdated && (
          <span className="text-xs text-muted">
            Prices updated: {lastUpdated}
          </span>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2 rounded-md text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "search" && <SearchTab />}
      {activeTab === "browse" && <BrowseTab />}
      {activeTab === "army" && <ArmyBuilderTab />}
    </div>
  );
}
