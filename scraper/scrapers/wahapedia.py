"""
Wahapedia points scraper — extracts unit point values using Playwright.
Points data is used to calculate price-per-point metrics.
"""
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
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print(f"  [{self.name}] Playwright not installed, skipping.")
            return []

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

                        units = page.evaluate(
                            """() => {
                            const results = [];
                            const sheets = document.querySelectorAll(
                                '.DatasheetName, .dsName, [class*="datasheet"]'
                            );
                            sheets.forEach(el => {
                                const name = el.textContent?.trim();
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
                        }"""
                        )

                        faction_name = faction_slug.replace("-", " ").title()
                        for unit in units:
                            product_id = self.make_product_id(
                                game_system, faction_name, unit["name"]
                            )
                            results.append(
                                {
                                    "product_id": product_id,
                                    "name": unit["name"],
                                    "faction_id": self.make_faction_id(
                                        game_system, faction_name
                                    ),
                                    "faction_name": faction_name,
                                    "game_system": game_system,
                                    "points_per_unit": unit["points"],
                                }
                            )

                        print(f"    Found {len(units)} units")

                    except Exception as e:
                        self.errors += 1
                        self.error_details.append(f"Wahapedia {faction_slug}: {e}")
                        print(f"    Error: {e}")

            browser.close()

        self.products_found = len(results)
        return results
