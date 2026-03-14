"""
eBay Browse API scraper — uses official REST API for Buy It Now listings.
Requires EBAY_APP_ID and EBAY_CERT_ID environment variables.
"""
import base64

import httpx

from config import EBAY_APP_ID, EBAY_CERT_ID, RETAILERS
from scrapers.base import BaseScraper
from scrapers.faction_list import guess_faction, guess_model_count

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

        credentials = base64.b64encode(
            f"{EBAY_APP_ID}:{EBAY_CERT_ID}".encode()
        ).decode()
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
            print(
                f"  [{self.name}] OAuth failed: {resp.status_code} {resp.text[:200]}"
            )
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
                    "filter": (
                        "buyingOptions:{FIXED_PRICE},"
                        "conditionIds:{1000|1500},"
                        "deliveryCountry:US,"
                        "itemLocationCountry:US"
                    ),
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
                    ship_cost = float(
                        shipping[0].get("shippingCost", {}).get("value", 0)
                    )
                    price_val += ship_cost

                faction = guess_faction(title)
                product_id = self.make_product_id(game_system, faction, title)
                models = guess_model_count(title)
                image = item.get("image", {}).get("imageUrl")
                url = item.get("itemWebUrl", "")

                items.append(
                    {
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
                    }
                )

        except Exception as e:
            self.errors += 1
            self.error_details.append(f"eBay error: {e}")

        return items
