import type { Analysis } from "./schema";

/**
 * MOCK MODE fixtures. Used by /api/analyze whenever OPENAI_API_KEY is unset.
 * Five varied outfits: one negative-aura ("bummy") fit and one battle pair
 * (BATTLE_A vs BATTLE_B). Boxes are [ymin, xmin, ymax, xmax] on a 0-1000 grid.
 */

export const FIXTURE_RACING_JACKET: Analysis = {
  is_outfit_photo: true,
  specialness: 88,
  sentiment: "positive",
  style_mix: [
    { style: "streetwear", percent: 55 },
    { style: "Y2K", percent: 30 },
    { style: "grunge", percent: 15 },
  ],
  items: [
    {
      name: "Vintage racing jacket",
      category: "outerwear",
      color: "red and white",
      estimated_price_usd: 180,
      uniqueness: 94,
      is_statement_piece: true,
      box_2d: [220, 180, 620, 820],
    },
    {
      name: "Graphic tee",
      category: "top",
      color: "black",
      estimated_price_usd: 30,
      uniqueness: 40,
      is_statement_piece: false,
      box_2d: [300, 380, 600, 620],
    },
    {
      name: "Baggy jeans",
      category: "bottom",
      color: "light wash",
      estimated_price_usd: 70,
      uniqueness: 55,
      is_statement_piece: false,
      box_2d: [600, 260, 950, 740],
    },
    {
      name: "Chunky runners",
      category: "shoes",
      color: "silver",
      estimated_price_usd: 140,
      uniqueness: 62,
      is_statement_piece: false,
      box_2d: [920, 280, 1000, 720],
    },
    {
      name: "Silver chain",
      category: "jewelry",
      color: "silver",
      estimated_price_usd: 25,
      uniqueness: 35,
      is_statement_piece: false,
      box_2d: [250, 440, 330, 560],
    },
  ],
  held_objects: [],
  face_box: [60, 400, 220, 600],
  cohesion: { color_harmony: 78, silhouette: 84, style_consistency: 81 },
  modifiers: [
    { emoji: "🏁", label: "Racing jacket detected", tier: "legendary" },
    { emoji: "👖", label: "Baggy jean silhouette", tier: "major" },
    { emoji: "⛓️", label: "Chain accent", tier: "minor" },
    { emoji: "👟", label: "Silver runner commitment", tier: "minor" },
  ],
  nickname: "Vintage Racing Jacket Guy",
  verdict: "Pit crew chief for a team that does not exist.",
};

export const FIXTURE_OLD_MONEY: Analysis = {
  is_outfit_photo: true,
  specialness: 72,
  sentiment: "positive",
  style_mix: [
    { style: "old money", percent: 60 },
    { style: "preppy", percent: 30 },
    { style: "business casual", percent: 10 },
  ],
  items: [
    {
      name: "Cable knit sweater",
      category: "top",
      color: "cream",
      estimated_price_usd: 120,
      uniqueness: 48,
      is_statement_piece: false,
      box_2d: [240, 220, 600, 780],
    },
    {
      name: "Pleated slacks",
      category: "bottom",
      color: "camel",
      estimated_price_usd: 90,
      uniqueness: 52,
      is_statement_piece: false,
      box_2d: [590, 300, 940, 700],
    },
    {
      name: "Penny loafers",
      category: "shoes",
      color: "oxblood",
      estimated_price_usd: 160,
      uniqueness: 66,
      is_statement_piece: true,
      box_2d: [930, 320, 1000, 680],
    },
    {
      name: "Leather strap watch",
      category: "watch",
      color: "brown",
      estimated_price_usd: 250,
      uniqueness: 58,
      is_statement_piece: false,
      box_2d: [560, 700, 610, 780],
    },
  ],
  held_objects: [{ name: "Tote bag", box_2d: [450, 780, 800, 960] }],
  face_box: [70, 410, 230, 590],
  cohesion: { color_harmony: 92, silhouette: 80, style_consistency: 95 },
  modifiers: [
    { emoji: "🥂", label: "Cream on camel palette", tier: "major" },
    { emoji: "👞", label: "Loafer authority", tier: "major" },
    { emoji: "⌚", label: "Inherited-looking watch", tier: "minor" },
  ],
  nickname: "Penny Loafer Heir",
  verdict: "Summers on a lake that has a family name.",
};

