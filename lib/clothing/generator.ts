import { createRng, type Rng } from "@/lib/prng";
import { THEMES, type Theme, type Weighted } from "./themes";
import {
  ACCESSORY_TYPES,
  BOTTOM_TYPES,
  COSTUME_TYPES,
  EYEWEAR_TYPES,
  HEADWEAR_TYPES,
  MASCOT_ANIMALS,
  OUTERWEAR_TYPES,
  SHOE_TYPES,
  SLOTS,
  TOP_TYPES,
  type CostumeType,
  type FitWidth,
  type FormalType,
  type Garment,
  type MascotAnimal,
  type Outfit,
  type Pattern,
  type Slot,
} from "./types";

const CHAOS_ROLL_CHANCE = 0.2;
const OPTIONAL_WILDCARD_CHANCE = 0.4;
/** Chance that a roll is a full costume (mascot, astronaut or diver). */
export const COSTUME_CHANCE = 0.01;
/** Chance of coordinated formalwear (full suit or gown). */
export const FORMAL_CHANCE = 0.02;

export interface GenerateOptions {
  /** Force a costume (dev hotkey / pose editor). "special" picks one at random. */
  costume?: CostumeType | "special";
  mascot?: MascotAnimal;
  formal?: FormalType;
  /** Force a theme id (pose editor). */
  theme?: string;
}

