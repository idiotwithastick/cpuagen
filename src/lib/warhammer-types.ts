// Warhammer Price Finder — TypeScript Types

export type GameSystem = "40K" | "HERESY" | "AOS" | "KILLTEAM" | "NECROMUNDA";

export interface WHFaction {
  id: string;
  name: string;
  game_system: GameSystem;
  unit_count: number;
}

export interface WHProduct {
  id: string;
  name: string;
  faction_id: string;
  game_system: GameSystem;
  models_in_box: number;
  points_per_unit: number;
  gw_sku: string | null;
  image_url: string | null;
  keywords: string | null;
  updated_at: number;
}

export interface WHPrice {
  id: string;
  product_id: string;
  retailer: string;
  price: number;
  currency: string;
  url: string | null;
  in_stock: boolean;
  price_per_model: number;
  price_per_point: number;
  scraped_at: number;
}

export interface WHProductWithPrices extends WHProduct {
  prices: WHPrice[];
  best_price_per_model: number | null;
  best_price_per_point: number | null;
  best_retailer: string | null;
}

export interface ArmyListItem {
  product_id: string;
  quantity: number;
}

export interface OptimizedPurchase {
  product_id: string;
  product_name: string;
  quantity: number;
  retailer: string;
  unit_price: number;
  total_price: number;
  url: string | null;
  price_per_model: number;
  price_per_point: number;
}

export interface ArmyOptimizationResult {
  items: OptimizedPurchase[];
  total_cost: number;
  total_models: number;
  total_points: number;
  avg_price_per_model: number;
  avg_price_per_point: number;
}

export const GAME_SYSTEMS: { id: GameSystem; name: string }[] = [
  { id: "40K", name: "Warhammer 40,000" },
  { id: "HERESY", name: "Horus Heresy" },
  { id: "AOS", name: "Age of Sigmar" },
  { id: "KILLTEAM", name: "Kill Team" },
  { id: "NECROMUNDA", name: "Necromunda" },
];

export const RETAILER_NAMES: Record<string, string> = {
  "games-workshop": "Games Workshop",
  "miniature-market": "Miniature Market",
  "element-games": "Element Games",
  "wayland-games": "Wayland Games",
  "noble-knight": "Noble Knight Games",
  "ebay": "eBay",
};

