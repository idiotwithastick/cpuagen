"""
Warhammer Price Scraper — Configuration
"""
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