export const FIXTURE_HACKATHON_SURVIVOR: Analysis = {
  is_outfit_photo: true,
  specialness: 55,
  sentiment: "negative",
  style_mix: [
    { style: "hackathon survivor", percent: 70 },
    { style: "athleisure", percent: 20 },
    { style: "minimalist", percent: 10 },
  ],
  items: [
    {
      name: "Free conference tee",
      category: "top",
      color: "navy",
      estimated_price_usd: 0,
      uniqueness: 20,
      is_statement_piece: false,
      box_2d: [250, 240, 600, 760],
    },
    {
      name: "Zip hoodie tied at waist",
      category: "outerwear",
      color: "gray",
      estimated_price_usd: 40,
      uniqueness: 30,
      is_statement_piece: false,
      box_2d: [560, 200, 720, 800],
    },
    {
      name: "Sweatpants",
      category: "bottom",
      color: "black",
      estimated_price_usd: 35,
      uniqueness: 22,
      is_statement_piece: false,
      box_2d: [600, 300, 940, 700],
    },
    {
      name: "Slides with socks",
      category: "shoes",
      color: "black and white",
      estimated_price_usd: 25,
      uniqueness: 45,
      is_statement_piece: true,
      box_2d: [930, 300, 1000, 700],
    },
    {
      name: "Lanyard",
      category: "accessory",
      color: "orange",
      estimated_price_usd: 2,
      uniqueness: 15,
      is_statement_piece: false,
      box_2d: [260, 440, 480, 560],
    },
  ],
  held_objects: [{ name: "Energy drink can", box_2d: [500, 760, 640, 860] }],
  face_box: [70, 400, 230, 600],
  cohesion: { color_harmony: 55, silhouette: 48, style_consistency: 72 },
  modifiers: [
    { emoji: "🔋", label: "Hour 31 energy", tier: "major" },
    { emoji: "🧦", label: "Slides plus socks", tier: "penalty" },
    { emoji: "🪪", label: "Lanyard still on", tier: "minor" },
    { emoji: "👕", label: "Sponsor tee sponsorship", tier: "minor" },
  ],
  nickname: "Lanyard And Slides Legend",
  verdict: "Shipped the demo, did not ship the outfit.",
};

/** Negative aura: bummy-dominant style mix plus multiple penalties. */
export const FIXTURE_BUMMY: Analysis = {
  is_outfit_photo: true,
  specialness: 94,
  sentiment: "negative",
  style_mix: [
    { style: "bummy", percent: 75 },
    { style: "grunge", percent: 15 },
    { style: "athleisure", percent: 10 },
  ],
  items: [
    {
      name: "Stretched-out tee",
      category: "top",
      color: "faded gray",
      estimated_price_usd: 5,
      uniqueness: 4,
      is_statement_piece: false,
      box_2d: [250, 220, 620, 780],
    },
    {
      name: "Basketball shorts",
      category: "bottom",
      color: "black",
      estimated_price_usd: 15,
      uniqueness: 3,
      is_statement_piece: false,
      box_2d: [600, 280, 820, 720],
    },
    {
      name: "Crocs",
      category: "shoes",
      color: "neon green",
      estimated_price_usd: 45,
      uniqueness: 12,
      is_statement_piece: false,
      box_2d: [920, 300, 1000, 700],
    },
  ],
  held_objects: [],
  face_box: [70, 400, 230, 600],
  cohesion: { color_harmony: 14, silhouette: 10, style_consistency: 22 },
  modifiers: [
    { emoji: "🛋️", label: "Couch-to-kiosk pipeline", tier: "penalty" },
    { emoji: "🐊", label: "Neon Crocs in sport mode", tier: "penalty" },
    { emoji: "🧺", label: "Laundry day palette", tier: "penalty" },
  ],
  nickname: "Neon Crocs Understudy",
  verdict: "Dressed for a 2am fridge visit and nothing else.",
};