// Static faction data — used as fallback when D1 is empty or unavailable
export const STATIC_FACTIONS: Record<GameSystem, { id: string; name: string }[]> = {
  "40K": [
    { id: "space-marines", name: "Space Marines" },
    { id: "blood-angels", name: "Blood Angels" },
    { id: "dark-angels", name: "Dark Angels" },
    { id: "space-wolves", name: "Space Wolves" },
    { id: "black-templars", name: "Black Templars" },
    { id: "deathwatch", name: "Deathwatch" },
    { id: "grey-knights", name: "Grey Knights" },
    { id: "ultramarines", name: "Ultramarines" },
    { id: "imperial-fists", name: "Imperial Fists" },
    { id: "salamanders", name: "Salamanders" },
    { id: "raven-guard", name: "Raven Guard" },
    { id: "iron-hands", name: "Iron Hands" },
    { id: "white-scars", name: "White Scars" },
    { id: "astra-militarum", name: "Astra Militarum" },
    { id: "adeptus-mechanicus", name: "Adeptus Mechanicus" },
    { id: "adepta-sororitas", name: "Adepta Sororitas" },
    { id: "adeptus-custodes", name: "Adeptus Custodes" },
    { id: "imperial-knights", name: "Imperial Knights" },
    { id: "imperial-agents", name: "Imperial Agents" },
    { id: "chaos-space-marines", name: "Chaos Space Marines" },
    { id: "death-guard", name: "Death Guard" },
    { id: "thousand-sons", name: "Thousand Sons" },
    { id: "world-eaters", name: "World Eaters" },
    { id: "chaos-knights", name: "Chaos Knights" },
    { id: "chaos-daemons", name: "Chaos Daemons" },
    { id: "orks", name: "Orks" },
    { id: "tyranids", name: "Tyranids" },
    { id: "genestealer-cults", name: "Genestealer Cults" },
    { id: "necrons", name: "Necrons" },
    { id: "tau-empire", name: "T'au Empire" },
    { id: "aeldari", name: "Aeldari" },
    { id: "drukhari", name: "Drukhari" },
    { id: "votann", name: "Leagues of Votann" },
  ],
  "AOS": [
    { id: "stormcast-eternals", name: "Stormcast Eternals" },
    { id: "cities-of-sigmar", name: "Cities of Sigmar" },
    { id: "fyreslayers", name: "Fyreslayers" },
    { id: "kharadron-overlords", name: "Kharadron Overlords" },
    { id: "lumineth-realm-lords", name: "Lumineth Realm-Lords" },
    { id: "idoneth-deepkin", name: "Idoneth Deepkin" },
    { id: "sylvaneth", name: "Sylvaneth" },
    { id: "seraphon", name: "Seraphon" },
    { id: "daughters-of-khaine", name: "Daughters of Khaine" },
    { id: "blades-of-khorne", name: "Blades of Khorne" },
    { id: "disciples-of-tzeentch", name: "Disciples of Tzeentch" },
    { id: "maggotkin-of-nurgle", name: "Maggotkin of Nurgle" },
    { id: "hedonites-of-slaanesh", name: "Hedonites of Slaanesh" },
    { id: "slaves-to-darkness", name: "Slaves to Darkness" },
    { id: "skaven", name: "Skaven" },
    { id: "nighthaunt", name: "Nighthaunt" },
    { id: "ossiarch-bonereapers", name: "Ossiarch Bonereapers" },
    { id: "soulblight-gravelords", name: "Soulblight Gravelords" },
    { id: "flesh-eater-courts", name: "Flesh-eater Courts" },
    { id: "orruk-warclans", name: "Orruk Warclans" },
    { id: "gloomspite-gitz", name: "Gloomspite Gitz" },
    { id: "ogor-mawtribes", name: "Ogor Mawtribes" },
    { id: "sons-of-behemat", name: "Sons of Behemat" },
  ],
  "HERESY": [
    { id: "dark-angels-legion", name: "I - Dark Angels" },
    { id: "emperors-children", name: "III - Emperor's Children" },
    { id: "iron-warriors", name: "IV - Iron Warriors" },
    { id: "white-scars-legion", name: "V - White Scars" },
    { id: "space-wolves-legion", name: "VI - Space Wolves" },
    { id: "imperial-fists-legion", name: "VII - Imperial Fists" },
    { id: "night-lords", name: "VIII - Night Lords" },
    { id: "blood-angels-legion", name: "IX - Blood Angels" },
    { id: "iron-hands-legion", name: "X - Iron Hands" },
    { id: "world-eaters-legion", name: "XII - World Eaters" },
    { id: "ultramarines-legion", name: "XIII - Ultramarines" },
    { id: "death-guard-legion", name: "XIV - Death Guard" },
    { id: "thousand-sons-legion", name: "XV - Thousand Sons" },
    { id: "sons-of-horus", name: "XVI - Sons of Horus" },
    { id: "word-bearers", name: "XVII - Word Bearers" },
    { id: "salamanders-legion", name: "XVIII - Salamanders" },
    { id: "raven-guard-legion", name: "XIX - Raven Guard" },
    { id: "alpha-legion", name: "XX - Alpha Legion" },
    { id: "solar-auxilia", name: "Solar Auxilia" },
    { id: "mechanicum", name: "Mechanicum" },
    { id: "custodes-heresy", name: "Legio Custodes" },
  ],
  "KILLTEAM": [
    { id: "kommandos", name: "Kommandos" },
    { id: "veteran-guardsmen", name: "Veteran Guardsmen" },
    { id: "pathfinders", name: "Pathfinders" },
    { id: "legionaries", name: "Legionaries" },
    { id: "intercessors", name: "Intercessors" },
    { id: "novitiates", name: "Novitiates" },
    { id: "hive-fleet", name: "Hive Fleet" },
    { id: "wyrmblade", name: "Wyrmblade" },
    { id: "kasrkin", name: "Kasrkin" },
    { id: "hand-of-the-archon", name: "Hand of the Archon" },
    { id: "void-dancers", name: "Void-Dancer Troupe" },
    { id: "hunter-clade", name: "Hunter Clade" },
    { id: "corsair-voidscarred", name: "Corsair Voidscarred" },
    { id: "phobos-strike", name: "Phobos Strike Team" },
    { id: "angels-of-death", name: "Angels of Death" },
    { id: "fellgor-ravagers", name: "Fellgor Ravagers" },
    { id: "mandrakes", name: "Mandrakes" },
    { id: "hernkyn-yaegirs", name: "Hernkyn Yaegirs" },
  ],
  "NECROMUNDA": [
    { id: "escher", name: "House Escher" },
    { id: "goliath", name: "House Goliath" },
    { id: "van-saar", name: "House Van Saar" },
    { id: "orlock", name: "House Orlock" },
    { id: "delaque", name: "House Delaque" },
    { id: "cawdor", name: "House Cawdor" },
    { id: "enforcers", name: "Palanite Enforcers" },
    { id: "corpse-grinder-cults", name: "Corpse Grinder Cults" },
    { id: "slave-ogryn", name: "Slave Ogryns" },
  ],
};
