"""
Wahapedia points scraper — extracts unit point values using Playwright.
Points data is used to calculate price-per-point metrics.

Wahapedia structure (40K 10th ed):
  /wh40k10ed/factions/<faction>/datasheets  — lists all datasheets with points
  Each faction page has a datasheets section with unit names and point costs.

AOS uses: /aos3/factions/<faction>/datasheets (or similar)
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
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                )
            )
            page = context.new_page()

            for game_system, config in WAHAPEDIA_FACTIONS.items():
                base = config["base"]
                for faction_slug in config["factions"]:
                    # Try the datasheets page first, then fall back to faction index
                    urls_to_try = [
                        f"{base}/{faction_slug}/datasheets",
                        f"{base}/{faction_slug}",
                    ]
                    faction_name = faction_slug.replace("-", " ").title()
                    print(f"  [Wahapedia] Scraping {game_system}/{faction_slug}...")

                    units = []
                    for url in urls_to_try:
                        try:
                            page.goto(url, wait_until="networkidle", timeout=30000)
                            page.wait_for_timeout(2000)

                            units = page.evaluate(
                                """() => {
                                const results = [];
                                const seen = new Set();

                                // Strategy 1: Look for datasheet headers with points
                                // Wahapedia uses various class patterns for datasheets
                                const dsSelectors = [
                                    '.dsName', '.DatasheetName', '.ds_name',
                                    '[class*="datasheet"] [class*="name"]',
                                    'h3[class*="ds"]', '.dsHeader',
                                ];
                                for (const sel of dsSelectors) {
                                    document.querySelectorAll(sel).forEach(el => {
                                        const name = el.textContent?.trim();
                                        if (!name || seen.has(name)) return;
                                        // Walk up to find the containing row/section
                                        const container = el.closest(
                                            'tr, .dsRow, .datasheet_row, [class*="row"], ' +
                                            '[class*="datasheet"], div, section'
                                        );
                                        if (!container) return;
                                        // Look for points in the container
                                        const ptsSelectors = [
                                            '.dsPts', '.dsPoints', '[class*="points"]',
                                            '[class*="pts"]', '.cost',
                                        ];
                                        let points = 0;
                                        for (const pSel of ptsSelectors) {
                                            const pEl = container.querySelector(pSel);
                                            if (pEl) {
                                                const num = parseInt(
                                                    pEl.textContent?.replace(/[^0-9]/g, '')
                                                );
                                                if (num > 0) { points = num; break; }
                                            }
                                        }
                                        if (name && name.length > 1) {
                                            seen.add(name);
                                            results.push({ name, points });
                                        }
                                    });
                                }

                                // Strategy 2: Look for table rows with unit data
                                if (results.length === 0) {
                                    document.querySelectorAll('table').forEach(table => {
                                        const rows = table.querySelectorAll('tr');
                                        rows.forEach(row => {
                                            const cells = row.querySelectorAll('td, th');
                                            if (cells.length >= 2) {
                                                const name = cells[0].textContent?.trim();
                                                // Check last few cells for a number (points)
                                                let points = 0;
                                                for (let i = cells.length - 1; i >= 1; i--) {
                                                    const txt = cells[i].textContent?.trim();
                                                    const num = parseInt(txt?.replace(/[^0-9]/g, ''));
                                                    if (num > 0 && num < 2000) {
                                                        points = num;
                                                        break;
                                                    }
                                                }
                                                if (name && name.length > 2 && !seen.has(name) &&
                                                    !/^(unit|name|model|datasheet)/i.test(name)) {
                                                    seen.add(name);
                                                    results.push({ name, points });
                                                }
                                            }
                                        });
                                    });
                                }

                                // Strategy 3: Find any element containing "pts" near a name
                                if (results.length === 0) {
                                    const allText = document.body.querySelectorAll('*');
                                    allText.forEach(el => {
                                        const text = el.textContent?.trim() || '';
                                        const match = text.match(/^(.+?)\\s+(\\d+)\\s*pts?$/i);
                                        if (match) {
                                            const name = match[1].trim();
                                            const points = parseInt(match[2]);
                                            if (name && points > 0 && !seen.has(name) &&
                                                el.children.length === 0) {
                                                seen.add(name);
                                                results.push({ name, points });
                                            }
                                        }
                                    });
                                }

                                return results;
                            }"""
                            )

                            if units:
                                break  # Got data, no need to try other URL

                        except Exception as e:
                            self.errors += 1
                            self.error_details.append(f"Wahapedia {faction_slug}: {e}")
                            print(f"    Error on {url}: {e}")

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

            browser.close()

        self.products_found = len(results)
        return results
