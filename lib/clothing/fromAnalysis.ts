import type { Analysis, Item } from "@/lib/schema";
import { generateOutfit } from "./generator";
import type { AccessoryType, BottomType, EyewearType, HeadwearType, Outfit, OuterwearType, ShoeType, TopType } from "./types";

/**
 * Dress a mannequin in the outfit the judge actually detected: each item's
 * name picks the closest garment type and its color names the fabric color.
 * Slots the photo did not show fall back to a plain seeded roll (hidden slots
 * like headwear and eyewear stay empty rather than inventing a hat).
 */

type Rule<T extends string> = [RegExp, T];

const TOPS: Rule<TopType>[] = [
  [/hood/i, "hoodie"],
  [/turtle|mock ?neck/i, "turtleneck"],
  [/quarter|1\/4|half.?zip/i, "quarterzip"],
  [/polo/i, "polo"],
  [/tank|sleeveless|camisole|vest top/i, "tank"],
  [/dress shirt|oxford shirt|formal shirt/i, "dress_shirt"],
  [/button|flannel|shirt jacket|overshirt|camp collar|hawaiian|oxford/i, "buttonup"],
  [/crew|sweatshirt|sweater|jumper|knit|pullover/i, "crewneck"],
  [/long.?sleeve|henley|thermal|jersey/i, "longsleeve"],
  [/tee|t-?shirt|graphic|top|shirt|blouse/i, "tee"],
];
/** One-piece outfits (the item may be filed under top or bottom): a dress, or a gown when it reaches the floor. */
const ONE_PIECE: Rule<"dress" | "gown">[] = [
  [/gown|maxi|evening dress|formal dress|prom dress|ball dress/i, "gown"],
  [/dress|romper|jumpsuit|playsuit|pinafore/i, "dress"],
];
/** "dress shirt", "dress pants", "dress shoes" are not dresses. */
const NOT_A_DRESS = /dress (shirt|pant|trouser|slack|shoe|sock|boot)/i;

function onePiece(item: Item): "dress" | "gown" | null {
  if (NOT_A_DRESS.test(item.name) || !(item.category === "top" || item.category === "bottom")) return null;
  return match(ONE_PIECE, item);
}

const OUTERWEAR: Rule<OuterwearType>[] = [
  [/puffer|down jacket|quilted/i, "puffer"],
  [/blazer|sport ?coat|suit jacket/i, "blazer"],
  [/varsity|letterman|bomber|racing/i, "varsity"],
  [/denim|jean jacket|trucker/i, "denim"],
  [/trench/i, "trench"],
  [/overcoat|peacoat|wool coat|topcoat|coat/i, "overcoat"],
  [/fleece|sherpa/i, "fleece"],
  [/windbreaker|shell|anorak|rain|track jacket/i, "windbreaker"],
  [/leather|moto/i, "leather"],
  [/cardigan/i, "cardigan"],
  [/waistcoat|suit vest/i, "suitvest"],
  [/vest|gilet/i, "vest"],
  [/jacket/i, "windbreaker"],
];
const BOTTOMS: Rule<BottomType>[] = [
  [/cargo/i, "cargos"],
  [/short/i, "shorts"],
  [/skirt|skort/i, "skirt"],
  [/track|nylon pant|parachute/i, "trackpants"],
  [/sweat|jogger|lounge/i, "sweatpants"],
  [/slack|trouser|chino|suit pant|dress pant|khaki/i, "slacks"],
  [/jean|denim/i, "jeans"],
  [/pant|legging/i, "slacks"],
];
const SHOES: Rule<ShoeType>[] = [
  [/high.?top|hi-?top|dunk high|chuck/i, "hightops"],
  [/runner|running|trainer|chunky|dad shoe/i, "runners"],
  [/hik|trail/i, "hikers"],
  [/boot|chelsea|doc|martens/i, "boots"],
  [/loafer|moccasin|boat shoe/i, "loafers"],
  [/oxford|derby|dress shoe|brogue/i, "oxfords"],
  [/heel|pump|stiletto/i, "heels"],
  [/slide|sandal|flip|croc|clog/i, "slides"],
  [/sneaker|shoe|kicks/i, "sneakers"],
];
const HEADWEAR: Rule<HeadwearType>[] = [
  [/beanie|toque/i, "beanie"],
  [/bucket/i, "bucket"],
  [/cowboy|stetson/i, "cowboy"],
  [/headband|sweatband/i, "headband"],
  [/bandana|durag|du-rag|scarf/i, "bandana"],
  [/cap|hat|snapback/i, "cap"],
];
const EYEWEAR: Rule<EyewearType>[] = [
  [/aviator/i, "aviators"],
  [/sport|wrap/i, "sport_shades"],
  [/oversized/i, "oversized_shades"],
  [/tiny|small|rectangular sun/i, "tiny_shades"],
  [/round sun/i, "round_shades"],
  [/sun|shade/i, "wayfarers"],
  [/round/i, "round_glasses"],
  [/thick|chunky/i, "thick_glasses"],
  [/glass|spectacle/i, "rect_glasses"],
];
const ACCESSORIES: Rule<AccessoryType>[] = [
  [/backpack|rucksack/i, "backpack"],
  [/bag|tote|crossbody|sling|purse|pouch/i, "crossbody"],
  [/headphone|earbud|airpod/i, "headphones"],
  [/chain|necklace|pendant|jewel/i, "chain"],
  [/watch/i, "watch"],
  [/scarf/i, "scarf"],
  [/carabiner|keychain|lanyard/i, "carabiner"],
  [/tie\b|necktie|bow tie/i, "tie"],
  [/pocket square/i, "pocket_square"],
];

