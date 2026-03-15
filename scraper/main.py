"""
Warhammer Price Scraper Orchestrator
Run all scrapers and write results to Cloudflare D1.

Usage:
    python main.py              # Run all scrapers
    python main.py --prices     # Run price scrapers only
    python main.py --points     # Run points scraper only
    python main.py --dry-run    # Scrape only, don't write to DB
    python main.py --prices --dry-run  # Combine flags
"""
import os
import sys
from datetime import datetime, timezone

from scrapers.ebay_api import EbayApiScraper
from scrapers.element_games import ElementGamesScraper
from scrapers.miniature_market import MiniatureMarketScraper
from scrapers.wahapedia import WahapediaScraper


def _db_available():
    """Check if Cloudflare D1 credentials are configured."""
    return bool(os.environ.get("CF_API_TOKEN"))


def run_price_scrapers(dry_run: bool = False):
    """Run all price scrapers and optionally write to D1."""
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

            if not dry_run and _db_available():
                from db import log_scrape, upsert_faction, upsert_price, upsert_product
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

            # Print summary with sample products
            print(f"  Done: {scraper.products_found} products, {scraper.errors} errors")
            if results:
                print(f"  Sample products:")
                for r in results[:5]:
                    stock = "IN STOCK" if r.get("in_stock") else "OUT OF STOCK"
                    print(f"    ${r['price']:.2f} | {r['name'][:60]} | {r['game_system']} | {stock}")
                if len(results) > 5:
                    print(f"    ... and {len(results) - 5} more")
            if scraper.error_details:
                print(f"  Errors: {'; '.join(scraper.error_details[:3])}")

        except Exception as e:
            print(f"  FATAL: {scraper.name} failed: {e}")
            import traceback
            traceback.print_exc()
            if not dry_run and _db_available():
                from db import log_scrape
                log_scrape(scraper.retailer_id, started, 0, 0, 1, str(e))

        finally:
            scraper.close()

    return all_results


def run_points_scraper(dry_run: bool = False):
    """Run Wahapedia points scraper and update product points."""
    print(f"\n{'=' * 60}")
    print("Running Wahapedia Points Scraper...")
    print(f"{'=' * 60}")

    started = int(datetime.now(timezone.utc).timestamp())
    scraper = WahapediaScraper()

    try:
        results = scraper.scrape()

        if not dry_run and _db_available():
            from db import d1_query, log_scrape
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
        if results:
            print(f"  Sample units:")
            for r in results[:5]:
                print(f"    {r['points_per_unit']:>4} pts | {r['name'][:50]} | {r['faction_name']} | {r['game_system']}")
            if len(results) > 5:
                print(f"    ... and {len(results) - 5} more")

    except Exception as e:
        print(f"  FATAL: Wahapedia failed: {e}")
        import traceback
        traceback.print_exc()
        if not dry_run and _db_available():
            from db import log_scrape
            log_scrape("wahapedia", started, 0, 0, 1, str(e))


def main():
    print("Warhammer Price Scraper")
    print(f"Started: {datetime.now(timezone.utc).isoformat()}")
    print()

    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    modes = [a for a in args if a != "--dry-run"]
    mode = modes[0] if modes else "--all"

    if dry_run:
        print("** DRY RUN — scraping only, no DB writes **\n")
    elif _db_available():
        from db import create_tables
        create_tables()
    else:
        print("** No CF_API_TOKEN set — running in dry-run mode **\n")
        dry_run = True

    if mode in ("--all", "--prices"):
        run_price_scrapers(dry_run=dry_run)

    if mode in ("--all", "--points"):
        run_points_scraper(dry_run=dry_run)

    print(f"\nCompleted: {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
