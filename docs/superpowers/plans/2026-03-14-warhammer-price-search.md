# Warhammer Price-Per-Model Search — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden `/app/warhammer` page to CPUAGEN.com that finds the cheapest price-per-model and price-per-point for Warhammer miniatures across retailers and eBay.

**Architecture:** Separate Python scraper service writes to Cloudflare D1 on a 6-12h schedule. Next.js frontend reads cached data. Three UI modes: Search, Browse by Faction, Army Builder.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, Cloudflare D1, Python 3 (scraper), Playwright (headless browser for Wahapedia), eBay Browse API, BeautifulSoup/httpx.

---

## File Structure

### Frontend (Next.js — inside cpuagen-live)

| File | Responsibility |
|------|---------------|
| `src/app/app/warhammer/page.tsx` | Main page — tabs for Search/Browse/Army Builder |
| `src/app/app/warhammer/components/SearchTab.tsx` | Unit search with price comparison table |
| `src/app/app/warhammer/components/BrowseTab.tsx` | Faction browser with sort/filter |
| `src/app/app/warhammer/components/ArmyBuilderTab.tsx` | Multi-unit shopping optimizer |
| `src/app/app/warhammer/components/PriceTable.tsx` | Reusable price comparison table |
| `src/app/app/warhammer/components/UnitCard.tsx` | Unit card with price-per-model badge |
| `src/app/api/warhammer/products/route.ts` | API: query products (search, filter, sort) |
| `src/app/api/warhammer/prices/route.ts` | API: get prices for a product |
| `src/app/api/warhammer/optimize/route.ts` | API: army builder optimizer |
| `src/lib/warhammer-db.ts` | D1 query helpers for wh_products + wh_prices |
| `src/lib/warhammer-types.ts` | TypeScript interfaces for Warhammer data |

### Scraper (Python — standalone service)

| File | Responsibility |
|------|---------------|
| `scraper/requirements.txt` | Python dependencies |
| `scraper/config.py` | Retailer configs, D1 credentials, constants |
| `scraper/db.py` | D1 write helpers (create tables, upsert products/prices) |
| `scraper/scrapers/base.py` | Base scraper class with retry/rate-limit logic |
| `scraper/scrapers/miniature_market.py` | Miniature Market scraper (JSON data layer) |
| `scraper/scrapers/element_games.py` | Element Games scraper (AJAX endpoint) |
| `scraper/scrapers/ebay_api.py` | eBay Browse API client |
| `scraper/scrapers/wahapedia.py` | Wahapedia points scraper (Playwright) |
| `scraper/scrapers/gw_rrp.py` | GW RRP reference (manual/static + sitemap) |
| `scraper/main.py` | Orchestrator: run all scrapers, write to D1 |
| `scraper/run_scrape.bat` | Windows batch launcher |

### Database (D1 — new tables in existing database)

| Table | Purpose |
|-------|---------|
| `wh_products` | Product catalog (name, faction, game system, models count, points) |
| `wh_prices` | Price records per retailer per product |
| `wh_factions` | Faction list per game system |
| `wh_scrape_log` | Scrape run metadata (timestamps, counts, errors) |

---

## Chunk 1: Database Schema + D1 Helpers

### Task 1: Create D1 Tables

**Files:**
- Create: `scraper/db.py`

- [ ] **Step 1: Write the table creation SQL**

```python
# scraper/db.py
import httpx
import os
import json
from datetime import datetime, timezone

D1_DATABASE_ID = "66c4ee55-8fbe-45d5-9a98-e88328aaf595"
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "b621d14f660c227bfec605351679bb86")
CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")
D1_API_BASE = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}"

def d1_query(sql: str, params: list | None = None) -> list[dict]:
    """Execute a D1 query via Cloudflare REST API."""
    res = httpx.post(
        f"{D1_API_BASE}/query",
        headers={
            "Authorization": f"Bearer {CF_API_TOKEN}",
            "Content-Type": "application/json",
        },
        json={"sql": sql, "params": params or []},
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()
    results = data.get("result", [])
    if results and "results" in results[0]:
        return results[0]["results"]
    return []

def create_tables():
    """Create Warhammer tables in D1 if they don't exist."""
    d1_query("""
        CREATE TABLE IF NOT EXISTS wh_factions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            game_system TEXT NOT NULL,
            unit_count INTEGER DEFAULT 0,
            updated_at INTEGER
        )
    """)
    d1_query("""
        CREATE TABLE IF NOT EXISTS wh_products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            faction_id TEXT NOT NULL,
            game_system TEXT NOT NULL,
            models_in_box INTEGER DEFAULT 1,
            points_per_unit INTEGER DEFAULT 0,
            gw_sku TEXT,
            image_url TEXT,
            keywords TEXT,
            updated_at INTEGER,
            FOREIGN KEY (faction_id) REFERENCES wh_factions(id)
        )
    """)
    d1_query("""
        CREATE TABLE IF NOT EXISTS wh_prices (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            retailer TEXT NOT NULL,
            price REAL NOT NULL,
            currency TEXT DEFAULT 'USD',
            url TEXT,
            in_stock INTEGER DEFAULT 1,
            price_per_model REAL,
            price_per_point REAL,
            scraped_at INTEGER,
            FOREIGN KEY (product_id) REFERENCES wh_products(id)
        )
    """)
    d1_query("""
        CREATE TABLE IF NOT EXISTS wh_scrape_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            retailer TEXT NOT NULL,
            started_at INTEGER,
            finished_at INTEGER,
            products_found INTEGER DEFAULT 0,
            prices_updated INTEGER DEFAULT 0,
            errors INTEGER DEFAULT 0,
            error_details TEXT
        )
    """)
    # Indexes for fast queries
    d1_query("CREATE INDEX IF NOT EXISTS idx_wh_products_faction ON wh_products(faction_id)")
    d1_query("CREATE INDEX IF NOT EXISTS idx_wh_products_game ON wh_products(game_system)")
    d1_query("CREATE INDEX IF NOT EXISTS idx_wh_prices_product ON wh_prices(product_id)")
    d1_query("CREATE INDEX IF NOT EXISTS idx_wh_prices_retailer ON wh_prices(retailer)")
    d1_query("CREATE INDEX IF NOT EXISTS idx_wh_products_name ON wh_products(name)")
    print("All Warhammer tables created successfully.")
```

- [ ] **Step 2: Run table creation**

```bash
cd L:/SSD-RCI_9_Unifying/cpuagen-live/scraper
python -c "from db import create_tables; create_tables()"
```

Expected: "All Warhammer tables created successfully."

- [ ] **Step 3: Add upsert helpers to db.py**

Add to `scraper/db.py`:

