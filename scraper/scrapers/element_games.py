"""
Element Games scraper — UK retailer with discount pricing.
Prices are in GBP and converted to USD.
"""
import re

from bs4 import BeautifulSoup

from config import GBP_TO_USD, RETAILERS
from scrapers.base import BaseScraper
from scrapers.faction_list import guess_faction, guess_model_count

EG_CATEGORIES = {
    "40K": "/games-workshop/warhammer-40k",
    "AOS": "/games-workshop/new-warhammer-age-of-sigmar",
    "HERESY": "/games-workshop/horus-heresy-miniatures",
    "KILLTEAM": "/games-workshop/warhammer-40k/warhammer-40000-kill-team",
    "NECROMUNDA": "/games-workshop/warhammer-40k/necromunda",
}


class ElementGamesScraper(BaseScraper):
    def __init__(self):
        cfg = RETAILERS["element-games"]
        super().__init__("element-games", cfg["name"], cfg["base_url"], cfg["currency"])

    def scrape(self) -> list[dict]:
        results = []
        for game_system, path in EG_CATEGORIES.items():
            print(f"  [{self.name}] Scraping {game_system}...")
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
                name_el = card.select_one(
                    "a.product-item-link, .product-name a, h3 a, h2 a"
                )
                if not name_el:
                    continue
                name = name_el.get_text(strip=True)
                href = name_el.get("href", "")

                # Look for discounted price first, then any price
                price_el = card.select_one(
                    ".special-price .price, .our-price .price, .sale-price"
                ) or card.select_one(".price")
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
                    in_stock = (
                        "out of stock" not in stock_text
                        and "unavailable" not in stock_text
                    )

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
            except (ValueError, KeyError) as e:
                self.errors += 1
                self.error_details.append(f"EG parse error: {e}")

        return products
