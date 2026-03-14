# Warhammer Price-Per-Model Search — Design Doc

**Date:** 2026-03-14
**Status:** Approved

## Summary

Secret hidden page at `/app/warhammer` on CPUAGEN.com that finds the best price-per-model and price-per-point for Warhammer miniatures across multiple retailers and eBay.

## Requirements

- **Game Systems:** 40K, Horus Heresy, Age of Sigmar, Kill Team, Necromunda
- **Access:** Hidden URL only — no links anywhere on the site
- **Sources:** Retailers (GW, Element Games, Wayland, Miniature Market, Noble Knight) + eBay (Buy It Now, new, US)
- **Metrics:** Price-per-model AND price-per-point
- **Points Data:** Scraped from Wahapedia (primary), BattleScribe data files (fallback)

## Architecture: Approach B — Separate Scraper + Vercel Frontend

### Component 1: Scraper Service (Python)

Standalone Python service, runs on schedule (every 6-12 hours via cron/GitHub Actions).

**Responsibilities:**
- Scrape retailer product pages for prices, stock, URLs
- Scrape eBay Buy It Now listings (new condition, US sellers)
- Scrape Wahapedia for unit point values
- Parse BattleScribe data files as fallback for points
- Compute price_per_model and price_per_point
- Write results to Cloudflare D1

**Location:** `cpuagen-live/scraper/`

### Component 2: Frontend (Next.js)

New route inside existing cpuagen-live app.

**Route:** `/app/warhammer` (hidden, no navigation links)

**Three Modes:**
1. **Search** — Type unit name, get price comparison table across all retailers
2. **Browse by Faction** — Pick game system → faction → see all kits sorted by best price-per-model or price-per-point
3. **Army Builder** — Input a list of units, get optimized shopping cart (cheapest way to buy them all across retailers)

### Component 3: Database (Cloudflare D1)

Two new tables in existing D1 database:

**`wh_products`**
- id (PK), name, faction, game_system, models_in_box, points_per_unit, gw_sku, image_url, updated_at

**`wh_prices`**
- id (PK), product_id (FK), retailer, price (USD), url, in_stock, price_per_model, price_per_point, scraped_at

## Retailers

| Retailer | Method | Notes |
|----------|--------|-------|
| Games Workshop (US) | HTTP scrape | Official MSRP baseline |
| Element Games | HTTP scrape | UK retailer, convert to USD |
| Wayland Games | HTTP scrape | UK retailer, convert to USD |
| Miniature Market | HTTP scrape | US retailer |
| Noble Knight Games | HTTP scrape | US retailer |
| eBay | eBay Browse API or scrape | Buy It Now, new condition, US sellers |

## Points Sources

| Source | Method | Priority |
|--------|--------|----------|
| Wahapedia | HTTP scrape | Primary |
| BattleScribe | Parse .cat/.gst XML files | Fallback |

## UI Design

- Dark theme (matches existing CPUAGEN aesthetic)
- Tab bar for mode switching (Search / Browse / Army Builder)
- Sort by: price-per-model, price-per-point, total price, retailer
- Filter by: game system, faction, in-stock only
- "Last updated" timestamp showing scrape freshness
- Direct "Buy" links to retailer listings
