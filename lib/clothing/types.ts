export const SLOTS = [
  "headwear",
  "eyewear",
  "top",
  "outerwear",
  "bottom",
  "shoes",
  "accessory",
] as const;
export type Slot = (typeof SLOTS)[number];

export const TOP_TYPES = [
  "tee",
  "longsleeve",
  "hoodie",
  "crewneck",
  "buttonup",
  "dress_shirt",
  "polo",
  "tank",
  "turtleneck",
  "quarterzip",
  /** Knee-length dress (detected scans); the gown is the full-length formal one. */
  "dress",
  "gown",
] as const;
export type TopType = (typeof TOP_TYPES)[number];

export const OUTERWEAR_TYPES = [
  "none",
  "puffer",
  "blazer",
  "varsity",
  "denim",
  "trench",
  "overcoat",
  "fleece",
  "windbreaker",
  "leather",
  "cardigan",
  "vest",
  "suitvest",
] as const;
export type OuterwearType = (typeof OUTERWEAR_TYPES)[number];

export const BOTTOM_TYPES = [
  "none",
  "jeans",
  "cargos",
  "shorts",
  "slacks",
  "trackpants",
  "sweatpants",
  "skirt",
] as const;
export type BottomType = (typeof BOTTOM_TYPES)[number];

export const SHOE_TYPES = [
  "sneakers",
  "hightops",
  "runners",
  "boots",
  "loafers",
  "oxfords",
  "heels",
  "slides",
  "hikers",
] as const;
export type ShoeType = (typeof SHOE_TYPES)[number];

export const HEADWEAR_TYPES = ["none", "beanie", "cap", "bucket", "cowboy", "headband", "bandana"] as const;
export type HeadwearType = (typeof HEADWEAR_TYPES)[number];

/** Half of all fits wear something on their face. */
export const EYEWEAR_TYPES = [
  "none",
  "aviators",
  "wayfarers",
  "round_shades",
  "sport_shades",
  "tiny_shades",
  "oversized_shades",
  "round_glasses",
  "rect_glasses",
  "thick_glasses",
] as const;
export type EyewearType = (typeof EYEWEAR_TYPES)[number];

export const ACCESSORY_TYPES = [
  "none",
  "backpack",
  "crossbody",
  "headphones",
  "chain",
  "watch",
  "scarf",
  "carabiner",
  "tie",
  "pocket_square",
  "draped_sweater",
] as const;
export type AccessoryType = (typeof ACCESSORY_TYPES)[number];

export type FitWidth = "slim" | "regular" | "oversized";

/** Flat-color patterns rendered as small procedural textures. */
export const PATTERNS = ["solid", "stripes", "vstripes", "check", "colorblock", "camo"] as const;
export type Pattern = (typeof PATTERNS)[number];

export interface Garment<T extends string> {
  type: T;
  /** Hex colors. */
  primary: string;
  secondary: string;
  fit: FitWidth;
  pattern: Pattern;
  /** Garment-specific toggles (hood up, cap backward, tucked, open jacket...). */
  details: Record<string, boolean>;
}

/** Rare full-body costumes that replace every regular slot. */
export const COSTUME_TYPES = ["none", "mascot", "astronaut", "diver"] as const;
export type CostumeType = (typeof COSTUME_TYPES)[number];

export const MASCOT_ANIMALS = ["cheetah", "trex", "frog", "chicken", "shark"] as const;
export type MascotAnimal = (typeof MASCOT_ANIMALS)[number];

/** Very rare coordinated formalwear: a full suit or a full-length gown. */
export const FORMAL_TYPES = ["none", "suit", "gown"] as const;
export type FormalType = (typeof FORMAL_TYPES)[number];

export interface Outfit {
  seed: string;
  /** Theme id or "chaos". Internal only: never displayed outside the debug overlay. */
  theme: string;
  headwear: Garment<HeadwearType>;
  eyewear: Garment<EyewearType>;
  top: Garment<TopType>;
  outerwear: Garment<OuterwearType>;
  bottom: Garment<BottomType>;
  shoes: Garment<ShoeType>;
  accessory: Garment<AccessoryType>;
  /** Present when the roll had a wildcard twist. */
  wildcards: string[];
  costume: CostumeType;
  mascot: MascotAnimal | null;
  formal: FormalType;
}

export type SlotGarment<S extends Slot> = Outfit[S];

/** Human label for the debug overlay. */
export function costumeLabel(outfit: Outfit): string {
  if (outfit.costume === "mascot") return `mascot: ${outfit.mascot ?? "?"}`;
  if (outfit.costume !== "none") return outfit.costume;
  if (outfit.formal !== "none") return `formal: ${outfit.formal}`;
  return "none";
}
