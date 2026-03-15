"""
Element Games scraper — UK retailer with discount pricing.
Prices are in GBP and converted to USD.
Uses Playwright because the site renders product listings via JavaScript.

Site structure:
  /games-workshop/warhammer-40k        -> subcategory index (armies list)
  /games-workshop/warhammer-40k/orks   -> product listing page
  Products use: .productgrid > .productinfo, .price/.oldprice for pricing
"""
import re

from config import GBP_TO_USD, RETAILERS
from scrapers.base import BaseScraper
from scrapers.faction_list import guess_faction, guess_model_count

# Top-level category paths — these are subcategory indexes
EG_CATEGORIES = {
    "40K": "/games-workshop/warhammer-40k",
    "AOS": "/games-workshop/new-warhammer-age-of-sigmar",
    "HERESY": "/games-workshop/horus-heresy-miniatures",
    "KILLTEAM": "/games-workshop/warhammer-40k/warhammer-40000-kill-team",
    "NECROMUNDA": "/games-workshop/warhammer-40k/necromunda",
}

# Subcategory paths to exclude (non-product pages)
EG_EXCLUDE_SLUGS = {
    "essentials", "scenery", "accessories", "paints", "tools",
    "citadel", "start-collecting", "starter-sets", "bundles",
    "age-of-sigmar-essentials", "age-of-sigmar-scenery",
    "warhammer-40k-essentials", "warhammer-40k-scenery",
}


