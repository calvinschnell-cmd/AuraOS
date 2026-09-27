import { z } from "zod";
import { classifierConfig } from "@/lib/config";
import { nameColor, readPalette } from "@/lib/palette";
import { box2dSchema, type Analysis, type Box2D } from "@/lib/schema";

/**
 * Client for the local garment segmentation sidecar (ml-service/). Stage 1 of
 * analysis: segformer finds garment regions on the GPU and measures each
 * one's dominant colors, then the scoring model gets those labels, colors and
 * a palette read as hints, and we snap item boxes / the face box to the
 * pixel-accurate regions. Every failure degrades to image-only scoring.
 */

export const garmentSchema = z.object({
  /** Segformer label, e.g. "Upper-clothes", "Pants", "Shoes" (left/right merged). */
  label: z.string().min(1),
  box_2d: box2dSchema,
  /** Fraction of the image covered by the region, 0-1. */
  area: z.number().min(0).max(1),
  /** Dominant colors measured from the region's pixels (older sidecars omit it). */
  colors: z.array(z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/i), share: z.number().min(0).max(1) })).default([]),
});
export type Garment = z.infer<typeof garmentSchema>;

export const segmentationSchema = z.object({
  garments: z.array(garmentSchema),
  face_box: box2dSchema.nullable(),
  device: z.string(),
  ms: z.number(),
});
export type Segmentation = z.infer<typeof segmentationSchema>;

/** POST the image to the sidecar. Null when disabled, down, slow or malformed. */
export async function segmentGarments(data: Buffer, mimeType: string): Promise<Segmentation | null> {
  return (await classifyGarments(data, mimeType)).seg;
}

export type ClassifierStatus = "used" | "skipped" | "unavailable";

/**
 * The classifier stage with its outcome (CLASSIFIER_MODE, see classifierConfig).
 * Never throws: skip mode, a missing URL, a timeout or a bad reply all mean
 * "score without it", and that is logged.
 */
export async function classifyGarments(data: Buffer, mimeType: string, config = classifierConfig()): Promise<{ seg: Segmentation | null; status: ClassifierStatus }> {
  if (config.mode === "skip" || !config.url) {
    console.info(`[aura] classifier skipped (CLASSIFIER_MODE=${config.mode}${config.url ? "" : ", no url"}), scoring image only`);
    return { seg: null, status: "skipped" };
  }
  try {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(data)], { type: mimeType }), "frame.jpg");
    const res = await fetch(`${config.url}/segment`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = segmentationSchema.safeParse(await res.json());
    if (!parsed.success) throw parsed.error;
    return { seg: parsed.data, status: "used" };
  } catch (err) {
    console.warn(`[aura] classifier unavailable at ${config.url} (${config.mode}), skipped, scoring image only:`, err instanceof Error ? err.message : err);
    return { seg: null, status: "unavailable" };
  }
}

/** Prompt addendum listing the detected regions. Empty string without a segmentation. */
export function describeGarments(seg: Segmentation | null): string {
  if (!seg) return "";
  if (seg.garments.length === 0) {
    return "\nA clothing segmentation model found NO garments in this photo. Double-check whether an outfit is visible.";
  }
  const colorsOf = (g: Garment) =>
    g.colors.length ? `, colors: ${g.colors.map((c) => `${nameColor(c.hex)} ${c.hex.toUpperCase()} ${Math.round(c.share * 100)}%`).join(", ")}` : "";
  const lines = seg.garments.map((g) => `- ${g.label}: box_2d [${g.box_2d.join(", ")}], ${Math.round(g.area * 100)}% of image${colorsOf(g)}`);
  const palette = readPalette(seg.garments);
  return [
    "",
    "A clothing segmentation model detected these garment regions (label: box_2d [ymin, xmin, ymax, xmax] 0-1000, share of image, colors measured from the pixels):",
    ...lines,
    "For each item, set segment to the exact label above that it belongs to (null if none, e.g. jewelry or a watch) and reuse that region's box_2d.",
    "The list can miss small accessories and merges layers (a jacket over a shirt is one Upper-clothes region), so still list every visible item.",
    ...(palette
      ? [
          `Measured palette: ${palette.summary}.`,
          "Trust these measured colors over your own guess when naming item colors and rating color_harmony (lighting can shift them slightly).",
        ]
      : []),
  ].join("\n");
}

/**
 * Replace model-guessed boxes with segmentation boxes: an item whose segment
 * label is claimed by exactly one item takes that region's box (shared
 * regions, like a jacket over a shirt, keep the model's boxes). The face box
 * comes from segmentation whenever it found a face, since share cards blur it.
 */
export function applySegmentation(analysis: Analysis, segmentRefs: readonly (string | null | undefined)[], seg: Segmentation | null): Analysis {
  if (!seg) return analysis;
  const byLabel = new Map(seg.garments.map((g) => [g.label.toLowerCase(), g.box_2d] as const));
  const refs = segmentRefs.map((r) => (typeof r === "string" ? r.trim().toLowerCase() : null));
  const claims = new Map<string, number>();
  for (const r of refs) if (r && byLabel.has(r)) claims.set(r, (claims.get(r) ?? 0) + 1);
  const items = analysis.items.map((item, i) => {
    const r = refs[i];
    const box = r && claims.get(r) === 1 ? byLabel.get(r) : undefined;
    return box ? { ...item, box_2d: [...box] as Box2D } : item;
  });
  return { ...analysis, items, face_box: seg.face_box ? ([...seg.face_box] as Box2D) : analysis.face_box };
}
