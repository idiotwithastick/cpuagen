"""
Shared faction guessing and model count heuristics.
Used by all scrapers to normalize faction names and estimate model counts.
"""
import re

# Known factions across all game systems
# Order matters: more specific names first to avoid partial matches
KNOWN_FACTIONS = [
    # 40K — Specific chapters/variants first (before generic "Space Marines")
    "Blood Angels", "Dark Angels", "Space Wolves", "Black Templars",
    "Deathwatch", "Grey Knights", "Adeptus Custodes", "Adeptus Mechanicus",
    "Sisters of Battle", "Adepta Sororitas",
    "Space Marines",
    "Orks", "Tyranids", "Aeldari", "Craftworlds", "Drukhari",
    "Necrons", "T'au Empire", "Tau Empire",
    "Chaos Space Marines", "Death Guard", "Thousand Sons", "World Eaters",
    "Chaos Knights", "Imperial Knights", "Chaos Daemons",
    "Astra Militarum", "Imperial Guard",
    "Genestealer Cults", "Leagues of Votann", "Agents of the Imperium",
    "Imperial Agents", "Unaligned",
    # AoS
    "Stormcast Eternals", "Skaven", "Slaves to Darkness",
    "Orruk Warclans", "Soulblight Gravelords", "Lumineth Realm-lords",
    "Daughters of Khaine", "Idoneth Deepkin", "Fyreslayers",
    "Kharadron Overlords", "Cities of Sigmar", "Seraphon",
    "Ossiarch Bonereapers", "Flesh-eater Courts", "Nighthaunt",
    "Maggotkin of Nurgle", "Hedonites of Slaanesh", "Disciples of Tzeentch",
    "Blades of Khorne", "Ogor Mawtribes", "Sons of Behemat",
    "Gloomspite Gitz", "Sylvaneth", "Beasts of Chaos",
    # Horus Heresy — Legions
    "Dark Angels Legion", "Emperor's Children", "Iron Warriors",
    "White Scars Legion", "Space Wolves Legion", "Imperial Fists",
    "Night Lords", "Blood Angels Legion", "Iron Hands",
    "World Eaters Legion", "Ultramarines", "Death Guard Legion",
    "Thousand Sons Legion", "Sons of Horus", "Word Bearers",
    "Salamanders", "Raven Guard", "Alpha Legion",
    "Solar Auxilia", "Mechanicum", "Custodes", "Sisters of Silence",
    "Daemons of the Ruinstorm",
    # Kill Team
    "Kommandos", "Veteran Guardsmen", "Pathfinders", "Legionaries",
    "Intercession Squad", "Wyrmblade", "Void-Dancers", "Kasrkin",
    "Navy Breachers", "Fellgor Ravagers", "Phobos Strike Team",
    "Novitiates", "Hunter Clade", "Warpcoven", "Blooded",
    "Corsair Voidscarred", "Hand of the Archon", "Exaction Squad",
    "Inquisitorial Agents", "Mandrakes", "Brood Brothers",
    "Hernkyn Yaegirs", "Angels of Death", "Nemesis",
    # Necromunda
    "Escher", "Goliath", "Van Saar", "Cawdor", "Delaque", "Orlock",
    "Palanite Enforcers", "Corpse Grinder Cult", "Genestealer Cult Necromunda",
    "Ironhead Squat Prospectors", "Ash Waste Nomads",
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
