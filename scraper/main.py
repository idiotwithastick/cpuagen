"""
Warhammer Price Scraper Orchestrator
Run all scrapers and write results to Cloudflare D1.

Usage:
    python main.py              # Run all scrapers
    python main.py --prices     # Run price scrapers only
    python main.py --points     # Run points scraper only
"""
import sys
from datetime import datetime, timezone

from db import create_tables, d1_query, log_scrape, upsert_faction, upsert_price, upsert_product
from scrapers.ebay_api import EbayApiScraper
from scrapers.element_games import ElementGamesScraper
from scrapers.miniature_market import MiniatureMarketScraper
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
        print(f"\n{'=' * 60}")
        print(f"Running {scraper.name}...")
        print(f"{'=' * 60}")

        try:
            results = scraper.scrape()
            all_results.extend([(scraper.retailer_id, r) for r in results])

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
                scraper.retailer_id,
                started,
                scraper.products_found,
                scraper.prices_updated,
                scraper.errors,
                "; ".join(scraper.error_details[:5]),
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
    print(f"\n{'=' * 60}")
    print("Running Wahapedia Points Scraper...")
    print(f"{'=' * 60}")

    started = int(datetime.now(timezone.utc).timestamp())
    scraper = WahapediaScraper()

    try:
        results = scraper.scrape()
        for r in results:
            now = int(datetime.now(timezone.utc).timestamp())
            d1_query(
                "UPDATE wh_products SET points_per_unit = ?, updated_at = ? WHERE id = ? AND points_per_unit = 0",
                [r["points_per_unit"], now, r["product_id"]],
            )
            if r["points_per_unit"] > 0:
                d1_query(
                    "UPDATE wh_prices SET price_per_point = ROUND(price / ?, 4) WHERE product_id = ?",
                    [r["points_per_unit"], r["product_id"]],
                )

        log_scrape(
            "wahapedia",
            started,
            scraper.products_found,
            0,
            scraper.errors,
            "; ".join(scraper.error_details[:5]),
        )
        print(f"  Done: {scraper.products_found} units with points data")

    except Exception as e:
        print(f"  FATAL: Wahapedia failed: {e}")
        log_scrape("wahapedia", started, 0, 0, 1, str(e))


def main():
    print("Warhammer Price Scraper")
    print(f"Started: {datetime.now(timezone.utc).isoformat()}")
    print()

    create_tables()

    mode = sys.argv[1] if len(sys.argv) > 1 else "--all"

    if mode in ("--all", "--prices"):
        run_price_scrapers()

    if mode in ("--all", "--points"):
        run_points_scraper()

    print(f"\nCompleted: {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
