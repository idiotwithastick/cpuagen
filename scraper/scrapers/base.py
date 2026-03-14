"""
Base scraper class with retry, rate limiting, and common helpers.
"""
import re
import time
from abc import ABC, abstractmethod

import httpx

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
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
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
                print(f"  [{self.name}] Attempt {attempt + 1}/{retries} failed for {url}: {e}")
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
        slug = re.sub(r"[^a-z0-9]+", "-", f"{game_system}-{faction}-{name}".lower()).strip("-")
        return slug

    def make_faction_id(self, game_system: str, faction: str) -> str:
        """Generate a stable faction ID."""
        return re.sub(r"[^a-z0-9]+", "-", f"{game_system}-{faction}".lower()).strip("-")

    def close(self):
        self.session.close()
