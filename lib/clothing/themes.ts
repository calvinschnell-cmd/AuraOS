import type {
  AccessoryType,
  BottomType,
  EyewearType,
  FitWidth,
  HeadwearType,
  OuterwearType,
  ShoeType,
  TopType,
} from "./types";

/**
 * Clothing themes. INTERNAL ONLY: theme names are never shown to the person
 * (they appear in the D debug overlay only).
 */

export type Weighted<T> = readonly (readonly [T, number])[];

export interface Theme {
  id: string;
  top: Weighted<TopType>;
  outerwear: Weighted<OuterwearType>;
  bottom: Weighted<BottomType>;
  shoes: Weighted<ShoeType>;
  headwear: Weighted<HeadwearType>;
  /** Roughly half of every theme goes without eyewear. */
  eyewear: Weighted<EyewearType>;
  accessory: Weighted<AccessoryType>;
  fit: Weighted<FitWidth>;
  /** 4 to 6 palettes; each palette is a list of hex colors. */
  palettes: readonly (readonly string[])[];
}

const SHADES_CASUAL: Weighted<EyewearType> = [
  ["none", 10],
  ["wayfarers", 2],
  ["sport_shades", 2],
  ["tiny_shades", 1],
  ["oversized_shades", 1],
  ["round_glasses", 2],
  ["rect_glasses", 2],
];
const SHADES_CLASSIC: Weighted<EyewearType> = [
  ["none", 10],
  ["aviators", 3],
  ["wayfarers", 2],
  ["round_glasses", 2],
  ["rect_glasses", 2],
  ["thick_glasses", 1],
];
const SHADES_TECH: Weighted<EyewearType> = [
  ["none", 10],
  ["sport_shades", 4],
  ["tiny_shades", 2],
  ["rect_glasses", 2],
  ["thick_glasses", 2],
];
const SHADES_Y2K: Weighted<EyewearType> = [
  ["none", 9],
  ["tiny_shades", 3],
  ["oversized_shades", 3],
  ["round_shades", 2],
  ["sport_shades", 1],
];
const SHADES_NERD: Weighted<EyewearType> = [
  ["none", 10],
  ["thick_glasses", 4],
  ["rect_glasses", 3],
  ["round_glasses", 2],
  ["wayfarers", 1],
];

