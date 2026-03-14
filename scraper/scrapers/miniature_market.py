"""
Miniature Market scraper — US retailer with Shopware 6 platform.
Uses GTM data layer JSON for structured product data, falls back to HTML parsing.
"""
import json
import re

from bs4 import BeautifulSoup

from config import RETAILERS
from scrapers.base import BaseScraper
from scrapers.faction_list import guess_faction, guess_model_count

# Category URLs per game system
MM_CATEGORIES = {
    "40K": "/miniatures-games/games-workshop/40k.html",
    "AOS": "/miniatures-games/games-workshop/sigmar.html",
    "HERESY": "/miniatures-games/games-workshop/horus-heresy.html",
    "KILLTEAM": "/miniatures-games/games-workshop/40k.html",
    "NECROMUNDA": "/miniatures-games/games-workshop/necromunda.html",
}


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

                # Check for next page — try multiple selector patterns
                next_link = (
                    soup.select_one("a.action.next")
                    or soup.select_one("a[rel='next']")
                    or soup.select_one(".pagination a.next")
                )
                if not next_link or page >= 80:  # Safety cap
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
            if "view_item_list" in text and "items" in text:
                try:
                    # Match the view_item_list push specifically
                    match = re.search(
                        r'dataLayer\.push\((\{"event":"view_item_list".+?\})\)\s*;',
                        text, re.DOTALL,
                    )
                    if match:
                        data = json.loads(match.group(1))
                        # Try both GA4 format (items) and UA format (impressions)
                        items = (
                            data.get("ecommerce", {}).get("items", [])
                            or data.get("ecommerce", {}).get("impressions", [])
                        )
                        for item in items:
                            # GA4 uses item_name/item_id, UA uses name/id
                            name = item.get("item_name", "") or item.get("name", "")
                            price = float(item.get("price", 0))
                            item_id = item.get("item_id", "") or item.get("id", "")
                            category = item.get("item_category", "") or item.get("category", "")
                            if price <= 0 or not name:
                                continue
                            faction = guess_faction(name, category)
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
                                    "price": price,
                                    "url": f"{self.base_url}/{item_id}.html" if item_id else "",
                                    "in_stock": True,
                                    "image_url": None,
                                }
                            )
                        if products:
                            return products
                except (json.JSONDecodeError, ValueError, KeyError) as e:
                    print(f"    dataLayer parse error: {e}")
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
                card_classes = card.get("class", []) or []
                in_stock = "out-of-stock" not in card_classes

                faction = guess_faction(name, "")
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
                        "price": price,
                        "url": href,
                        "in_stock": in_stock,
                        "image_url": image_url,
                    }
                )
            except (ValueError, KeyError) as e:
                self.errors += 1
                self.error_details.append(f"Parse error: {e}")

        return products