class ElementGamesScraper(BaseScraper):
    def __init__(self):
        cfg = RETAILERS["element-games"]
        super().__init__("element-games", cfg["name"], cfg["base_url"], cfg["currency"])

    def scrape(self) -> list[dict]:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print(f"  [{self.name}] Playwright not installed, skipping.")
            return []

        results = []
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                )
            )
            pw_page = context.new_page()

            for game_system, path in EG_CATEGORIES.items():
                print(f"  [{self.name}] Scraping {game_system}...")

                # Discover subcategory URLs from the category index page
                subcats = self._discover_subcategories(pw_page, path)

                if subcats:
                    # Filter: only keep subcategories that are actual category pages.
                    # Element Games mixes category links and individual product links
                    # at the same level in the nav. We detect categories by:
                    #  1. Checking if the link is in the sidebar nav (not the product grid)
                    #  2. Short generic slug names (armies, forces, factions)
                    filtered = self._filter_subcategories(pw_page, subcats)

                    # Scrape each subcategory
                    for sub_name, sub_path in filtered:
                        print(f"    Subcategory: {sub_name}")
                        sub_products = self._scrape_product_page(pw_page, game_system, sub_path)
                        results.extend(sub_products)
                        if sub_products:
                            print(f"      {len(sub_products)} products")
                else:
                    # The path itself might be a product listing page
                    page_results = self._scrape_product_page(pw_page, game_system, path)
                    results.extend(page_results)

                total_for_system = sum(1 for r in results if r["game_system"] == game_system)
                print(f"    Total for {game_system}: {total_for_system} products")

            browser.close()

        self.products_found = len(results)
        self.prices_updated = len(results)
        return results

    def _filter_subcategories(self, pw_page, subcats: list[tuple[str, str]]) -> list[tuple[str, str]]:
        """Filter subcategories to only include real category pages, not products."""
        # Use the sidebar nav to identify real categories — they appear in nav-column links
        nav_paths = pw_page.evaluate(
            """() => {
            const navPaths = new Set();
            document.querySelectorAll('.nav-column a, .bluecats a, nav a').forEach(a => {
                let path = (a.href || '').replace('https://www.elementgames.co.uk', '');
                if (path) navPaths.add(path.replace(/\\/$/, ''));
            });
            return [...navPaths];
        }"""
        )
        nav_set = set(nav_paths)

        filtered = []
        for sub_name, sub_path in subcats:
            clean_path = sub_path.rstrip("/")
            slug = clean_path.split("/")[-1]

            # Skip known non-product categories
            if any(ex in slug.lower() for ex in EG_EXCLUDE_SLUGS):
                continue

            # Must be in sidebar navigation to be a real category
            if clean_path in nav_set:
                filtered.append((sub_name, sub_path))

        return filtered

    def _discover_subcategories(self, pw_page, path: str) -> list[tuple[str, str]]:
        """Navigate to a category index and extract subcategory links."""
        url = f"{self.base_url}{path}"
        try:
            pw_page.goto(url, wait_until="domcontentloaded", timeout=45000)
            pw_page.wait_for_timeout(3000)
        except Exception as e:
            self.errors += 1
            self.error_details.append(f"EG discover error {url}: {e}")
            return []

        base_url = self.base_url
        exclude = EG_EXCLUDE_SLUGS
        parent_path = path.rstrip("/")

        subcats = pw_page.evaluate(
            """([basePath, baseUrl, excludeList]) => {
            const results = [];
            const seen = new Set();
            document.querySelectorAll('a').forEach(a => {
                const href = a.href || '';
                const text = (a.textContent || '').trim();
                // Must be under our parent path
                if (!href.includes(basePath) || text.length < 2) return;
                // Extract the path portion
                let path = href.replace(baseUrl, '');
                if (!path.startsWith('/')) path = '/' + path;
                // Must be a child of basePath (deeper by one level)
                if (path === basePath || path === basePath + '/') return;
                if (!path.startsWith(basePath + '/')) return;
                // Get the slug after basePath
                const remainder = path.slice(basePath.length + 1);
                // Only one level deep
                if (remainder.includes('/') || !remainder) return;
                // Exclude non-product slugs
                if (excludeList.some(ex => remainder.includes(ex))) return;
                if (seen.has(path)) return;
                seen.add(path);
                results.push([text, path]);
            });
            return results;
        }""",
            [parent_path, base_url, list(exclude)],
        )

        return subcats

    def _scrape_product_page(self, pw_page, game_system: str, path: str) -> list[dict]:
        """Scrape products from a single product listing page (may have pagination)."""
        products = []
        page_num = 1

        while True:
            url = f"{self.base_url}{path}?p={page_num}" if page_num > 1 else f"{self.base_url}{path}"
            try:
                pw_page.goto(url, wait_until="domcontentloaded", timeout=45000)
                # Wait for product grid to appear
                try:
                    pw_page.wait_for_selector(".productgrid, .productinfo", timeout=10000)
                except Exception:
                    pass
                pw_page.wait_for_timeout(2000)
            except Exception as e:
                self.errors += 1
                self.error_details.append(f"EG page error {url}: {e}")
                break

            page_products = pw_page.evaluate(
                """(gbpToUsd) => {
                const results = [];
                // Element Games uses .productgrid containers
                const cards = document.querySelectorAll('.productgrid');
                cards.forEach(card => {
                    try {
                        // Product name — look in .productinfo for links
                        const nameEl = card.querySelector('.productinfo a, a[title]');
                        if (!nameEl) return;
                        const name = (nameEl.textContent || nameEl.getAttribute('title') || '').trim();
                        if (!name) return;
                        const href = nameEl.href || '';

                        // Price — prefer .price (discounted), fall back to .oldprice (RRP)
                        const priceEl = card.querySelector('.price');
                        const oldPriceEl = card.querySelector('.oldprice');
                        const priceText = priceEl ? priceEl.textContent.trim() : '';
                        const priceMatch = priceText.replace(/[^0-9.]/g, '');
                        const price = parseFloat(priceMatch);
                        if (!price || price <= 0) return;

                        // Image
                        const imgEl = card.querySelector('img');
                        const imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';

                        // Stock — check for out-of-stock indicators
                        const stockEl = card.querySelector('.stock_popup, .outofstock, .nostock');
                        let inStock = true;
                        if (stockEl) {
                            const stockText = (stockEl.textContent || '').toLowerCase();
                            if (stockText.includes('out of stock') || stockText.includes('sold out')) {
                                inStock = false;
                            }
                        }

                        results.push({
                            name,
                            priceGbp: price,
                            priceUsd: Math.round(price * gbpToUsd * 100) / 100,
                            href,
                            imageUrl,
                            inStock,
                        });
                    } catch (e) {}
                });
                return results;
            }""",
                GBP_TO_USD,
            )

            if not page_products:
                break

            for item in page_products:
                name = item["name"]
                price_usd = item["priceUsd"]
                href = item["href"]
                image_url = item.get("imageUrl") or None
                in_stock = item.get("inStock", True)

                faction = guess_faction(name)
                product_id = self.make_product_id(game_system, faction, name)
                models = guess_model_count(name)

                products.append(
                    {
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
                    }
                )

            # Check for next page — look for pagination
            has_next = pw_page.evaluate(
                """() => {
                // Check if there are more pages
                const pageLinks = document.querySelectorAll('.pagination a, .pager a, .pages a');
                let currentPage = 0;
                let maxPage = 0;
                pageLinks.forEach(a => {
                    const num = parseInt(a.textContent.trim());
                    if (num > maxPage) maxPage = num;
                    if (a.classList.contains('active') || a.classList.contains('current')) {
                        currentPage = num;
                    }
                });
                if (maxPage > currentPage && currentPage > 0) return true;

                // Also check for a "next" link
                const next = document.querySelector(
                    'a.next, a[rel="next"], .pagination .next, li.next a'
                );
                return !!next;
            }"""
            )

            if not has_next or page_num >= 30:
                break
            page_num += 1

        return products
