"""
Warhammer Price Tracker — Cloudflare D1 Database Helpers
Creates tables, upserts products/prices/factions, logs scrape runs.
"""
import hashlib
import os
from datetime import datetime, timezone

import httpx

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


def upsert_faction(faction_id: str, name: str, game_system: str):
    now = int(datetime.now(timezone.utc).timestamp())
    d1_query(
        """INSERT INTO wh_factions (id, name, game_system, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name=?, game_system=?, updated_at=?""",
        [faction_id, name, game_system, now, name, game_system, now],
    )


def upsert_product(
    product_id: str,
    name: str,
    faction_id: str,
    game_system: str,
    models_in_box: int = 1,
    points_per_unit: int = 0,
    gw_sku: str | None = None,
    image_url: str | None = None,
    keywords: str | None = None,
):
    now = int(datetime.now(timezone.utc).timestamp())
    d1_query(
        """INSERT INTO wh_products (id, name, faction_id, game_system, models_in_box,
           points_per_unit, gw_sku, image_url, keywords, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name=?, models_in_box=?, points_per_unit=?,
           gw_sku=?, image_url=?, keywords=?, updated_at=?""",
        [
            product_id, name, faction_id, game_system, models_in_box,
            points_per_unit, gw_sku, image_url, keywords, now,
            name, models_in_box, points_per_unit, gw_sku, image_url, keywords, now,
        ],
    )


def upsert_price(
    product_id: str,
    retailer: str,
    price: float,
    currency: str = "USD",
    url: str | None = None,
    in_stock: bool = True,
    models_in_box: int = 1,
    points_per_unit: int = 0,
):
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
        [
            price_id, product_id, retailer, price, currency, url,
            1 if in_stock else 0, ppm, ppp, now,
            price, currency, url, 1 if in_stock else 0, ppm, ppp, now,
        ],
    )


def log_scrape(
    retailer: str,
    started: int,
    products: int,
    prices: int,
    errors: int,
    details: str = "",
):
    finished = int(datetime.now(timezone.utc).timestamp())
    d1_query(
        """INSERT INTO wh_scrape_log (retailer, started_at, finished_at,
           products_found, prices_updated, errors, error_details)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        [retailer, started, finished, products, prices, errors, details],
    )