export const THEMES: readonly Theme[] = [
  {
    id: "streetwear",
    top: [["hoodie", 4], ["tee", 4], ["longsleeve", 2], ["crewneck", 2]],
    outerwear: [["none", 3], ["puffer", 3], ["varsity", 2], ["windbreaker", 2], ["denim", 1]],
    bottom: [["jeans", 4], ["cargos", 3], ["sweatpants", 2], ["shorts", 1]],
    shoes: [["sneakers", 4], ["hightops", 3], ["runners", 2]],
    headwear: [["none", 3], ["cap", 3], ["beanie", 2]],
    eyewear: SHADES_CASUAL,
    accessory: [["none", 3], ["chain", 3], ["crossbody", 2], ["headphones", 2]],
    fit: [["oversized", 5], ["regular", 3], ["slim", 1]],
    palettes: [
      ["#1b1b1f", "#e8e6df", "#c0392b", "#8e8e93"],
      ["#2c2f3a", "#f2f0e9", "#3d6fd9", "#f5c400"],
      ["#3b2a1a", "#d9c8a9", "#0f0f0f", "#7a9e7e"],
      ["#111111", "#ff6b35", "#efefef", "#2b2b2b"],
      ["#4a4e69", "#9a8c98", "#f2e9e4", "#22223b"],
    ],
  },
  {
    id: "old money",
    top: [["buttonup", 3], ["dress_shirt", 3], ["polo", 3], ["crewneck", 2], ["turtleneck", 2]],
    outerwear: [["none", 2], ["blazer", 4], ["overcoat", 2], ["trench", 2], ["cardigan", 2], ["suitvest", 1]],
    bottom: [["slacks", 6], ["jeans", 1], ["shorts", 1], ["skirt", 1]],
    shoes: [["loafers", 5], ["oxfords", 3], ["boots", 2], ["heels", 1]],
    headwear: [["none", 7], ["cap", 1]],
    eyewear: SHADES_CLASSIC,
    accessory: [["none", 3], ["watch", 4], ["scarf", 1], ["draped_sweater", 2], ["pocket_square", 1]],
    fit: [["regular", 5], ["slim", 3], ["oversized", 1]],
    palettes: [
      ["#f3ead8", "#1f2a44", "#7b5a3c", "#b8a27a"],
      ["#e9e2d0", "#2f4f3a", "#5b3a29", "#d4c5a0"],
      ["#fbf7ef", "#8b1e2d", "#1c1c1c", "#c8b58e"],
      ["#e6e0d4", "#3a3f5c", "#c3a27e", "#f5f2ea"],
      ["#d8cdb8", "#1d3d2f", "#8c6a4f", "#efe9dc"],
    ],
  },
  {
    id: "quiet luxury",
    top: [["dress_shirt", 3], ["turtleneck", 3], ["crewneck", 2], ["polo", 2]],
    outerwear: [["overcoat", 3], ["blazer", 3], ["cardigan", 2], ["trench", 2], ["none", 2]],
    bottom: [["slacks", 7], ["skirt", 2]],
    shoes: [["loafers", 4], ["oxfords", 3], ["boots", 2], ["heels", 2]],
    headwear: [["none", 9]],
    eyewear: SHADES_CLASSIC,
    accessory: [["watch", 4], ["none", 3], ["scarf", 2], ["draped_sweater", 1]],
    fit: [["regular", 6], ["slim", 3]],
    palettes: [
      ["#d9cfc1", "#2b2b2b", "#8a7968", "#f2ede6"],
      ["#c9b99b", "#1f1f1f", "#6e5b45", "#efe7da"],
      ["#e0d6c8", "#3b3b3b", "#a08c74", "#faf7f2"],
      ["#b9a58c", "#262626", "#5a4a3a", "#ece4d8"],
      ["#cbc2b2", "#141414", "#7d6d5b", "#f5f1eb"],
    ],
  },
  {
    id: "finance bro",
    top: [["dress_shirt", 5], ["quarterzip", 3], ["polo", 2]],
    outerwear: [["suitvest", 3], ["blazer", 3], ["none", 3], ["overcoat", 1]],
    bottom: [["slacks", 8], ["jeans", 1]],
    shoes: [["oxfords", 4], ["loafers", 4], ["sneakers", 1]],
    headwear: [["none", 8], ["cap", 1]],
    eyewear: SHADES_CLASSIC,
    accessory: [["watch", 5], ["tie", 3], ["none", 2], ["pocket_square", 1]],
    fit: [["slim", 5], ["regular", 4]],
    palettes: [
      ["#dbe7f5", "#1f2a44", "#3d3d3d", "#8b2635"],
      ["#ffffff", "#2b3a55", "#5a5a5a", "#c9a227"],
      ["#e8eef7", "#101820", "#4b5563", "#2e7d32"],
      ["#f4f6fa", "#243447", "#6b7280", "#b03a2e"],
    ],
  },
  {
    id: "gorpcore",
    top: [["longsleeve", 3], ["tee", 3], ["quarterzip", 3], ["hoodie", 1]],
    outerwear: [["fleece", 4], ["windbreaker", 3], ["puffer", 2], ["vest", 2], ["none", 1]],
    bottom: [["cargos", 4], ["trackpants", 2], ["shorts", 2], ["jeans", 1]],
    shoes: [["hikers", 5], ["runners", 3], ["boots", 1]],
    headwear: [["beanie", 3], ["cap", 2], ["bucket", 2], ["none", 2]],
    eyewear: SHADES_TECH,
    accessory: [["carabiner", 4], ["backpack", 3], ["crossbody", 1], ["none", 1]],
    fit: [["regular", 4], ["oversized", 3], ["slim", 1]],
    palettes: [
      ["#f26b21", "#2e2e2e", "#3f5f3a", "#d8d2c4"],
      ["#3b5a3b", "#c8b48a", "#1b1b1b", "#e3e3dc"],
      ["#8c4a2f", "#f2e1c1", "#2d3a2e", "#4a5a6a"],
      ["#1f3a5f", "#f5d547", "#2b2b2b", "#c9c9c9"],
      ["#5a6650", "#e7d8b1", "#c14a09", "#242424"],
    ],
  },
  {
    id: "Y2K",
    top: [["tee", 4], ["tank", 3], ["longsleeve", 2], ["polo", 1]],
    outerwear: [["none", 4], ["denim", 3], ["leather", 2], ["varsity", 1]],
    bottom: [["jeans", 4], ["skirt", 3], ["cargos", 2], ["trackpants", 1]],
    shoes: [["sneakers", 3], ["runners", 3], ["boots", 2], ["slides", 1]],
    headwear: [["none", 4], ["bandana", 2], ["cap", 2], ["headband", 1]],
    eyewear: SHADES_Y2K,
    accessory: [["chain", 3], ["crossbody", 3], ["none", 2], ["headphones", 1]],
    fit: [["slim", 4], ["regular", 3], ["oversized", 2]],
    palettes: [
      ["#ff5fa2", "#111111", "#c0c0c0", "#ffffff"],
      ["#7ec8e3", "#f7f7f7", "#ff8c00", "#2a2a2a"],
      ["#b19cd9", "#000000", "#e0e0e0", "#ff4d6d"],
      ["#8fd3f4", "#ff9de2", "#1b1b1b", "#f2f2f2"],
      ["#d1d5db", "#1e1e1e", "#f9c74f", "#f08080"],
    ],
  },
  {
    id: "techwear",
    top: [["longsleeve", 4], ["turtleneck", 3], ["tee", 2], ["quarterzip", 1]],
    outerwear: [["windbreaker", 4], ["vest", 3], ["puffer", 2], ["none", 1]],
    bottom: [["cargos", 6], ["trackpants", 3], ["jeans", 1]],
    shoes: [["runners", 4], ["hightops", 2], ["boots", 3]],
    headwear: [["none", 3], ["cap", 2], ["beanie", 2]],
    eyewear: SHADES_TECH,
    accessory: [["crossbody", 4], ["backpack", 2], ["carabiner", 2], ["none", 1]],
    fit: [["regular", 4], ["oversized", 3], ["slim", 2]],
    palettes: [
      ["#0f0f10", "#2a2d31", "#4a4f57", "#9ee7ff"],
      ["#151515", "#3a3a3a", "#6c6f75", "#c0c0c0"],
      ["#1a1f24", "#2c3e50", "#7f8c8d", "#e6e6e6"],
      ["#101010", "#232323", "#ff3b3b", "#4d4d4d"],
      ["#0e0e0e", "#3d3d3d", "#6b8e23", "#d0d0d0"],
    ],
  },
  {
    id: "athleisure",
    top: [["tee", 3], ["tank", 3], ["quarterzip", 2], ["longsleeve", 2]],
    outerwear: [["none", 5], ["windbreaker", 2], ["vest", 1]],
    bottom: [["trackpants", 4], ["shorts", 3], ["sweatpants", 3]],
    shoes: [["runners", 6], ["sneakers", 2], ["slides", 1]],
    headwear: [["none", 4], ["cap", 3], ["headband", 2]],
    eyewear: SHADES_TECH,
    accessory: [["none", 4], ["watch", 2], ["headphones", 2], ["crossbody", 1]],
    fit: [["slim", 4], ["regular", 4], ["oversized", 1]],
    palettes: [
      ["#1c1c1c", "#f5f5f5", "#39ff14", "#5e5e5e"],
      ["#2b2d42", "#edf2f4", "#ef233c", "#8d99ae"],
      ["#0b3d91", "#f2f2f2", "#ff7f11", "#1a1a1a"],
      ["#3a3a3a", "#e0e0e0", "#ffd60a", "#111111"],
      ["#26413c", "#e8f1f2", "#ff6b6b", "#1b1b1b"],
    ],
  },
  {
    id: "preppy",
    top: [["polo", 4], ["buttonup", 3], ["crewneck", 3], ["tee", 1]],
    outerwear: [["none", 3], ["cardigan", 3], ["blazer", 2], ["varsity", 2], ["vest", 1]],
    bottom: [["slacks", 4], ["shorts", 3], ["jeans", 2], ["skirt", 1]],
    shoes: [["loafers", 4], ["sneakers", 3], ["boots", 1]],
    headwear: [["none", 5], ["cap", 2]],
    eyewear: SHADES_CLASSIC,
    accessory: [["none", 3], ["watch", 3], ["draped_sweater", 2], ["crossbody", 1]],
    fit: [["regular", 5], ["slim", 3], ["oversized", 1]],
    palettes: [
      ["#1f3a5f", "#f7f3e9", "#b22234", "#e8d9b0"],
      ["#2e5339", "#fdf6e3", "#d9a441", "#ffffff"],
      ["#ffc0cb", "#1b2a41", "#f8f8f8", "#c9b79c"],
      ["#8fb4d9", "#ffffff", "#1c2541", "#e4d5b7"],
      ["#f4e1a1", "#274c77", "#ffffff", "#a3cef1"],
    ],
  },
  {
    id: "grunge",
    top: [["tee", 4], ["longsleeve", 3], ["tank", 1], ["buttonup", 2]],
    outerwear: [["none", 2], ["denim", 3], ["leather", 3], ["cardigan", 2]],
    bottom: [["jeans", 6], ["cargos", 2], ["skirt", 1]],
    shoes: [["boots", 5], ["hightops", 3], ["sneakers", 1]],
    headwear: [["none", 4], ["beanie", 4], ["bandana", 1]],
    eyewear: SHADES_CASUAL,
    accessory: [["none", 3], ["chain", 3], ["backpack", 1]],
    fit: [["oversized", 4], ["regular", 3], ["slim", 2]],
    palettes: [
      ["#1a1a1a", "#5c4033", "#8b0000", "#3f3f3f"],
      ["#2b2b2b", "#6b7a5a", "#d0c8b8", "#111111"],
      ["#3d2b3d", "#141414", "#a52a2a", "#7d7d7d"],
      ["#232323", "#4b3621", "#c9c9c9", "#6e1b1b"],
      ["#1e1e1e", "#2f4f4f", "#b5651d", "#4a4a4a"],
    ],
  },
  {
    id: "minimalist",
    top: [["tee", 4], ["turtleneck", 3], ["longsleeve", 2], ["crewneck", 2]],
    outerwear: [["none", 4], ["blazer", 2], ["trench", 1], ["overcoat", 1], ["cardigan", 1]],
    bottom: [["slacks", 5], ["jeans", 2], ["shorts", 1]],
    shoes: [["sneakers", 4], ["loafers", 3], ["boots", 2]],
    headwear: [["none", 8], ["beanie", 1]],
    eyewear: SHADES_NERD,
    accessory: [["none", 5], ["watch", 3]],
    fit: [["regular", 5], ["slim", 3], ["oversized", 2]],
    palettes: [
      ["#111111", "#f4f4f0", "#8a8a8a", "#2a2a2a"],
      ["#e9e9e4", "#1b1b1b", "#c9c9c4", "#6f6f6f"],
      ["#2c2c2c", "#d6d6d2", "#a8a8a3", "#f4f4f0"],
      ["#3b3b3b", "#efefea", "#7b7b76", "#101010"],
      ["#0a0a0a", "#ffffff", "#bdbdbd", "#4d4d4d"],
    ],
  },
  {
    id: "business casual",
    top: [["dress_shirt", 4], ["buttonup", 3], ["polo", 2], ["turtleneck", 1], ["crewneck", 1]],
    outerwear: [["blazer", 4], ["none", 3], ["cardigan", 2], ["suitvest", 1], ["overcoat", 1]],
    bottom: [["slacks", 7], ["jeans", 2], ["skirt", 1]],
    shoes: [["loafers", 4], ["oxfords", 3], ["boots", 2], ["sneakers", 1], ["heels", 1]],
    headwear: [["none", 9]],
    eyewear: SHADES_NERD,
    accessory: [["watch", 4], ["none", 3], ["tie", 2], ["pocket_square", 1]],
    fit: [["regular", 6], ["slim", 3]],
    palettes: [
      ["#2f3e5c", "#ffffff", "#8c8c8c", "#3d2b1f"],
      ["#4a4a4a", "#dfe7f2", "#1b1b1b", "#7a5c43"],
      ["#1f2933", "#e6eef7", "#a3b1c2", "#5b4636"],
      ["#5a6a7a", "#f2f2f2", "#2e2e2e", "#8b6b4a"],
      ["#343a40", "#cfe0f5", "#6c757d", "#212529"],
    ],
  },
  {
    id: "hackathon survivor",
    top: [["tee", 5], ["hoodie", 4], ["longsleeve", 1]],
    outerwear: [["none", 5], ["fleece", 2], ["puffer", 1], ["windbreaker", 1]],
    bottom: [["sweatpants", 4], ["shorts", 3], ["jeans", 2], ["trackpants", 1]],
    shoes: [["slides", 4], ["sneakers", 3], ["runners", 2]],
    headwear: [["none", 4], ["cap", 3], ["beanie", 2]],
    eyewear: SHADES_NERD,
    accessory: [["backpack", 4], ["headphones", 3], ["none", 2]],
    fit: [["oversized", 5], ["regular", 3]],
    palettes: [
      ["#1e2a44", "#d9d9d9", "#ff8c00", "#000000"],
      ["#333333", "#8ecae6", "#ffb703", "#023047"],
      ["#2b2b2b", "#e63946", "#f1faee", "#457b9d"],
      ["#1b1b1b", "#6a4c93", "#c0c0c0", "#f2f2f2"],
      ["#3a3a3a", "#00b4d8", "#ffffff", "#03045e"],
    ],
  },
  {
    id: "western",
    top: [["buttonup", 5], ["tee", 2], ["longsleeve", 2]],
    outerwear: [["denim", 4], ["none", 3], ["leather", 2], ["vest", 1]],
    bottom: [["jeans", 8], ["slacks", 1]],
    shoes: [["boots", 8], ["hikers", 1]],
    headwear: [["cowboy", 7], ["none", 2]],
    eyewear: [["none", 9], ["aviators", 4], ["wayfarers", 2]],
    accessory: [["none", 4], ["watch", 2], ["scarf", 2]],
    fit: [["regular", 5], ["slim", 3]],
    palettes: [
      ["#8b5a2b", "#3a5a8c", "#f2e8d5", "#2b2b2b"],
      ["#5c3d2e", "#243b53", "#e8dcc4", "#c0392b"],
      ["#a0522d", "#2f4f4f", "#f5f0e6", "#1c1c1c"],
      ["#6b4f3a", "#4a6fa5", "#efe6d2", "#3d3d3d"],
    ],
  },
  {
    id: "bummy",
    top: [["tee", 6], ["tank", 2], ["hoodie", 2]],
    outerwear: [["none", 8], ["fleece", 1]],
    bottom: [["shorts", 5], ["sweatpants", 4]],
    shoes: [["slides", 6], ["sneakers", 2]],
    headwear: [["none", 5], ["beanie", 2], ["cap", 1]],
    eyewear: [["none", 10], ["tiny_shades", 1], ["rect_glasses", 2], ["thick_glasses", 3]],
    accessory: [["none", 7], ["headphones", 1]],
    fit: [["oversized", 7], ["regular", 2]],
    palettes: [
      ["#6b6b6b", "#3a3a3a", "#9c9c9c", "#2b2b2b"],
      ["#7a7a6a", "#4c4c44", "#a5a596", "#1f1f1f"],
      ["#5f5f5f", "#8a8a8a", "#3c3c3c", "#b0b0a8"],
      ["#4f4f4f", "#c7c7bd", "#2a2a2a", "#7e7e72"],
    ],
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}
