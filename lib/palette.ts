/**
 * Pure color-palette reading for the analysis prompt. The segmentation
 * sidecar measures each garment's dominant colors from its pixels; this names
 * them the way people talk about clothes and reads the palette as a whole, so
 * the model rates color harmony from measured colors instead of guessing.
 */

export interface GarmentColor {
  hex: string;
  /** Share of the garment's pixels, 0-1. */
  share: number;
}

export interface PaletteGarment {
  label: string;
  /** Share of the image the garment covers, 0-1. */
  area: number;
  colors: GarmentColor[];
}

export type PaletteScheme = "neutral" | "accent" | "monochrome" | "analogous" | "complementary" | "triadic" | "clashing";

export interface PaletteRead {
  scheme: PaletteScheme;
  /** One line for the prompt, e.g. "neutral base (black, camel) with one accent (red)". */
  summary: string;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Clothing colors that read as neutral: they go with anything. */
export const NEUTRAL_COLORS = new Set(["black", "white", "cream", "charcoal", "grey", "light grey", "brown", "beige", "tan", "camel", "navy", "denim blue", "olive"]);

/** Human clothing color name for a hex value (rule-based on hue / saturation / lightness). */
export function nameColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  if (l < 0.13) return "black";
  if (l > 0.92 && s < 0.35) return "white";
  if (s < 0.12) return l < 0.3 ? "charcoal" : l < 0.72 ? "grey" : "light grey";
  if (l > 0.86 && s < 0.5 && h >= 25 && h < 65) return "cream";
  if (h >= 15 && h < 50) {
    if (l < 0.33) return "brown";
    if (s < 0.5 && l > 0.7) return "beige";
    if (s < 0.65 && l <= 0.7) return h >= 28 && h < 42 ? "camel" : "tan";
  }
  if (h >= 200 && h < 250 && l < 0.3) return "navy";
  if (h >= 195 && h < 230 && s < 0.5 && l < 0.62) return "denim blue";
  if ((h < 15 || h >= 340) && l < 0.35) return "burgundy";
  if (h >= 50 && h < 95 && s < 0.55 && l < 0.45) return "olive";
  if (h < 15 || h >= 345) return l > 0.72 ? "pink" : "red";
  if (h < 40) return "orange";
  if (h < 65) return "yellow";
  if (h < 95) return "lime";
  if (h < 160) return "green";
  if (h < 190) return "teal";
  if (h < 205) return "sky blue";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  return l > 0.65 ? "pink" : "magenta";
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Circular mean of weighted hues. */
function meanHue(hues: { h: number; w: number }[]): number {
  let x = 0;
  let y = 0;
  for (const { h, w } of hues) {
    x += Math.cos((h * Math.PI) / 180) * w;
    y += Math.sin((h * Math.PI) / 180) * w;
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** A color family must cover at least this share of the outfit to count as an accent. */
const MIN_ACCENT_WEIGHT = 0.05;
/** Neutrals below this share are noise (edges, shadows) and are left out of the summary. */
const MIN_NEUTRAL_WEIGHT = 0.03;

/** Read the outfit's palette as a whole. Null when there are no measured colors. */
export function readPalette(garments: readonly PaletteGarment[]): PaletteRead | null {
  const weighted = garments.flatMap((g) => g.colors.map((c) => ({ name: nameColor(c.hex), hsl: hexToHsl(c.hex), w: g.area * c.share })));
  const total = weighted.reduce((sum, c) => sum + c.w, 0);
  if (total <= 0) return null;

  const families = new Map<string, { w: number; hues: { h: number; w: number }[] }>();
  for (const c of weighted) {
    const f = families.get(c.name) ?? { w: 0, hues: [] };
    f.w += c.w / total;
    f.hues.push({ h: c.hsl.h, w: c.w });
    families.set(c.name, f);
  }
  const byWeight = [...families.entries()].sort((a, b) => b[1].w - a[1].w);
  const neutrals = byWeight.filter(([name, f]) => NEUTRAL_COLORS.has(name) && f.w >= MIN_NEUTRAL_WEIGHT).map(([name]) => name);
  const accents = byWeight.filter(([name, f]) => !NEUTRAL_COLORS.has(name) && f.w >= MIN_ACCENT_WEIGHT).map(([name, f]) => ({ name, hue: meanHue(f.hues) }));
  const base = neutrals.length ? `neutral base (${neutrals.join(", ")})` : "";
  const names = accents.map((a) => a.name).join(", ");

  if (accents.length === 0) return { scheme: "neutral", summary: `all neutrals (${neutrals.join(", ")}): clean, safe palette` };
  if (accents.length === 1) {
    return base
      ? { scheme: "accent", summary: `${base} with one accent (${names}): intentional` }
      : { scheme: "monochrome", summary: `monochrome ${names}: bold but cohesive` };
  }

  const pairs = accents.flatMap((a, i) => accents.slice(i + 1).map((b) => hueDistance(a.hue, b.hue)));
  const withBase = base ? `${base} + ` : "";
  if (pairs.every((d) => d <= 45)) return { scheme: "analogous", summary: `${withBase}neighboring colors (${names}): tonal and cohesive` };
  if (accents.length === 2 && pairs[0] >= 150) return { scheme: "complementary", summary: `${withBase}complementary colors (${names}): high contrast, can work if intentional` };
  if (accents.length === 3 && pairs.every((d) => d >= 90 && d <= 150)) return { scheme: "triadic", summary: `${withBase}triadic colors (${names}): loud, needs confidence` };
  return { scheme: "clashing", summary: `${withBase}${accents.length} competing colors (${names}) with no clear relationship: clashing` };
}