/** Battle pair: two contestants captured in one frame. */
export const FIXTURE_BATTLE_A: Analysis = {
  is_outfit_photo: true,
  specialness: 83,
  sentiment: "positive",
  style_mix: [
    { style: "gorpcore", percent: 65 },
    { style: "techwear", percent: 25 },
    { style: "streetwear", percent: 10 },
  ],
  items: [
    {
      name: "Shell jacket",
      category: "outerwear",
      color: "orange",
      estimated_price_usd: 220,
      uniqueness: 72,
      is_statement_piece: true,
      box_2d: [230, 200, 620, 800],
    },
    {
      name: "Fleece vest",
      category: "top",
      color: "forest green",
      estimated_price_usd: 90,
      uniqueness: 58,
      is_statement_piece: false,
      box_2d: [280, 320, 600, 680],
    },
    {
      name: "Cargo pants",
      category: "bottom",
      color: "khaki",
      estimated_price_usd: 80,
      uniqueness: 50,
      is_statement_piece: false,
      box_2d: [600, 280, 940, 720],
    },
    {
      name: "Hiking boots",
      category: "shoes",
      color: "brown",
      estimated_price_usd: 170,
      uniqueness: 60,
      is_statement_piece: false,
      box_2d: [920, 300, 1000, 700],
    },
    {
      name: "Carabiner",
      category: "accessory",
      color: "silver",
      estimated_price_usd: 8,
      uniqueness: 70,
      is_statement_piece: false,
      box_2d: [620, 640, 700, 720],
    },
  ],
  held_objects: [],
  face_box: [60, 400, 220, 600],
  cohesion: { color_harmony: 82, silhouette: 76, style_consistency: 90 },
  modifiers: [
    { emoji: "🧗", label: "Carabiner with no climbing planned", tier: "major" },
    { emoji: "🍊", label: "High-vis shell", tier: "major" },
    { emoji: "🥾", label: "Trail-ready boots indoors", tier: "minor" },
  ],
  nickname: "Carabiner Cargo Captain",
  verdict: "Ready to summit the parking garage.",
};

export const FIXTURE_BATTLE_B: Analysis = {
  is_outfit_photo: true,
  specialness: 60,
  sentiment: "negative",
  style_mix: [
    { style: "minimalist", percent: 60 },
    { style: "professional", percent: 30 },
    { style: "old money", percent: 10 },
  ],
  items: [
    {
      name: "Black turtleneck",
      category: "top",
      color: "black",
      estimated_price_usd: 60,
      uniqueness: 35,
      is_statement_piece: false,
      box_2d: [240, 240, 600, 760],
    },
    {
      name: "Wide-leg trousers",
      category: "bottom",
      color: "charcoal",
      estimated_price_usd: 110,
      uniqueness: 57,
      is_statement_piece: false,
      box_2d: [590, 260, 940, 740],
    },
    {
      name: "Leather boots",
      category: "shoes",
      color: "black",
      estimated_price_usd: 200,
      uniqueness: 50,
      is_statement_piece: false,
      box_2d: [930, 300, 1000, 700],
    },
    {
      name: "Tiny sunglasses",
      category: "eyewear",
      color: "black",
      estimated_price_usd: 30,
      uniqueness: 80,
      is_statement_piece: true,
      box_2d: [120, 420, 160, 580],
    },
  ],
  held_objects: [],
  face_box: [60, 400, 220, 600],
  cohesion: { color_harmony: 96, silhouette: 88, style_consistency: 92 },
  modifiers: [
    { emoji: "🕶️", label: "Sunglasses indoors", tier: "major" },
    { emoji: "⬛", label: "Full monochrome commitment", tier: "major" },
    { emoji: "🖤", label: "Turtleneck keynote energy", tier: "minor" },
  ],
  nickname: "Tiny Sunglasses Keynote",
  verdict: "About to announce a product that is just a black rectangle.",
};

export const FIXTURES: Analysis[] = [
  FIXTURE_RACING_JACKET,
  FIXTURE_OLD_MONEY,
  FIXTURE_HACKATHON_SURVIVOR,
  FIXTURE_BUMMY,
  FIXTURE_BATTLE_A,
  FIXTURE_BATTLE_B,
];

export const BATTLE_FIXTURE_PAIR: [Analysis, Analysis] = [
  FIXTURE_BATTLE_A,
  FIXTURE_BATTLE_B,
];

/** Deterministic pick so the same mock hash always yields the same fixture. */
export function pickFixture(imageHash: string): Analysis {
  let h = 0;
  for (let i = 0; i < imageHash.length; i++) {
    h = (h * 31 + imageHash.charCodeAt(i)) >>> 0;
  }
  // Every fixture is fair game: battles and squads draw several captures, so more variety means fewer twins.
  return FIXTURES[h % FIXTURES.length];
}