```python
def upsert_faction(faction_id: str, name: str, game_system: str):
    now = int(datetime.now(timezone.utc).timestamp())
    d1_query(
        """INSERT INTO wh_factions (id, name, game_system, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name=?, game_system=?, updated_at=?""",
        [faction_id, name, game_system, now, name, game_system, now],
    )

def upsert_product(
    product_id: str, name: str, faction_id: str, game_system: str,
    models_in_box: int = 1, points_per_unit: int = 0,
    gw_sku: str | None = None, image_url: str | None = None,
    keywords: str | None = None,
):
    now = int(datetime.now(timezone.utc).timestamp())
    d1_query(
        """INSERT INTO wh_products (id, name, faction_id, game_system, models_in_box,
           points_per_unit, gw_sku, image_url, keywords, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name=?, models_in_box=?, points_per_unit=?,
           gw_sku=?, image_url=?, keywords=?, updated_at=?""",
        [product_id, name, faction_id, game_system, models_in_box,
         points_per_unit, gw_sku, image_url, keywords, now,
         name, models_in_box, points_per_unit, gw_sku, image_url, keywords, now],
    )

def upsert_price(
    product_id: str, retailer: str, price: float, currency: str = "USD",
    url: str | None = None, in_stock: bool = True,
    models_in_box: int = 1, points_per_unit: int = 0,
):
    import hashlib
    now = int(datetime.now(timezone.utc).timestamp())
    price_id = hashlib.md5(f"{product_id}:{retailer}".encode()).hexdigest()[:16]
    ppm = round(price / models_in_box, 2) if models_in_box > 0 else price
    ppp = round(price / points_per_unit, 4) if points_per_unit > 0 else 0.0
    d1_query(
        """INSERT INTO wh_prices (id, product_id, retailer, price, currency, url,
           in_stock, price_per_model, price_per_point, scraped_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET price=?, currency=?, url=?, in_stock=?,
           price_per_model=?, price_per_point=?, scraped_at=?""",
        [price_id, product_id, retailer, price, currency, url,
         1 if in_stock else 0, ppm, ppp, now,
         price, currency, url, 1 if in_stock else 0, ppm, ppp, now],
    )

def log_scrape(retailer: str, started: int, products: int, prices: int, errors: int, details: str = ""):
    finished = int(datetime.now(timezone.utc).timestamp())
    d1_query(
        """INSERT INTO wh_scrape_log (retailer, started_at, finished_at,
           products_found, prices_updated, errors, error_details)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        [retailer, started, finished, products, prices, errors, details],
    )
```

- [ ] **Step 4: Commit**

```bash
git add scraper/db.py
git commit -m "feat(warhammer): D1 database schema and helpers for price tracking"
```

---

### Task 2: TypeScript D1 Query Helpers (Frontend)

**Files:**
- Create: `src/lib/warhammer-types.ts`
- Create: `src/lib/warhammer-db.ts`

- [ ] **Step 1: Create TypeScript types**

```typescript
// src/lib/warhammer-types.ts

export type GameSystem = "40K" | "HERESY" | "AOS" | "KILLTEAM" | "NECROMUNDA";

export interface WHFaction {
  id: string;
  name: string;
  game_system: GameSystem;
  unit_count: number;
}

export interface WHProduct {
  id: string;
  name: string;
  faction_id: string;
  game_system: GameSystem;
  models_in_box: number;
  points_per_unit: number;
  gw_sku: string | null;
  image_url: string | null;
  keywords: string | null;
  updated_at: number;
}

export interface WHPrice {
  id: string;
  product_id: string;
  retailer: string;
  price: number;
  currency: string;
  url: string | null;
  in_stock: boolean;
  price_per_model: number;
  price_per_point: number;
  scraped_at: number;
}

export interface WHProductWithPrices extends WHProduct {
  prices: WHPrice[];
  best_price_per_model: number | null;
  best_price_per_point: number | null;
  best_retailer: string | null;
}

export interface ArmyListItem {
  product_id: string;
  quantity: number;
}

export interface OptimizedPurchase {
  product_id: string;
  product_name: string;
  quantity: number;
  retailer: string;
  unit_price: number;
  total_price: number;
  url: string | null;
  price_per_model: number;
  price_per_point: number;
}

export interface ArmyOptimizationResult {
  items: OptimizedPurchase[];
  total_cost: number;
  total_models: number;
  total_points: number;
  avg_price_per_model: number;
  avg_price_per_point: number;
}

export const GAME_SYSTEMS: { id: GameSystem; name: string }[] = [
  { id: "40K", name: "Warhammer 40,000" },
  { id: "HERESY", name: "Horus Heresy" },
  { id: "AOS", name: "Age of Sigmar" },
  { id: "KILLTEAM", name: "Kill Team" },
  { id: "NECROMUNDA", name: "Necromunda" },
];

export const RETAILER_NAMES: Record<string, string> = {
  "games-workshop": "Games Workshop",
  "miniature-market": "Miniature Market",
  "element-games": "Element Games",
  "wayland-games": "Wayland Games",
  "noble-knight": "Noble Knight Games",
  "ebay": "eBay",
};
```

- [ ] **Step 2: Create D1 query helpers**

```typescript
// src/lib/warhammer-db.ts

import type {
  WHFaction, WHProduct, WHPrice, WHProductWithPrices,
  GameSystem, ArmyListItem, OptimizedPurchase, ArmyOptimizationResult,
} from "./warhammer-types";

const D1_DATABASE_ID = "66c4ee55-8fbe-45d5-9a98-e88328aaf595";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "b621d14f660c227bfec605351679bb86";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

async function d1Query<T = Record<string, unknown>>(sql: string, params: (string | number)[] = []): Promise<T[]> {
  const res = await fetch(`${D1_API_BASE}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json() as { result: { results: T[] }[] };
  return data.result?.[0]?.results || [];
}

export async function getFactions(gameSystem?: GameSystem): Promise<WHFaction[]> {
  if (gameSystem) {
    return d1Query<WHFaction>("SELECT * FROM wh_factions WHERE game_system = ? ORDER BY name", [gameSystem]);
  }
  return d1Query<WHFaction>("SELECT * FROM wh_factions ORDER BY game_system, name");
}

export async function searchProducts(query: string, gameSystem?: GameSystem, factionId?: string): Promise<WHProduct[]> {
  let sql = "SELECT * FROM wh_products WHERE name LIKE ?";
  const params: (string | number)[] = [`%${query}%`];
  if (gameSystem) { sql += " AND game_system = ?"; params.push(gameSystem); }
  if (factionId) { sql += " AND faction_id = ?"; params.push(factionId); }
  sql += " ORDER BY name LIMIT 100";
  return d1Query<WHProduct>(sql, params);
}

export async function getProductsByFaction(factionId: string): Promise<WHProduct[]> {
  return d1Query<WHProduct>(
    "SELECT * FROM wh_products WHERE faction_id = ? ORDER BY name",
    [factionId],
  );
}

export async function getPricesForProduct(productId: string): Promise<WHPrice[]> {
  const rows = await d1Query<WHPrice & { in_stock: number }>(
    "SELECT * FROM wh_prices WHERE product_id = ? ORDER BY price_per_model ASC",
    [productId],
  );
  return rows.map((r) => ({ ...r, in_stock: Boolean(r.in_stock) }));
}