/** Clothing color words -> fabric hex (longest phrases first). */
const COLORS: [RegExp, string][] = [
  [/light ?blue|light wash|sky|baby blue/i, "#8cc4e8"],
  [/light ?gr[ae]y|heather/i, "#bfc2c6"],
  [/dark ?gr[ae]y|charcoal|graphite/i, "#3a3c40"],
  [/navy|midnight/i, "#1f2a44"],
  [/denim|indigo|wash/i, "#4a6a8f"],
  [/burgundy|maroon|wine|oxblood/i, "#6d1f2a"],
  [/olive|army|military/i, "#6b6b35"],
  [/khaki|sand/i, "#b8a77a"],
  [/beige|oatmeal|stone/i, "#d8c7a6"],
  [/camel|caramel/i, "#c09055"],
  [/tan|brown|chocolate|mocha|coffee/i, "#6b4428"],
  [/cream|ivory|off.?white|ecru/i, "#efe6d0"],
  [/lavender|lilac/i, "#b9a6de"],
  [/purple|violet|plum/i, "#6b4aa0"],
  [/teal|turquoise|aqua/i, "#2a8a8a"],
  [/mint|sage/i, "#9cc7a4"],
  [/green|forest|emerald/i, "#3f8a4a"],
  [/pink|rose|blush/i, "#e89ab8"],
  [/red|crimson|scarlet/i, "#b3262e"],
  [/orange|rust|burnt/i, "#e0782a"],
  [/yellow|mustard|gold/i, "#e0b83a"],
  [/silver|metallic/i, "#c0c0c0"],
  [/gr[ae]y/i, "#8a8d91"],
  [/blue|cobalt|royal/i, "#2f5fb3"],
  [/white/i, "#f2f2f0"],
  [/black|onyx|jet/i, "#1d1d1f"],
];

export function colorHex(color: string): string | null {
  for (const [re, hex] of COLORS) if (re.test(color)) return hex;
  return null;
}

function match<T extends string>(rules: Rule<T>[], item: Item): T | null {
  for (const [re, type] of rules) if (re.test(item.name)) return type;
  return null;
}

/** The detected outfit as mannequin garments (seeded, so the same scan always dresses the same). */
export function outfitFromAnalysis(analysis: Analysis, seed: string): Outfit {
  const base = generateOutfit(`scan:${seed}`, { costume: "none", formal: "none" });
  const outfit: Outfit = {
    ...base,
    theme: "detected",
    wildcards: [],
    headwear: { ...base.headwear, type: "none" },
    eyewear: { ...base.eyewear, type: "none" },
    outerwear: { ...base.outerwear, type: "none" },
    accessory: { ...base.accessory, type: "none" },
  };
  const tint = <G extends { primary: string; secondary: string }>(g: G, item: Item): G => {
    const hex = colorHex(item.color) ?? colorHex(item.name);
    return hex ? { ...g, primary: hex, pattern: "solid" } : g;
  };
  let sawTop = false;
  let sawDress = false;
  for (const item of analysis.items) {
    const piece = sawDress ? null : onePiece(item);
    if (piece) {
      // A dress is the top and the bottom: legs stay bare (tights and leggings under it do not become jeans).
      outfit.top = tint({ ...outfit.top, type: piece, fit: "slim", pattern: "solid" }, item);
      outfit.bottom = { ...outfit.bottom, type: "none" };
      sawTop = sawDress = true;
      continue;
    }
    switch (item.category) {
      case "top": {
        const t = match(TOPS, item);
        // A jacket filed under "top" is really outerwear.
        const o = t === null || t === "tee" ? match(OUTERWEAR, item) : null;
        if (o && /jacket|coat|blazer|vest|cardigan|fleece/i.test(item.name)) outfit.outerwear = tint({ ...outfit.outerwear, type: o }, item);
        else if (!sawTop) {
          outfit.top = tint({ ...outfit.top, type: t ?? "tee" }, item);
          sawTop = true;
        }
        break;
      }
      case "outerwear":
        outfit.outerwear = tint({ ...outfit.outerwear, type: match(OUTERWEAR, item) ?? "windbreaker" }, item);
        break;
      case "bottom": {
        const b = match(BOTTOMS, item);
        // Under a dress only a real skirt or shorts would show; tights and leggings stay bare legs.
        if (sawDress && b !== "skirt" && b !== "shorts") break;
        outfit.bottom = tint({ ...outfit.bottom, type: b ?? "jeans" }, item);
        break;
      }
      case "shoes":
        outfit.shoes = tint({ ...outfit.shoes, type: match(SHOES, item) ?? "sneakers" }, item);
        break;
      case "headwear":
        outfit.headwear = tint({ ...outfit.headwear, type: match(HEADWEAR, item) ?? "cap" }, item);
        break;
      case "eyewear":
        outfit.eyewear = tint({ ...outfit.eyewear, type: match(EYEWEAR, item) ?? "wayfarers" }, item);
        break;
      case "bag":
      case "jewelry":
      case "watch":
      case "accessory": {
        const a = match(ACCESSORIES, item) ?? (item.category === "watch" ? "watch" : item.category === "bag" ? "crossbody" : item.category === "jewelry" ? "chain" : null);
        if (a && outfit.accessory.type === "none") outfit.accessory = tint({ ...outfit.accessory, type: a }, item);
        break;
      }
    }
  }
  if (!sawDress && outfit.bottom.type === "none") outfit.bottom = { ...outfit.bottom, type: "jeans" };
  return outfit;
}