/** Small hue / lightness jitter so two rolls of the same palette differ. */
function jitterHex(hex: string, rng: Rng, amount = 0.06): string {
  const n = Number.parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const l = 1 + rng.float(-amount, amount);
  const tint = rng.float(-amount, amount) * 255;
  r = clamp(Math.round(r * l + tint * 0.3));
  g = clamp(Math.round(g * l));
  b = clamp(Math.round(b * l - tint * 0.3));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function pickTwoColors(rng: Rng, palette: readonly string[]): [string, string] {
  const a = rng.pick(palette);
  let b = rng.pick(palette);
  if (b === a && palette.length > 1) b = palette[(palette.indexOf(a) + 1) % palette.length];
  return [jitterHex(a, rng), jitterHex(b, rng)];
}

/** Pattern odds per garment type. Most things are solid. */
function rollPattern(rng: Rng, slot: Slot, type: string): Pattern {
  if (slot === "shoes" || slot === "eyewear" || slot === "headwear") {
    if (type === "bucket") return rng.weighted<Pattern>([["solid", 7], ["camo", 2], ["check", 1]]);
    return "solid";
  }
  if (slot === "accessory") return type === "scarf" ? rng.weighted<Pattern>([["solid", 5], ["stripes", 3], ["check", 2]]) : type === "tie" ? rng.weighted<Pattern>([["solid", 6], ["stripes", 3]]) : "solid";
  const table: Weighted<Pattern> = (() => {
    switch (type) {
      case "buttonup":
        return [["solid", 5], ["check", 4], ["vstripes", 2]];
      case "dress_shirt":
        return [["solid", 7], ["vstripes", 2]];
      case "tee":
      case "longsleeve":
        return [["solid", 8], ["stripes", 2], ["colorblock", 1]];
      case "polo":
        return [["solid", 6], ["stripes", 2]];
      case "crewneck":
      case "hoodie":
        return [["solid", 8], ["colorblock", 2]];
      case "windbreaker":
      case "fleece":
        return [["solid", 5], ["colorblock", 4]];
      case "cardigan":
        return [["solid", 6], ["check", 1], ["stripes", 1]];
      case "cargos":
        return [["solid", 7], ["camo", 3]];
      case "trackpants":
      case "shorts":
        return [["solid", 8], ["vstripes", 1]];
      case "skirt":
        return [["solid", 6], ["check", 3]];
      default:
        return [["solid", 1]];
    }
  })();
  return rng.weighted(table);
}

function garment<T extends string>(
  rng: Rng,
  slot: Slot,
  type: T,
  palette: readonly string[],
  fit: FitWidth,
  details: Record<string, boolean> = {},
): Garment<T> {
  const [primary, secondary] = pickTwoColors(rng, palette);
  return { type, primary, secondary, fit, pattern: rollPattern(rng, slot, type), details };
}

const FIT_ANY: Weighted<FitWidth> = [
  ["slim", 1],
  ["regular", 1],
  ["oversized", 1],
];

/** Formal-only pieces stay out of random rolls. */
// One-piece tops need their own bottoms (none): never in a random mix-and-match roll.
const CHAOS_TOPS = TOP_TYPES.filter((t) => t !== "gown" && t !== "dress");
const CHAOS_BOTTOMS = BOTTOM_TYPES.filter((t) => t !== "none");

function chaosTheme(): Theme {
  const even = <T extends string>(types: readonly T[]): Weighted<T> => types.map((t) => [t, 1] as const);
  return {
    id: "chaos",
    top: even(CHAOS_TOPS),
    outerwear: even(OUTERWEAR_TYPES),
    bottom: even(CHAOS_BOTTOMS),
    shoes: even(SHOE_TYPES),
    headwear: even(HEADWEAR_TYPES),
    eyewear: [["none", EYEWEAR_TYPES.length - 1], ...EYEWEAR_TYPES.filter((e) => e !== "none").map((e) => [e, 1] as const)],
    accessory: even(ACCESSORY_TYPES),
    fit: FIT_ANY,
    palettes: THEMES.flatMap((t) => t.palettes),
  };
}

function rollDetails(rng: Rng, slot: Slot, type: string): Record<string, boolean> {
  switch (slot) {
    case "top":
      return {
        hoodUp: type === "hoodie" && rng.chance(0.35),
        tucked: type === "dress_shirt" || ((type === "buttonup" || type === "polo") && rng.chance(0.5)),
        rolledCuffs: rng.chance(0.3),
      };
    case "outerwear":
      return { open: type === "suitvest" ? false : rng.chance(0.65) };
    case "bottom":
      return { rolledCuffs: rng.chance(0.25), baggy: rng.chance(0.4) };
    case "headwear":
      return { backward: type === "cap" && rng.chance(0.4) };
    default:
      return {};
  }
}

function rollSlotGarment<S extends Slot>(
  rng: Rng,
  theme: Theme,
  slot: S,
  palette: readonly string[],
  fit: FitWidth,
): Outfit[S] {
  const type = rng.weighted(theme[slot] as Weighted<string>);
  return garment(rng, slot, type, palette, fit, rollDetails(rng, slot, type)) as Outfit[S];
}

/** Wildcards: one guaranteed, one optional twist per fit. */
function applyWildcard(rng: Rng, outfit: Outfit, theme: Theme): string {
  const kind = rng.pick(["offTheme", "accent", "layering"] as const);
  switch (kind) {
    case "offTheme": {
      const other = rng.pick(THEMES.filter((t) => t.id !== theme.id));
      const slot = rng.pick(SLOTS);
      const palette = rng.pick(theme.palettes);
      const g = rollSlotGarment(rng, other, slot, palette, outfit.top.fit);
      (outfit as Record<Slot, unknown>)[slot] = g;
      return `off-theme ${slot} from ${other.id}`;
    }
    case "accent": {
      const slot = rng.pick(["top", "shoes", "headwear", "accessory"] as const);
      const accent = rng.pick(["#9ee7ff", "#ff5fa2", "#f5c400", "#39ff14", "#ff6b35", "#b19cd9"]);
      (outfit as Record<Slot, Garment<string>>)[slot] = { ...outfit[slot], primary: jitterHex(accent, rng, 0.04) };
      return `accent ${slot}`;
    }
    case "layering": {
      if (outfit.outerwear.type === "none") {
        const palette = rng.pick(theme.palettes);
        outfit.outerwear = garment(rng, "outerwear", rng.pick(["vest", "cardigan", "denim"] as const), palette, outfit.top.fit, {
          open: true,
        });
        return "surprise layer";
      }
      outfit.top = { ...outfit.top, type: "hoodie", details: { ...outfit.top.details, hoodUp: false } };
      return "hoodie under outerwear";
    }
  }
}

const SUIT_COLORS = ["#1f2a44", "#2b2b2b", "#3b3b4f", "#4a3b32", "#151515", "#5a6a7a", "#6b5b45"];
const SHIRT_COLORS = ["#ffffff", "#e8eef7", "#dbe7f5", "#f6f0e6"];
const TIE_COLORS = ["#8b2635", "#c9a227", "#1f5f8b", "#2e7d32", "#111111", "#b03a2e"];
const GOWN_COLORS = ["#7a1030", "#111111", "#0f4c3a", "#2c2c6c", "#b8860b", "#6a0dad", "#c2185b", "#f2e6d0"];

/** Coordinated formalwear overrides the rolled pieces. */
function applyFormal(rng: Rng, outfit: Outfit, kind: FormalType): void {
  if (kind === "suit") {
    const suit = jitterHex(rng.pick(SUIT_COLORS), rng, 0.03);
    const shirt = rng.pick(SHIRT_COLORS);
    const tie = rng.pick(TIE_COLORS);
    outfit.top = { type: "dress_shirt", primary: shirt, secondary: tie, fit: "slim", pattern: "solid", details: { tucked: true } };
    outfit.outerwear = { type: "blazer", primary: suit, secondary: tie, fit: "regular", pattern: "solid", details: { open: rng.chance(0.4) } };
    outfit.bottom = { type: "slacks", primary: suit, secondary: tie, fit: "slim", pattern: "solid", details: {} };
    outfit.shoes = { type: rng.chance(0.7) ? "oxfords" : "loafers", primary: rng.chance(0.6) ? "#1a1a1a" : "#4a2e1a", secondary: "#2b2b2b", fit: "regular", pattern: "solid", details: {} };
    outfit.accessory = { type: rng.chance(0.75) ? "tie" : "pocket_square", primary: tie, secondary: shirt, fit: "regular", pattern: rng.chance(0.4) ? "stripes" : "solid", details: {} };
    if (outfit.headwear.type !== "cowboy") outfit.headwear = { ...outfit.headwear, type: "none" };
    outfit.formal = "suit";
  } else if (kind === "gown") {
    const gown = jitterHex(rng.pick(GOWN_COLORS), rng, 0.03);
    outfit.top = { type: "gown", primary: gown, secondary: rng.chance(0.5) ? "#d9a441" : "#d6d6d6", fit: "slim", pattern: "solid", details: {} };
    outfit.outerwear = { ...outfit.outerwear, type: "none" };
    outfit.bottom = { type: "none", primary: gown, secondary: gown, fit: "slim", pattern: "solid", details: {} };
    outfit.shoes = { type: "heels", primary: rng.chance(0.5) ? "#1a1a1a" : gown, secondary: "#d9a441", fit: "regular", pattern: "solid", details: {} };
    outfit.accessory = { type: rng.chance(0.6) ? "chain" : "none", primary: "#d9a441", secondary: "#d9a441", fit: "regular", pattern: "solid", details: {} };
    outfit.headwear = { ...outfit.headwear, type: "none" };
    outfit.formal = "gown";
  }
}

/** Deterministic outfit from a seed. Same seed, same fit, always. */
export function generateOutfit(seed: string, opts: GenerateOptions = {}): Outfit {
  const rng = createRng(`outfit:${seed}`);
  const forced = opts.theme ? THEMES.find((t) => t.id === opts.theme) : undefined;
  const chaos = forced ? false : opts.theme === "chaos" ? true : rng.chance(CHAOS_ROLL_CHANCE);
  const theme = forced ?? (chaos ? chaosTheme() : rng.pick(THEMES));
  const palette = rng.pick(theme.palettes);
  const fit = rng.weighted(theme.fit);

  // Costume roll happens on its own draw so forcing one never shifts the rest.
  const costumeRoll = rng.next();
  let costume: CostumeType = "none";
  if (opts.costume === "special") costume = rng.pick(COSTUME_TYPES.filter((c) => c !== "none"));
  else if (opts.costume) costume = opts.costume;
  else if (costumeRoll < COSTUME_CHANCE) costume = rng.pick(COSTUME_TYPES.filter((c) => c !== "none"));
  const mascot: MascotAnimal | null = costume === "mascot" ? (opts.mascot ?? rng.pick(MASCOT_ANIMALS)) : null;

  const outfit: Outfit = {
    seed,
    theme: theme.id,
    headwear: rollSlotGarment(rng, theme, "headwear", palette, fit),
    eyewear: rollSlotGarment(rng, theme, "eyewear", palette, fit),
    top: rollSlotGarment(rng, theme, "top", palette, fit),
    outerwear: rollSlotGarment(rng, theme, "outerwear", palette, fit),
    bottom: rollSlotGarment(rng, theme, "bottom", palette, fit),
    shoes: rollSlotGarment(rng, theme, "shoes", palette, fit),
    accessory: rollSlotGarment(rng, theme, "accessory", palette, fit),
    wildcards: [],
    costume,
    mascot,
    formal: "none",
  };

  if (!chaos) {
    outfit.wildcards.push(applyWildcard(rng, outfit, theme));
    if (rng.chance(OPTIONAL_WILDCARD_CHANCE)) outfit.wildcards.push(applyWildcard(rng, outfit, theme));
  }

  // Formalwear: its own draw, only for plain (non-costume) rolls.
  const formalRoll = rng.next();
  const formal: FormalType = opts.formal ?? (formalRoll < FORMAL_CHANCE ? (rng.chance(0.5) ? "suit" : "gown") : "none");
  if (costume === "none" && formal !== "none") applyFormal(rng, outfit, formal);

  return outfit;
}

/** Quantize a hex color to a coarse bucket for signatures. */
function quantize(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const q = (v: number) => Math.round(v / 64);
  return `${q((n >> 16) & 255)}${q((n >> 8) & 255)}${q(n & 255)}`;
}

/** Per-slot signature tokens: garment type + quantized primary color. */
export function outfitSignature(outfit: Outfit): string[] {
  if (outfit.costume !== "none") return SLOTS.map((slot) => `${slot}:costume:${outfit.costume}:${outfit.mascot ?? ""}`);
  return SLOTS.map((slot) => `${slot}:${outfit[slot].type}:${quantize(outfit[slot].primary)}`);
}

/** Number of slots on which two signatures agree. */
export function signatureOverlap(a: string[], b: string[]): number {
  return a.filter((token, i) => token === b[i]).length;
}

/**
 * Roll a fresh outfit, silently re-rolling when it matches any recent
 * signature on 4+ slots (max 10 attempts).
 */
export function generateUniqueOutfit(seed: string, recent: readonly string[][], opts: GenerateOptions = {}): Outfit {
  let candidate = generateOutfit(seed, opts);
  for (let attempt = 1; attempt <= 10; attempt++) {
    const sig = outfitSignature(candidate);
    const clash = recent.some((r) => signatureOverlap(sig, r) >= 4);
    if (!clash) return candidate;
    candidate = generateOutfit(`${seed}#${attempt}`, opts);
  }
  return candidate;
}