export async function getProductsWithBestPrices(
  gameSystem?: GameSystem,
  factionId?: string,
  sortBy: "price_per_model" | "price_per_point" | "price" = "price_per_model",
  limit = 50,
  offset = 0,
): Promise<WHProductWithPrices[]> {
  let where = "WHERE 1=1";
  const params: (string | number)[] = [];
  if (gameSystem) { where += " AND p.game_system = ?"; params.push(gameSystem); }
  if (factionId) { where += " AND p.faction_id = ?"; params.push(factionId); }

  const products = await d1Query<WHProduct>(
    `SELECT p.* FROM wh_products p ${where} ORDER BY p.name LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const results: WHProductWithPrices[] = [];
  for (const product of products) {
    const prices = await getPricesForProduct(product.id);
    const inStockPrices = prices.filter((p) => p.in_stock);
    const bestPrice = inStockPrices.length > 0 ? inStockPrices[0] : null;
    results.push({
      ...product,
      prices,
      best_price_per_model: bestPrice?.price_per_model ?? null,
      best_price_per_point: bestPrice?.price_per_point ?? null,
      best_retailer: bestPrice?.retailer ?? null,
    });
  }

  results.sort((a, b) => {
    const aVal = sortBy === "price_per_model" ? a.best_price_per_model :
                 sortBy === "price_per_point" ? a.best_price_per_point :
                 a.prices[0]?.price ?? Infinity;
    const bVal = sortBy === "price_per_model" ? b.best_price_per_model :
                 sortBy === "price_per_point" ? b.best_price_per_point :
                 b.prices[0]?.price ?? Infinity;
    return (aVal ?? Infinity) - (bVal ?? Infinity);
  });

  return results;
}

export async function optimizeArmyPurchase(items: ArmyListItem[]): Promise<ArmyOptimizationResult> {
  const purchases: OptimizedPurchase[] = [];
  let totalCost = 0;
  let totalModels = 0;
  let totalPoints = 0;

  for (const item of items) {
    const [product] = await d1Query<WHProduct>(
      "SELECT * FROM wh_products WHERE id = ?",
      [item.product_id],
    );
    if (!product) continue;

    const prices = await getPricesForProduct(item.product_id);
    const bestPrice = prices.find((p) => p.in_stock) || prices[0];
    if (!bestPrice) continue;

    const totalForItem = bestPrice.price * item.quantity;
    purchases.push({
      product_id: item.product_id,
      product_name: product.name,
      quantity: item.quantity,
      retailer: bestPrice.retailer,
      unit_price: bestPrice.price,
      total_price: totalForItem,
      url: bestPrice.url,
      price_per_model: bestPrice.price_per_model,
      price_per_point: bestPrice.price_per_point,
    });

    totalCost += totalForItem;
    totalModels += product.models_in_box * item.quantity;
    totalPoints += product.points_per_unit * item.quantity;
  }

  return {
    items: purchases,
    total_cost: Math.round(totalCost * 100) / 100,
    total_models: totalModels,
    total_points: totalPoints,
    avg_price_per_model: totalModels > 0 ? Math.round((totalCost / totalModels) * 100) / 100 : 0,
    avg_price_per_point: totalPoints > 0 ? Math.round((totalCost / totalPoints) * 10000) / 10000 : 0,
  };
}

export async function getLastScrapeTime(): Promise<number | null> {
  const rows = await d1Query<{ finished_at: number }>(
    "SELECT finished_at FROM wh_scrape_log ORDER BY finished_at DESC LIMIT 1",
  );
  return rows[0]?.finished_at ?? null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/warhammer-types.ts src/lib/warhammer-db.ts
git commit -m "feat(warhammer): TypeScript types and D1 query helpers"
```

---

## Chunk 2: Python Scraper Service

### Task 3: Scraper Foundation

**Files:**
- Create: `scraper/requirements.txt`
- Create: `scraper/config.py`
- Create: `scraper/scrapers/base.py`

- [ ] **Step 1: Create requirements.txt**

```
httpx>=0.27
beautifulsoup4>=4.12
playwright>=1.40
lxml>=5.0
```

- [ ] **Step 2: Install dependencies**

```bash
cd L:/SSD-RCI_9_Unifying/cpuagen-live/scraper
pip install -r requirements.txt
playwright install chromium
```

- [ ] **Step 3: Create config.py**

```python
# scraper/config.py
import os

# Game systems we track
GAME_SYSTEMS = ["40K", "HERESY", "AOS", "KILLTEAM", "NECROMUNDA"]

# Retailer configurations
RETAILERS = {
    "miniature-market": {
        "name": "Miniature Market",
        "base_url": "https://www.miniaturemarket.com",
        "currency": "USD",
        "enabled": True,
    },
    "element-games": {
        "name": "Element Games",
        "base_url": "https://www.elementgames.co.uk",
        "currency": "GBP",
        "enabled": True,
    },
    "ebay": {
        "name": "eBay",
        "base_url": "https://api.ebay.com",
        "currency": "USD",
        "enabled": True,
    },
    "games-workshop": {
        "name": "Games Workshop",
        "base_url": "https://www.warhammer.com",
        "currency": "USD",
        "enabled": False,  # Too aggressive anti-scraping
    },
}

# eBay API credentials
EBAY_APP_ID = os.environ.get("EBAY_APP_ID", "")
EBAY_CERT_ID = os.environ.get("EBAY_CERT_ID", "")

# GBP to USD conversion (update periodically)
GBP_TO_USD = 1.27

# Scraping settings
REQUEST_DELAY = 2.0  # seconds between requests
MAX_RETRIES = 3
REQUEST_TIMEOUT = 30
```

- [ ] **Step 4: Create base scraper class**

```python
# scraper/scrapers/base.py
import time
import httpx
from abc import ABC, abstractmethod
from config import REQUEST_DELAY, MAX_RETRIES, REQUEST_TIMEOUT

class BaseScraper(ABC):
    """Base class for all Warhammer retailer scrapers."""

    def __init__(self, retailer_id: str, name: str, base_url: str, currency: str = "USD"):
        self.retailer_id = retailer_id
        self.name = name
        self.base_url = base_url
        self.currency = currency
        self.session = httpx.Client(
            timeout=REQUEST_TIMEOUT,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            },
            follow_redirects=True,
        )
        self.products_found = 0
        self.prices_updated = 0
        self.errors = 0
        self.error_details: list[str] = []

    def get(self, url: str, retries: int = MAX_RETRIES) -> httpx.Response | None:
        """HTTP GET with retry and rate limiting."""
        for attempt in range(retries):
            try:
                time.sleep(REQUEST_DELAY)
                resp = self.session.get(url)
                resp.raise_for_status()
                return resp
            except httpx.HTTPError as e:
                print(f"  [{self.name}] Attempt {attempt+1}/{retries} failed for {url}: {e}")
                if attempt == retries - 1:
                    self.errors += 1
                    self.error_details.append(f"{url}: {e}")
                    return None
                time.sleep(REQUEST_DELAY * (attempt + 1))
        return None

    @abstractmethod
    def scrape(self) -> list[dict]:
        """
        Scrape all products and prices.
        Returns list of dicts with keys:
            product_id, name, faction_id, game_system, models_in_box,
            price, url, in_stock, image_url
        """
        ...

    def make_product_id(self, game_system: str, faction: str, name: str) -> str:
        """Generate a stable product ID from game system, faction, and name."""
        import re
        slug = re.sub(r"[^a-z0-9]+", "-", f"{game_system}-{faction}-{name}".lower()).strip("-")
        return slug

    def make_faction_id(self, game_system: str, faction: str) -> str:
        """Generate a stable faction ID."""
        import re
        return re.sub(r"[^a-z0-9]+", "-", f"{game_system}-{faction}".lower()).strip("-")

    def close(self):
        self.session.close()
```

- [ ] **Step 5: Commit**

```bash
git add scraper/requirements.txt scraper/config.py scraper/scrapers/base.py
git commit -m "feat(warhammer): scraper foundation - config, base class, requirements"
```

---

### Task 4: Miniature Market Scraper

**Files:**
- Create: `scraper/scrapers/miniature_market.py`

- [ ] **Step 1: Implement Miniature Market scraper**

```python
# scraper/scrapers/miniature_market.py
import re
import json
from bs4 import BeautifulSoup
from scrapers.base import BaseScraper
from config import RETAILERS

# Miniature Market category URLs for each game system
MM_CATEGORIES = {
    "40K": "/miniatures-games/games-workshop/warhammer-40k.html",
    "AOS": "/miniatures-games/games-workshop/age-of-sigmar.html",
    "HERESY": "/miniatures-games/games-workshop/horus-heresy.html",
    "KILLTEAM": "/miniatures-games/games-workshop/warhammer-40k.html",  # Subset of 40K
    "NECROMUNDA": "/miniatures-games/games-workshop/necromunda.html",
}

# Known model counts for common box types (fallback heuristic)
BOX_MODEL_PATTERNS = [
    (r"(\d+)\s*(?:models?|miniatures?|figures?)", lambda m: int(m.group(1))),
    (r"(?:squad|unit)\s*of\s*(\d+)", lambda m: int(m.group(1))),
    (r"(\d+)\s*x\s*", lambda m: int(m.group(1))),
]


class MiniatureMarketScraper(BaseScraper):
    def __init__(self):
        cfg = RETAILERS["miniature-market"]
        super().__init__("miniature-market", cfg["name"], cfg["base_url"], cfg["currency"])

    def scrape(self) -> list[dict]:
        results = []
        for game_system, path in MM_CATEGORIES.items():
            print(f"  [{self.name}] Scraping {game_system}...")
            page = 1
            while True:
                url = f"{self.base_url}{path}?p={page}&product_list_limit=100"
                resp = self.get(url)
                if not resp:
                    break

                soup = BeautifulSoup(resp.text, "lxml")
                products = self._parse_product_list(soup, game_system)
                if not products:
                    break

                results.extend(products)
                print(f"    Page {page}: {len(products)} products")

                # Check for next page
                next_link = soup.select_one("a.action.next")
                if not next_link:
                    break
                page += 1

        self.products_found = len(results)
        self.prices_updated = len(results)
        return results

    def _parse_product_list(self, soup: BeautifulSoup, game_system: str) -> list[dict]:
        products = []

        # Try GTM data layer first (structured JSON)
        for script in soup.find_all("script"):
            text = script.string or ""
            if "dataLayer" in text and "ecommerce" in text:
                try:
                    # Extract JSON from dataLayer.push({...})
                    match = re.search(r"dataLayer\.push\((\{.*?\})\);", text, re.DOTALL)
                    if match:
                        data = json.loads(match.group(1))
                        items = (data.get("ecommerce", {}).get("impressions", []) or
                                 data.get("ecommerce", {}).get("items", []))
                        for item in items:
                            name = item.get("name", "")
                            price = float(item.get("price", 0))
                            if price <= 0:
                                continue
                            faction = self._guess_faction(name, item.get("category", ""))
                            product_id = self.make_product_id(game_system, faction, name)
                            models = self._guess_model_count(name)
                            products.append({
                                "product_id": product_id,
                                "name": name,
                                "faction_id": self.make_faction_id(game_system, faction),
                                "faction_name": faction,
                                "game_system": game_system,
                                "models_in_box": models,
                                "price": price,
                                "url": f"{self.base_url}/{item.get('id', '')}",
                                "in_stock": True,
                                "image_url": None,
                            })
                        if products:
                            return products
                except (json.JSONDecodeError, ValueError):
                    pass

        # Fallback: parse HTML product cards
        for card in soup.select(".product-item"):
            try:
                name_el = card.select_one(".product-item-link")
                price_el = card.select_one("[data-price-amount]")
                if not name_el or not price_el:
                    continue

                name = name_el.get_text(strip=True)
                price = float(price_el["data-price-amount"])
                href = name_el.get("href", "")
                img_el = card.select_one(".product-image-photo")
                image_url = img_el.get("src") if img_el else None
                in_stock = "out-of-stock" not in (card.get("class", []) or [])

                faction = self._guess_faction(name, "")
                product_id = self.make_product_id(game_system, faction, name)
                models = self._guess_model_count(name)

                products.append({
                    "product_id": product_id,
                    "name": name,
                    "faction_id": self.make_faction_id(game_system, faction),
                    "faction_name": faction,
                    "game_system": game_system,
                    "models_in_box": models,
                    "price": price,
                    "url": href,
                    "in_stock": in_stock,
                    "image_url": image_url,
                })
            except (ValueError, KeyError) as e:
                self.errors += 1
                self.error_details.append(f"Parse error: {e}")

        return products

    def _guess_faction(self, name: str, category: str) -> str:
        """Guess faction from product name. Imperfect but functional."""
        combined = f"{name} {category}".lower()
        factions = [
            "Space Marines", "Orks", "Tyranids", "Aeldari", "Drukhari",
            "Necrons", "T'au Empire", "Chaos Space Marines", "Death Guard",
            "Thousand Sons", "World Eaters", "Adeptus Custodes", "Sisters of Battle",
            "Astra Militarum", "Imperial Knights", "Chaos Knights", "Chaos Daemons",
            "Genestealer Cults", "Leagues of Votann", "Agents of the Imperium",
            "Grey Knights", "Deathwatch", "Blood Angels", "Dark Angels",
            "Space Wolves", "Black Templars", "Adeptus Mechanicus",
            # AoS factions
            "Stormcast Eternals", "Skaven", "Slaves to Darkness",
            "Orruk Warclans", "Soulblight Gravelords", "Lumineth Realm-lords",
            "Daughters of Khaine", "Idoneth Deepkin", "Fyreslayers",
            "Kharadron Overlords", "Cities of Sigmar", "Seraphon",
            "Ossiarch Bonereapers", "Flesh-eater Courts", "Nighthaunt",
            "Maggotkin of Nurgle", "Hedonites of Slaanesh", "Disciples of Tzeentch",
            "Blades of Khorne", "Ogor Mawtribes", "Sons of Behemat",
            "Gloomspite Gitz", "Sylvaneth", "Beasts of Chaos",
        ]
        for faction in factions:
            if faction.lower() in combined:
                return faction
        return "Unknown"

    def _guess_model_count(self, name: str) -> int:
        """Guess model count from product name."""
        for pattern, extractor in BOX_MODEL_PATTERNS:
            match = re.search(pattern, name, re.IGNORECASE)
            if match:
                return extractor(match)
        # Single model keywords
        if any(kw in name.lower() for kw in ["character", "hero", "lord", "warlord", "hq"]):
            return 1
        return 1  # Default to 1 if unknown
```

- [ ] **Step 2: Test the scraper manually**

```bash
cd L:/SSD-RCI_9_Unifying/cpuagen-live/scraper
python -c "
from scrapers.miniature_market import MiniatureMarketScraper
s = MiniatureMarketScraper()
results = s.scrape()
print(f'Found {len(results)} products')
if results:
    print(f'Sample: {results[0]}')
s.close()
"
```

- [ ] **Step 3: Commit**

```bash
git add scraper/scrapers/miniature_market.py
git commit -m "feat(warhammer): Miniature Market scraper with GTM data layer parsing"
```

---

### Task 5: Element Games Scraper

**Files:**
- Create: `scraper/scrapers/element_games.py`

- [ ] **Step 1: Implement Element Games scraper**

```python
# scraper/scrapers/element_games.py
import re
from bs4 import BeautifulSoup
from scrapers.base import BaseScraper
from config import RETAILERS, GBP_TO_USD

EG_CATEGORIES = {
    "40K": "/warhammer/warhammer-40k",
    "AOS": "/warhammer/age-of-sigmar",
    "HERESY": "/warhammer/horus-heresy",
    "NECROMUNDA": "/warhammer/necromunda",
    "KILLTEAM": "/warhammer/kill-team",
}


class ElementGamesScraper(BaseScraper):
    def __init__(self):
        cfg = RETAILERS["element-games"]
        super().__init__("element-games", cfg["name"], cfg["base_url"], cfg["currency"])

    def scrape(self) -> list[dict]:
        results = []
        for game_system, path in EG_CATEGORIES.items():
            print(f"  [{self.name}] Scraping {game_system}...")
            # Try AJAX search for each faction
            page_results = self._scrape_category(game_system, path)
            results.extend(page_results)
            print(f"    Found {len(page_results)} products")

        self.products_found = len(results)
        self.prices_updated = len(results)
        return results

    def _scrape_category(self, game_system: str, path: str) -> list[dict]:
        products = []
        page = 1
        while True:
            url = f"{self.base_url}{path}?p={page}"
            resp = self.get(url)
            if not resp:
                break

            soup = BeautifulSoup(resp.text, "lxml")
            page_products = self._parse_products(soup, game_system)
            if not page_products:
                break

            products.extend(page_products)

            next_link = soup.select_one("a.next")
            if not next_link:
                break
            page += 1

        return products

    def _parse_products(self, soup: BeautifulSoup, game_system: str) -> list[dict]:
        products = []
        for card in soup.select(".product-item, .product-card, .item"):
            try:
                name_el = card.select_one("a.product-item-link, .product-name a, h3 a, h2 a")
                if not name_el:
                    continue
                name = name_el.get_text(strip=True)
                href = name_el.get("href", "")

                # Look for discounted price first, then any price
                price_el = (card.select_one(".special-price .price, .our-price .price, .sale-price") or
                            card.select_one(".price"))
                if not price_el:
                    continue

                price_text = price_el.get_text(strip=True)
                price_match = re.search(r"[\d,.]+", price_text.replace(",", ""))
                if not price_match:
                    continue

                price_gbp = float(price_match.group())
                price_usd = round(price_gbp * GBP_TO_USD, 2)

                img_el = card.select_one("img")
                image_url = img_el.get("src") if img_el else None

                stock_el = card.select_one(".stock, .availability")
                in_stock = True
                if stock_el:
                    stock_text = stock_el.get_text(strip=True).lower()
                    in_stock = "out of stock" not in stock_text and "unavailable" not in stock_text

                faction = self._guess_faction(name)
                product_id = self.make_product_id(game_system, faction, name)
                models = self._guess_model_count(name)

                products.append({
                    "product_id": product_id,
                    "name": name,
                    "faction_id": self.make_faction_id(game_system, faction),
                    "faction_name": faction,
                    "game_system": game_system,
                    "models_in_box": models,
                    "price": price_usd,
                    "url": href if href.startswith("http") else f"{self.base_url}{href}",
                    "in_stock": in_stock,
                    "image_url": image_url,
                })
            except (ValueError, KeyError) as e:
                self.errors += 1
                self.error_details.append(f"EG parse error: {e}")

        return products

    def _guess_faction(self, name: str) -> str:
        """Reuse the same faction guessing logic."""
        from scrapers.miniature_market import MiniatureMarketScraper
        return MiniatureMarketScraper._guess_faction(None, name, "")

    def _guess_model_count(self, name: str) -> int:
        from scrapers.miniature_market import MiniatureMarketScraper
        return MiniatureMarketScraper._guess_model_count(None, name)
```

- [ ] **Step 2: Commit**

```bash
git add scraper/scrapers/element_games.py
git commit -m "feat(warhammer): Element Games scraper with GBP->USD conversion"
```

---

### Task 6: eBay Browse API Client

**Files:**
- Create: `scraper/scrapers/ebay_api.py`

- [ ] **Step 1: Implement eBay API client**

```python
# scraper/scrapers/ebay_api.py
import re
import base64
import httpx
from scrapers.base import BaseScraper
from config import RETAILERS, EBAY_APP_ID, EBAY_CERT_ID

# Search queries per game system
EBAY_SEARCHES = {
    "40K": [
        "Warhammer 40k new on sprue",
        "Warhammer 40000 miniatures new",
    ],
    "AOS": [
        "Age of Sigmar miniatures new on sprue",
        "Warhammer AOS new",
    ],
    "HERESY": [
        "Horus Heresy miniatures new",
        "Warhammer 30k new on sprue",
    ],
    "KILLTEAM": [
        "Kill Team box new",
    ],
    "NECROMUNDA": [
        "Necromunda gang new",
    ],
}


class EbayApiScraper(BaseScraper):
    def __init__(self):
        cfg = RETAILERS["ebay"]
        super().__init__("ebay", cfg["name"], cfg["base_url"], cfg["currency"])
        self.access_token: str | None = None

    def _get_token(self) -> str | None:
        """Get eBay OAuth token using client credentials grant."""
        if not EBAY_APP_ID or not EBAY_CERT_ID:
            print(f"  [{self.name}] No eBay API credentials configured, skipping.")
            return None

        credentials = base64.b64encode(f"{EBAY_APP_ID}:{EBAY_CERT_ID}".encode()).decode()
        resp = httpx.post(
            "https://api.ebay.com/identity/v1/oauth2/token",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {credentials}",
            },
            data={
                "grant_type": "client_credentials",
                "scope": "https://api.ebay.com/oauth/api_scope",
            },
            timeout=15,
        )
        if resp.status_code == 200:
            self.access_token = resp.json().get("access_token")
            return self.access_token
        else:
            print(f"  [{self.name}] OAuth failed: {resp.status_code} {resp.text[:200]}")
            return None

    def scrape(self) -> list[dict]:
        token = self._get_token()
        if not token:
            return []

        results = []
        for game_system, queries in EBAY_SEARCHES.items():
            for query in queries:
                print(f"  [{self.name}] Searching: {query}")
                items = self._search(query, game_system)
                results.extend(items)
                print(f"    Found {len(items)} listings")

        self.products_found = len(results)
        self.prices_updated = len(results)
        return results

    def _search(self, query: str, game_system: str) -> list[dict]:
        """Search eBay Browse API for Buy It Now listings."""
        items = []
        try:
            resp = httpx.get(
                "https://api.ebay.com/buy/browse/v1/item_summary/search",
                headers={"Authorization": f"Bearer {self.access_token}"},
                params={
                    "q": query,
                    "filter": "buyingOptions:{FIXED_PRICE},conditionIds:{1000|1500},"
                              "deliveryCountry:US,itemLocationCountry:US",
                    "sort": "price",
                    "limit": 50,
                },
                timeout=30,
            )
            if resp.status_code != 200:
                self.errors += 1
                self.error_details.append(f"eBay search failed: {resp.status_code}")
                return []

            data = resp.json()
            for item in data.get("itemSummaries", []):
                title = item.get("title", "")
                price_val = float(item.get("price", {}).get("value", 0))
                if price_val <= 0:
                    continue

                # Add shipping if available
                shipping = item.get("shippingOptions", [{}])
                if shipping:
                    ship_cost = float(shipping[0].get("shippingCost", {}).get("value", 0))
                    price_val += ship_cost

                faction = self._guess_faction(title)
                product_id = self.make_product_id(game_system, faction, title)
                models = self._guess_model_count(title)
                image = item.get("image", {}).get("imageUrl")
                url = item.get("itemWebUrl", "")

                items.append({
                    "product_id": product_id,
                    "name": title,
                    "faction_id": self.make_faction_id(game_system, faction),
                    "faction_name": faction,
                    "game_system": game_system,
                    "models_in_box": models,
                    "price": price_val,
                    "url": url,
                    "in_stock": True,
                    "image_url": image,
                })

        except Exception as e:
            self.errors += 1
            self.error_details.append(f"eBay error: {e}")

        return items

    def _guess_faction(self, name: str) -> str:
        from scrapers.miniature_market import MiniatureMarketScraper
        return MiniatureMarketScraper._guess_faction(None, name, "")

    def _guess_model_count(self, name: str) -> int:
        from scrapers.miniature_market import MiniatureMarketScraper
        return MiniatureMarketScraper._guess_model_count(None, name)
```

- [ ] **Step 2: Commit**

```bash
git add scraper/scrapers/ebay_api.py
git commit -m "feat(warhammer): eBay Browse API scraper with Buy It Now filter"
```

---

### Task 7: Wahapedia Points Scraper

**Files:**
- Create: `scraper/scrapers/wahapedia.py`

- [ ] **Step 1: Implement Wahapedia points scraper**

```python
# scraper/scrapers/wahapedia.py
import re
from playwright.sync_api import sync_playwright
from scrapers.base import BaseScraper

WAHAPEDIA_FACTIONS = {
    "40K": {
        "base": "https://wahapedia.ru/wh40k10ed/factions",
        "factions": [
            "space-marines", "orks", "tyranids", "aeldari", "drukhari",
            "necrons", "t-au-empire", "chaos-space-marines", "death-guard",
            "thousand-sons", "world-eaters", "adeptus-custodes",
            "adepta-sororitas", "astra-militarum", "imperial-knights",
            "chaos-knights", "chaos-daemons", "genestealer-cults",
            "leagues-of-votann", "agents-of-the-imperium", "grey-knights",
            "adeptus-mechanicus",
        ],
    },
    "AOS": {
        "base": "https://wahapedia.ru/aos3/factions",
        "factions": [
            "stormcast-eternals", "skaven", "slaves-to-darkness",
            "orruk-warclans", "soulblight-gravelords", "lumineth-realm-lords",
            "daughters-of-khaine", "idoneth-deepkin", "fyreslayers",
            "kharadron-overlords", "cities-of-sigmar", "seraphon",
            "ossiarch-bonereapers", "flesh-eater-courts", "nighthaunt",
            "maggotkin-of-nurgle", "hedonites-of-slaanesh",
            "disciples-of-tzeentch", "blades-of-khorne",
        ],
    },
}


class WahapediaScraper(BaseScraper):
    def __init__(self):
        super().__init__("wahapedia", "Wahapedia", "https://wahapedia.ru", "N/A")

    def scrape(self) -> list[dict]:
        """Scrape unit points from Wahapedia using Playwright."""
        results = []
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            for game_system, config in WAHAPEDIA_FACTIONS.items():
                base = config["base"]
                for faction_slug in config["factions"]:
                    url = f"{base}/{faction_slug}"
                    print(f"  [Wahapedia] Scraping {game_system}/{faction_slug}...")
                    try:
                        page.goto(url, wait_until="networkidle", timeout=30000)
                        page.wait_for_timeout(2000)  # Let JS render

                        # Extract unit names and points from the faction page
                        units = page.evaluate("""() => {
                            const results = [];
                            // Look for datasheet entries with points
                            const sheets = document.querySelectorAll(
                                '.DatasheetName, .dsName, [class*="datasheet"]'
                            );
                            sheets.forEach(el => {
                                const name = el.textContent?.trim();
                                // Find nearby points value
                                const parent = el.closest('tr, .dsRow, [class*="row"]');
                                if (parent) {
                                    const pointsEl = parent.querySelector(
                                        '.dsPts, [class*="points"], [class*="pts"]'
                                    );
                                    const points = pointsEl ?
                                        parseInt(pointsEl.textContent?.replace(/[^0-9]/g, '')) : 0;
                                    if (name) {
                                        results.push({ name, points: points || 0 });
                                    }
                                }
                            });
                            // Fallback: look for any table with unit names and points
                            if (results.length === 0) {
                                document.querySelectorAll('table tr').forEach(row => {
                                    const cells = row.querySelectorAll('td');
                                    if (cells.length >= 2) {
                                        const name = cells[0].textContent?.trim();
                                        const pts = parseInt(
                                            cells[cells.length-1].textContent?.replace(/[^0-9]/g, '')
                                        );
                                        if (name && pts > 0) {
                                            results.push({ name, points: pts });
                                        }
                                    }
                                });
                            }
                            return results;
                        }""")

                        faction_name = faction_slug.replace("-", " ").title()
                        for unit in units:
                            product_id = self.make_product_id(
                                game_system, faction_name, unit["name"]
                            )
                            results.append({
                                "product_id": product_id,
                                "name": unit["name"],
                                "faction_id": self.make_faction_id(game_system, faction_name),
                                "faction_name": faction_name,
                                "game_system": game_system,
                                "points_per_unit": unit["points"],
                            })

                        print(f"    Found {len(units)} units")

                    except Exception as e:
                        self.errors += 1
                        self.error_details.append(f"Wahapedia {faction_slug}: {e}")
                        print(f"    Error: {e}")

            browser.close()

        self.products_found = len(results)
        return results
```

- [ ] **Step 2: Commit**

```bash
git add scraper/scrapers/wahapedia.py
git commit -m "feat(warhammer): Wahapedia points scraper using Playwright"
```

---

### Task 8: Scraper Orchestrator

**Files:**
- Create: `scraper/main.py`
- Create: `scraper/run_scrape.bat`
- Create: `scraper/scrapers/__init__.py`

- [ ] **Step 1: Create __init__.py**

```python
# scraper/scrapers/__init__.py
```

- [ ] **Step 2: Create main.py orchestrator**

```python
# scraper/main.py
"""
Warhammer Price Scraper Orchestrator
Run all scrapers and write results to Cloudflare D1.
"""
import sys
import time
from datetime import datetime, timezone

from db import create_tables, upsert_faction, upsert_product, upsert_price, log_scrape
from scrapers.miniature_market import MiniatureMarketScraper
from scrapers.element_games import ElementGamesScraper
from scrapers.ebay_api import EbayApiScraper
from scrapers.wahapedia import WahapediaScraper


def run_price_scrapers():
    """Run all price scrapers and write to D1."""
    scrapers = [
        MiniatureMarketScraper(),
        ElementGamesScraper(),
        EbayApiScraper(),
    ]

    all_results = []
    for scraper in scrapers:
        started = int(datetime.now(timezone.utc).timestamp())
        print(f"\n{'='*60}")
        print(f"Running {scraper.name}...")
        print(f"{'='*60}")

        try:
            results = scraper.scrape()
            all_results.extend([(scraper.retailer_id, r) for r in results])

            # Write to D1
            for r in results:
                upsert_faction(r["faction_id"], r["faction_name"], r["game_system"])
                upsert_product(
                    product_id=r["product_id"],
                    name=r["name"],
                    faction_id=r["faction_id"],
                    game_system=r["game_system"],
                    models_in_box=r.get("models_in_box", 1),
                    image_url=r.get("image_url"),
                )
                upsert_price(
                    product_id=r["product_id"],
                    retailer=scraper.retailer_id,
                    price=r["price"],
                    currency=scraper.currency,
                    url=r.get("url"),
                    in_stock=r.get("in_stock", True),
                    models_in_box=r.get("models_in_box", 1),
                )

            log_scrape(
                scraper.retailer_id, started,
                scraper.products_found, scraper.prices_updated,
                scraper.errors, "; ".join(scraper.error_details[:5]),
            )
            print(f"  Done: {scraper.products_found} products, {scraper.errors} errors")

        except Exception as e:
            print(f"  FATAL: {scraper.name} failed: {e}")
            log_scrape(scraper.retailer_id, started, 0, 0, 1, str(e))

        finally:
            scraper.close()

    return all_results


def run_points_scraper():
    """Run Wahapedia points scraper and update product points."""
    print(f"\n{'='*60}")
    print("Running Wahapedia Points Scraper...")
    print(f"{'='*60}")

    started = int(datetime.now(timezone.utc).timestamp())
    scraper = WahapediaScraper()

    try:
        results = scraper.scrape()
        for r in results:
            # Update points on matching products
            from db import d1_query
            d1_query(
                "UPDATE wh_products SET points_per_unit = ?, updated_at = ? WHERE id = ? AND points_per_unit = 0",
                [r["points_per_unit"], int(datetime.now(timezone.utc).timestamp()), r["product_id"]],
            )
            # Also recalculate price_per_point for all prices of this product
            if r["points_per_unit"] > 0:
                d1_query(
                    """UPDATE wh_prices SET price_per_point = ROUND(price / ?, 4)
                       WHERE product_id = ?""",
                    [r["points_per_unit"], r["product_id"]],
                )

        log_scrape("wahapedia", started, scraper.products_found, 0, scraper.errors,
                   "; ".join(scraper.error_details[:5]))
        print(f"  Done: {scraper.products_found} units with points data")

    except Exception as e:
        print(f"  FATAL: Wahapedia failed: {e}")
        log_scrape("wahapedia", started, 0, 0, 1, str(e))


def main():
    print("Warhammer Price Scraper")
    print(f"Started: {datetime.now(timezone.utc).isoformat()}")
    print()

    # Ensure tables exist
    create_tables()

    # Run price scrapers
    run_price_scrapers()

    # Run points scraper
    run_points_scraper()

    print(f"\nCompleted: {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Create Windows batch launcher**

```batch
@echo off
REM scraper/run_scrape.bat
echo Starting Warhammer Price Scraper...
cd /d "%~dp0"
python main.py
echo.
echo Scrape complete.
pause
```

- [ ] **Step 4: Commit**

```bash
git add scraper/main.py scraper/run_scrape.bat scraper/scrapers/__init__.py
git commit -m "feat(warhammer): scraper orchestrator - runs all scrapers, writes to D1"
```

---

## Chunk 3: Next.js API Routes

### Task 9: Products API

**Files:**
- Create: `src/app/api/warhammer/products/route.ts`

- [ ] **Step 1: Create products API route**

```typescript
// src/app/api/warhammer/products/route.ts
import { NextRequest } from "next/server";
import { searchProducts, getProductsWithBestPrices, getFactions } from "@/lib/warhammer-db";
import type { GameSystem } from "@/lib/warhammer-types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action") || "search";
  const query = searchParams.get("q") || "";
  const gameSystem = searchParams.get("game_system") as GameSystem | null;
  const factionId = searchParams.get("faction_id") || undefined;
  const sortBy = (searchParams.get("sort") || "price_per_model") as
    "price_per_model" | "price_per_point" | "price";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    if (action === "factions") {
      const factions = await getFactions(gameSystem || undefined);
      return Response.json({ ok: true, factions });
    }

    if (action === "search" && query) {
      const products = await searchProducts(query, gameSystem || undefined, factionId);
      return Response.json({ ok: true, products });
    }

    if (action === "browse") {
      const products = await getProductsWithBestPrices(
        gameSystem || undefined, factionId, sortBy, limit, offset,
      );
      return Response.json({ ok: true, products });
    }

    return Response.json({ ok: false, error: "Invalid action or missing query" }, { status: 400 });
  } catch (error) {
    console.error("Warhammer products API error:", error);
    return Response.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/warhammer/products/route.ts
git commit -m "feat(warhammer): products API route with search, browse, factions"
```

---

### Task 10: Prices API

**Files:**
- Create: `src/app/api/warhammer/prices/route.ts`

- [ ] **Step 1: Create prices API route**

```typescript
// src/app/api/warhammer/prices/route.ts
import { NextRequest } from "next/server";
import { getPricesForProduct, getLastScrapeTime } from "@/lib/warhammer-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const productId = searchParams.get("product_id");

  if (!productId) {
    return Response.json({ ok: false, error: "product_id required" }, { status: 400 });
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
    return Response.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/warhammer/prices/route.ts
git commit -m "feat(warhammer): prices API route"
```

---

### Task 11: Army Optimizer API

**Files:**
- Create: `src/app/api/warhammer/optimize/route.ts`

- [ ] **Step 1: Create optimizer API route**

```typescript
// src/app/api/warhammer/optimize/route.ts
import { NextRequest } from "next/server";
import { optimizeArmyPurchase } from "@/lib/warhammer-db";
import type { ArmyListItem } from "@/lib/warhammer-types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { items: ArmyListItem[] };
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return Response.json({ ok: false, error: "items array required" }, { status: 400 });
    }

    if (body.items.length > 50) {
      return Response.json({ ok: false, error: "Max 50 items per optimization" }, { status: 400 });
    }

    const result = await optimizeArmyPurchase(body.items);
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error("Warhammer optimize API error:", error);
    return Response.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/warhammer/optimize/route.ts
git commit -m "feat(warhammer): army optimizer API route"
```

---

## Chunk 4: Frontend UI

### Task 12: Shared Components

**Files:**
- Create: `src/app/app/warhammer/components/PriceTable.tsx`
- Create: `src/app/app/warhammer/components/UnitCard.tsx`

- [ ] **Step 1: Create PriceTable component**

```tsx
// src/app/app/warhammer/components/PriceTable.tsx
"use client";

import type { WHPrice } from "@/lib/warhammer-types";
import { RETAILER_NAMES } from "@/lib/warhammer-types";

interface PriceTableProps {
  prices: WHPrice[];
  modelsInBox: number;
  pointsPerUnit: number;
}

export default function PriceTable({ prices, modelsInBox, pointsPerUnit }: PriceTableProps) {
  if (prices.length === 0) {
    return <p className="text-muted text-sm">No prices found.</p>;
  }

  const bestPpm = Math.min(...prices.filter((p) => p.in_stock).map((p) => p.price_per_model));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="py-2 px-3">Retailer</th>
            <th className="py-2 px-3 text-right">Price</th>
            <th className="py-2 px-3 text-right">$/Model</th>
            {pointsPerUnit > 0 && <th className="py-2 px-3 text-right">$/Point</th>}
            <th className="py-2 px-3 text-center">Stock</th>
            <th className="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {prices.map((price) => {
            const isBest = price.in_stock && price.price_per_model === bestPpm;
            return (
              <tr
                key={price.id}
                className={`border-b border-border/50 ${isBest ? "bg-success/10" : ""} ${!price.in_stock ? "opacity-50" : ""}`}
              >
                <td className="py-2 px-3 font-medium">
                  {RETAILER_NAMES[price.retailer] || price.retailer}
                  {isBest && <span className="ml-2 text-xs text-success font-bold">BEST</span>}
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
```

- [ ] **Step 2: Create UnitCard component**

```tsx
// src/app/app/warhammer/components/UnitCard.tsx
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
        <span>{product.models_in_box} model{product.models_in_box !== 1 ? "s" : ""}</span>
        {product.points_per_unit > 0 && <span>{product.points_per_unit} pts</span>}
        {product.best_retailer && (
          <span className="text-success">
            {RETAILER_NAMES[product.best_retailer] || product.best_retailer}
          </span>
        )}
      </div>

      {product.best_price_per_point !== null && product.best_price_per_point > 0 && (
        <div className="mt-1 text-xs text-muted">
          ${product.best_price_per_point.toFixed(4)}/pt
        </div>
      )}

      <div className="mt-2 text-xs text-muted">
        {product.prices.length} retailer{product.prices.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/warhammer/components/PriceTable.tsx src/app/app/warhammer/components/UnitCard.tsx
git commit -m "feat(warhammer): PriceTable and UnitCard shared components"
```

---

### Task 13: Search Tab

**Files:**
- Create: `src/app/app/warhammer/components/SearchTab.tsx`

- [ ] **Step 1: Create SearchTab component**

```tsx
// src/app/app/warhammer/components/SearchTab.tsx
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
  const [selectedProduct, setSelectedProduct] = useState<WHProductWithPrices | null>(null);
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
        // Enrich with prices
        const enriched: WHProductWithPrices[] = [];
        for (const product of data.products.slice(0, 20)) {
          const priceRes = await fetch(`/api/warhammer/prices?product_id=${product.id}`);
          const priceData = await priceRes.json();
          const prices = priceData.ok ? priceData.prices : [];
          const inStock = prices.filter((p: { in_stock: boolean }) => p.in_stock);
          const best = inStock[0] || null;
          enriched.push({
            ...product,
            prices,
            best_price_per_model: best?.price_per_model ?? null,
            best_price_per_point: best?.price_per_point ?? null,
            best_retailer: best?.retailer ?? null,
          });
        }
        setResults(enriched);
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
            <option key={gs.id} value={gs.id}>{gs.name}</option>
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
        <p className="text-muted text-center py-8">No results found for "{query}"</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/app/warhammer/components/SearchTab.tsx
git commit -m "feat(warhammer): SearchTab component with unit search and price comparison"
```

---

### Task 14: Browse Tab

**Files:**
- Create: `src/app/app/warhammer/components/BrowseTab.tsx`

- [ ] **Step 1: Create BrowseTab component**

```tsx
// src/app/app/warhammer/components/BrowseTab.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import type { WHFaction, WHProductWithPrices, GameSystem } from "@/lib/warhammer-types";
import { GAME_SYSTEMS } from "@/lib/warhammer-types";
import PriceTable from "./PriceTable";
import UnitCard from "./UnitCard";

type SortBy = "price_per_model" | "price_per_point" | "price";

export default function BrowseTab() {
  const [gameSystem, setGameSystem] = useState<GameSystem>("40K");
  const [factions, setFactions] = useState<WHFaction[]>([]);
  const [selectedFaction, setSelectedFaction] = useState<string>("");
  const [products, setProducts] = useState<WHProductWithPrices[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<WHProductWithPrices | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("price_per_model");
  const [loading, setLoading] = useState(false);

  // Load factions when game system changes
  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/warhammer/products?action=factions&game_system=${gameSystem}`);
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
      {/* Filters */}
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

      {/* Faction selector */}
      <div className="flex gap-2">
        <select
          value={selectedFaction}
          onChange={(e) => setSelectedFaction(e.target.value)}
          className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-foreground"
        >
          <option value="">Select a faction...</option>
          {factions.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
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
        <p className="text-muted text-center py-8">No products found for this faction.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/app/warhammer/components/BrowseTab.tsx
git commit -m "feat(warhammer): BrowseTab component with faction browsing and sorting"
```

---

### Task 15: Army Builder Tab

**Files:**
- Create: `src/app/app/warhammer/components/ArmyBuilderTab.tsx`

- [ ] **Step 1: Create ArmyBuilderTab component**

```tsx
// src/app/app/warhammer/components/ArmyBuilderTab.tsx
"use client";

import { useState, useCallback } from "react";
import type { WHProduct, ArmyOptimizationResult, GameSystem } from "@/lib/warhammer-types";
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
      setArmyList(armyList.map((i) =>
        i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
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
    setArmyList(armyList.map((i) =>
      i.product.id === productId ? { ...i, quantity } : i
    ));
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
        <h3 className="text-sm font-medium text-muted mb-2">Add Units to Army List</h3>
        <div className="flex gap-2">
          <select
            value={gameSystem}
            onChange={(e) => setGameSystem(e.target.value as GameSystem)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
          >
            {GAME_SYSTEMS.map((gs) => (
              <option key={gs.id} value={gs.id}>{gs.name}</option>
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
                  {product.models_in_box} model{product.models_in_box !== 1 ? "s" : ""}
                  {product.points_per_unit > 0 && ` / ${product.points_per_unit} pts`}
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
              Army List ({armyList.reduce((sum, i) => sum + i.quantity, 0)} boxes)
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
              <div key={item.product.id} className="flex items-center gap-3 text-sm">
                <button
                  onClick={() => removeFromArmy(item.product.id)}
                  className="text-danger hover:text-danger/80 text-xs"
                >
                  x
                </button>
                <span className="flex-1">{item.product.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    className="w-6 h-6 bg-background border border-border rounded text-center hover:border-accent/50"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
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
          <h3 className="text-sm font-medium text-muted mb-3">Optimized Shopping List</h3>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-background rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-accent">${result.total_cost.toFixed(2)}</div>
              <div className="text-xs text-muted">Total Cost</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{result.total_models}</div>
              <div className="text-xs text-muted">Total Models</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{result.total_points}</div>
              <div className="text-xs text-muted">Total Points</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-success">${result.avg_price_per_model.toFixed(2)}</div>
              <div className="text-xs text-muted">Avg $/Model</div>
            </div>
          </div>

          {/* Item breakdown */}
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
                  <td className="py-2 px-2 text-right font-mono">${item.unit_price.toFixed(2)}</td>
                  <td className="py-2 px-2 text-right font-mono">${item.total_price.toFixed(2)}</td>
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
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/app/warhammer/components/ArmyBuilderTab.tsx
git commit -m "feat(warhammer): ArmyBuilderTab with unit search, list building, and price optimization"
```

---

### Task 16: Main Warhammer Page

**Files:**
- Create: `src/app/app/warhammer/page.tsx`

- [ ] **Step 1: Create the main page**

```tsx
// src/app/app/warhammer/page.tsx
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
        // Fetch any product to get last scrape time
        const res = await fetch("/api/warhammer/prices?product_id=_check_time");
        const data = await res.json();
        if (data.last_updated) {
          const date = new Date(data.last_updated * 1000);
          setLastUpdated(date.toLocaleString());
        }
      } catch { /* ignore */ }
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
```

- [ ] **Step 2: Verify it doesn't appear in navigation**

Check `src/app/app/layout.tsx` — confirm there is NO link to `/app/warhammer` in the sidebar. The route exists but is only accessible by direct URL.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/warhammer/page.tsx
git commit -m "feat(warhammer): main page with Search/Browse/Army Builder tabs (hidden route)"
```

---

## Chunk 5: Integration & Testing

### Task 17: Manual Integration Test

- [ ] **Step 1: Run the scraper to populate data**

```bash
cd L:/SSD-RCI_9_Unifying/cpuagen-live/scraper
set CF_API_TOKEN=<your-token>
python main.py
```

Verify: Products and prices appear in D1 database.

- [ ] **Step 2: Start the dev server**

```bash
cd L:/SSD-RCI_9_Unifying/cpuagen-live
npm run dev
```

- [ ] **Step 3: Navigate to the hidden page**

Open `http://localhost:3000/app/warhammer` (after passing site password gate).

Verify:
- Page loads with three tabs (Search, Browse, Army Builder)
- Search returns results with price comparison tables
- Browse shows factions and products sorted by price-per-model
- Army Builder allows adding units and shows optimized shopping list
- "Buy" links open retailer pages in new tabs
- No link to this page exists in the sidebar navigation

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(warhammer): integration fixes from manual testing"
```

---

### Task 18: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
cd L:/SSD-RCI_9_Unifying/cpuagen-live
git push origin main
```

Vercel auto-deploys from GitHub push.

- [ ] **Step 2: Verify production**

Navigate to `https://cpuagen.com/app/warhammer` (after site password).
Confirm all three modes work with live D1 data.

- [ ] **Step 3: Set up scraper schedule**

Option A — Windows Task Scheduler:
```
schtasks /create /tn "WH Price Scraper" /tr "L:\SSD-RCI_9_Unifying\cpuagen-live\scraper\run_scrape.bat" /sc daily /st 04:00 /ri 720
```

Option B — GitHub Actions (create `.github/workflows/scrape.yml`):
```yaml
name: Warhammer Price Scrape
on:
  schedule:
    - cron: '0 */12 * * *'  # Every 12 hours
  workflow_dispatch:
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r scraper/requirements.txt
      - run: playwright install chromium
      - run: python scraper/main.py
        env:
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          EBAY_APP_ID: ${{ secrets.EBAY_APP_ID }}
          EBAY_CERT_ID: ${{ secrets.EBAY_CERT_ID }}
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(warhammer): complete price finder with scraper, UI, and scheduling"
```
