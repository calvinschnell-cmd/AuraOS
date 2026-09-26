import { z } from "zod";

/** Styles the model may use in style_mix. "bummy" carries a scoring penalty. */
export const STYLES = [
  "streetwear",
  "old money",
  "professional",
  "gorpcore",
  "Y2K",
  "techwear",
  "athleisure",
  "preppy",
  "grunge",
  "minimalist",
  "cottagecore",
  "coquette",
  "balletcore",
  "boho",
  "glam",
  "clean girl",
  "business casual",
  "hackathon survivor",
  "bummy",
] as const;
export type Style = (typeof STYLES)[number];

export const ITEM_CATEGORIES = [
  "top",
  "outerwear",
  "bottom",
  "shoes",
  "accessory",
  "jewelry",
  "bag",
  "headwear",
  "eyewear",
  "watch",
] as const;

export const MODIFIER_TIERS = ["minor", "major", "legendary", "penalty"] as const;
export type ModifierTier = (typeof MODIFIER_TIERS)[number];

/** [ymin, xmin, ymax, xmax], normalized 0-1000 of the image. */
export const box2dSchema = z.tuple([
  z.number().min(0).max(1000),
  z.number().min(0).max(1000),
  z.number().min(0).max(1000),
  z.number().min(0).max(1000),
]);
export type Box2D = z.infer<typeof box2dSchema>;

export const styleMixEntrySchema = z.object({
  style: z.enum(STYLES),
  percent: z.number().min(0).max(100),
});

export const itemSchema = z.object({
  name: z.string().min(1),
  category: z.enum(ITEM_CATEGORIES),
  color: z.string(),
  estimated_price_usd: z.number().min(0),
  uniqueness: z.number().min(0).max(100),
  is_statement_piece: z.boolean(),
  box_2d: box2dSchema,
});
export type Item = z.infer<typeof itemSchema>;

export const heldObjectSchema = z.object({
  name: z.string().min(1),
  box_2d: box2dSchema,
});

export const cohesionSchema = z.object({
  color_harmony: z.number().min(0).max(100),
  silhouette: z.number().min(0).max(100),
  style_consistency: z.number().min(0).max(100),
});

export const modifierSchema = z.object({
  emoji: z.string(),
  label: z.string().min(1),
  tier: z.enum(MODIFIER_TIERS),
});
export type Modifier = z.infer<typeof modifierSchema>;

export const SENTIMENTS = ["positive", "negative"] as const;

/** Exactly the JSON the model must return for one photo. */
export const analysisSchema = z.object({
  is_outfit_photo: z.boolean(),
  /** How far from ordinary, as a percentile vs people at a hackathon (drives the aura; see lib/scoring.ts). */
  specialness: z.number().min(0).max(100),
  /** Whether that standing-out is a W (positive) or an L (negative). */
  sentiment: z.enum(SENTIMENTS),
  style_mix: z.array(styleMixEntrySchema).min(1).max(3),
  items: z.array(itemSchema),
  held_objects: z.array(heldObjectSchema),
  face_box: box2dSchema.nullable(),
  cohesion: cohesionSchema,
  modifiers: z.array(modifierSchema).min(3).max(6),
  nickname: z.string().min(1).max(30),
  verdict: z.string().min(1),
});
export type Analysis = z.infer<typeof analysisSchema>;
