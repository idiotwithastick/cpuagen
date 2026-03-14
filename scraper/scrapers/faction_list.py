"""
Shared faction guessing and model count heuristics.
Used by all scrapers to normalize faction names and estimate model counts.
"""
import re

# Known factions across all game systems
KNOWN_FACTIONS = [
    # 40K
    "Space Marines", "Orks", "Tyranids", "Aeldari", "Drukhari",
    "Necrons", "T'au Empire", "Chaos Space Marines", "Death Guard",
    "Thousand Sons", "World Eaters", "Adeptus Custodes", "Sisters of Battle",
    "Astra Militarum", "Imperial Knights", "Chaos Knights", "Chaos Daemons",
    "Genestealer Cults", "Leagues of Votann", "Agents of the Imperium",
    "Grey Knights", "Deathwatch", "Blood Angels", "Dark Angels",
    "Space Wolves", "Black Templars", "Adeptus Mechanicus",
    # AoS
    "Stormcast Eternals", "Skaven", "Slaves to Darkness",
    "Orruk Warclans", "Soulblight Gravelords", "Lumineth Realm-lords",
    "Daughters of Khaine", "Idoneth Deepkin", "Fyreslayers",
    "Kharadron Overlords", "Cities of Sigmar", "Seraphon",
    "Ossiarch Bonereapers", "Flesh-eater Courts", "Nighthaunt",
    "Maggotkin of Nurgle", "Hedonites of Slaanesh", "Disciples of Tzeentch",
    "Blades of Khorne", "Ogor Mawtribes", "Sons of Behemat",
    "Gloomspite Gitz", "Sylvaneth", "Beasts of Chaos",
    # Heresy
    "Solar Auxilia", "Mechanicum",
    # Necromunda
    "Escher", "Goliath", "Van Saar", "Cawdor", "Delaque", "Orlock",
]

# Patterns to extract model count from product names
BOX_MODEL_PATTERNS = [
    (r"(\d+)\s*(?:models?|miniatures?|figures?)", lambda m: int(m.group(1))),
    (r"(?:squad|unit)\s*of\s*(\d+)", lambda m: int(m.group(1))),
    (r"(\d+)\s*x\s*", lambda m: int(m.group(1))),
]


def guess_faction(name: str, category: str = "") -> str:
    """Guess faction from product name and category text."""
    combined = f"{name} {category}".lower()
    for faction in KNOWN_FACTIONS:
        if faction.lower() in combined:
            return faction
    return "Unknown"


def guess_model_count(name: str) -> int:
    """Guess model count from product name."""
    for pattern, extractor in BOX_MODEL_PATTERNS:
        match = re.search(pattern, name, re.IGNORECASE)
        if match:
            return extractor(match)
    # Single model keywords
    if any(kw in name.lower() for kw in ["character", "hero", "lord", "warlord", "hq"]):
        return 1
    return 1  # Default to 1 if unknown
