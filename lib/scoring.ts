import type { Analysis, ModifierTier } from "@/lib/schema";

/**
 * Pure, deterministic aura scoring. The judges (GPT, Gemini) never emit a
 * score: each rates the fit's SPECIALNESS (0-100, a percentile against people
 * at a hackathon) and SENTIMENT (W or L), and this curve turns that into aura:
 *
 * - Up to the cutoff (80 = "stands out more than 4 in 5 people") the aura
 *   stays near zero: at most +-20,000, gently curved.
 * - Above the cutoff a power curve swings it to +-1,000,000 at 100.
 *
 * The cutoff adapts (adaptiveCutoff) so roughly 1 in 5 fits swing wide even
 * if a model rates everyone high. The official aura is the judges' average;
 * when they land far apart the reveal calls out "judges disagree".
 */

export type JudgeId = "gpt" | "gemini";
export type Sentiment = "positive" | "negative";

export interface JudgeInput {
  judge: JudgeId;
  /** Model id, e.g. "gpt-4o-mini", "gemini-3.8-flash". */
  model: string;
  specialness: number;
  sentiment: Sentiment;
  verdict: string;
  nickname: string;
}

export interface JudgeScore extends JudgeInput {
  /** Cutoff used for this judge (see adaptiveCutoff). */
  cutoff: number;
  aura: number;
}

export interface ModifierLine {
  emoji: string;
  label: string;
  tier: ModifierTier;
}

export interface ScoreBreakdown {
  /** One or two judges (Gemini is optional; either may fail). */
  judges: JudgeScore[];
  /** Two judges landed far apart: the reveal's payoff moment. */
  disagree: boolean;
  /** Descriptive stats (flavor only: they do not move the score). */
  fitValue: number;
  avgUniqueness: number;
  cohesionScore: number;
  statementCount: number;
  bummyPercent: number;
  modifiers: ModifierLine[];
  /** Official aura: the judges' average, house-rule penalties included (NO_FIT_AURA when no outfit is visible). */
  aura: number;
}

export const AURA_MAX = 1_000_000;
/** Largest aura inside the deadzone (specialness up to the cutoff). */
export const NEAR_ZERO_MAX = 20_000;
export const DEFAULT_CUTOFF = 80;
/** Shape inside the deadzone: gentle (small fits stay tiny). */
export const DEADZONE_EXPONENT = 1.5;
/** Shape above the cutoff: 85 -> ~66k, 90 -> ~233k, 95 -> ~540k, 100 -> 1M at cutoff 80. */
export const SWING_EXPONENT = 2.2;
/** The adaptive cutoff needs this many of today's ratings before it moves off the default. */
export const ADAPTIVE_MIN_SAMPLES = 30;
/** Share of fits meant to swing wide (the cutoff tracks this percentile). */
export const SWING_SHARE = 0.2;
export const CUTOFF_RANGE: readonly [number, number] = [60, 95];
/** Judges disagree when their auras are this far apart... */
export const DISAGREE_GAP = 300_000;
/** ...or point opposite ways by at least this much (so +5k vs -3k is not a "disagreement"). */
export const OPPOSITE_MIN_GAP = 40_000;
export const MAX_STATEMENT_PIECES = 3;
/** No outfit in the photo: a flat penalty, whatever the judges thought. */
export const NO_FIT_AURA = -1_000_000;
export const NO_FIT_MODIFIER: ModifierLine = { emoji: "🚫", label: "NO FIT DETECTED", tier: "penalty" };

/**
 * House rules on top of the judges (applied to every judge's aura, so the
 * official average moves with them): shorts, clashing colorways and pieces
 * that do not go together cost real aura, whatever the judges thought.
 */
export const SHORTS_PENALTY = 80_000;
/** Color harmony below this starts costing aura, per point. */
export const CLASH_HARMONY_FLOOR = 45;
export const CLASH_PER_POINT = 4_000;
/** Style consistency below this (pieces that do not go together), per point. */
export const MISMATCH_FLOOR = 45;
export const MISMATCH_PER_POINT = 2_500;
const SHORTS = /\bshorts\b/i;

export interface FitPenalty extends ModifierLine {
  /** Aura it costs (negative). */
  aura: number;
}

/** The house-rule penalties for a fit (empty for a clean one). */
export function fitPenalties(analysis: Analysis): FitPenalty[] {
  if (!analysis.is_outfit_photo) return [];
  const out: FitPenalty[] = [];
  if (analysis.items.some((i) => SHORTS.test(i.name))) out.push({ emoji: "🩳", label: "SHORTS TAX", tier: "penalty", aura: -SHORTS_PENALTY });
  const harmony = analysis.cohesion.color_harmony;
  if (harmony < CLASH_HARMONY_FLOOR) out.push({ emoji: "🎨", label: "CLASHING COLORWAYS", tier: "penalty", aura: -Math.round((CLASH_HARMONY_FLOOR - harmony) * CLASH_PER_POINT) });
  const consistency = analysis.cohesion.style_consistency;
  if (consistency < MISMATCH_FLOOR) out.push({ emoji: "🧩", label: "PIECES DON'T GO", tier: "penalty", aura: -Math.round((MISMATCH_FLOOR - consistency) * MISMATCH_PER_POINT) });
  return out;
}

/** Specialness (0-100) + sentiment -> aura, with the deadzone + power curve above. */
export function auraFromSpecialness(specialness: number, sentiment: Sentiment, cutoff = DEFAULT_CUTOFF): number {
  const s = Math.max(0, Math.min(100, specialness));
  const c = Math.max(1, Math.min(99, cutoff));
  const magnitude =
    s <= c ? NEAR_ZERO_MAX * (s / c) ** DEADZONE_EXPONENT : NEAR_ZERO_MAX + (AURA_MAX - NEAR_ZERO_MAX) * ((s - c) / (100 - c)) ** SWING_EXPONENT;
  return Math.round(magnitude) * (sentiment === "negative" ? -1 : 1);
}

/**
 * Today's cutoff for one judge: the (1 - SWING_SHARE) percentile of its
 * specialness ratings so far, so ~1 in 5 fits swing wide even when a model
 * rates everyone high. Default until there are enough samples.
 */
export function adaptiveCutoff(todayRatings: readonly number[]): number {
  if (todayRatings.length < ADAPTIVE_MIN_SAMPLES) return DEFAULT_CUTOFF;
  const sorted = [...todayRatings].sort((a, b) => a - b);
  const pos = (1 - SWING_SHARE) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const value = sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
  return Math.round(Math.max(CUTOFF_RANGE[0], Math.min(CUTOFF_RANGE[1], value)) * 10) / 10;
}

export function judgesDisagree(judges: readonly Pick<JudgeScore, "aura">[]): boolean {
  if (judges.length < 2) return false;
  const [a, b] = judges;
  const gap = Math.abs(a.aura - b.aura);
  return gap >= DISAGREE_GAP || (Math.sign(a.aura) !== Math.sign(b.aura) && gap >= OPPOSITE_MIN_GAP);
}

/**
 * Score one scan from its judges. `cutoffs` per judge come from
 * adaptiveCutoff (DEFAULT_CUTOFF when missing).
 */
export function scoreScan(analysis: Analysis, judges: readonly JudgeInput[], cutoffs: Partial<Record<JudgeId, number>> = {}): ScoreBreakdown {
  if (judges.length === 0) throw new Error("scoreScan needs at least one judge");
  const noFit = !analysis.is_outfit_photo;
  const penalties = fitPenalties(analysis);
  const penalty = penalties.reduce((sum, p) => sum + p.aura, 0);
  const scored: JudgeScore[] = judges.map((j) => {
    const cutoff = cutoffs[j.judge] ?? DEFAULT_CUTOFF;
    const judged = auraFromSpecialness(j.specialness, j.sentiment, cutoff) + penalty;
    return { ...j, specialness: Math.round(Math.max(0, Math.min(100, j.specialness))), cutoff, aura: noFit ? NO_FIT_AURA : Math.max(-AURA_MAX, Math.min(AURA_MAX, judged)) };
  });
  const aura = Math.round(scored.reduce((sum, j) => sum + j.aura, 0) / scored.length);

  const items = analysis.items;
  const c = analysis.cohesion;
  return {
    judges: scored,
    disagree: judgesDisagree(scored),
    fitValue: Math.round(items.reduce((s, i) => s + Math.max(0, i.estimated_price_usd), 0)),
    avgUniqueness: items.length === 0 ? 0 : Math.round((items.reduce((s, i) => s + i.uniqueness, 0) / items.length) * 10) / 10,
    cohesionScore: Math.round((c.color_harmony + c.silhouette + c.style_consistency) / 3),
    statementCount: Math.min(MAX_STATEMENT_PIECES, items.filter((i) => i.is_statement_piece).length),
    bummyPercent: analysis.style_mix.find((s) => s.style === "bummy")?.percent ?? 0,
    modifiers: [
      ...(noFit ? [NO_FIT_MODIFIER] : []),
      ...penalties.map((p) => ({ emoji: p.emoji, label: `${p.label} ${formatAura(p.aura)}`, tier: p.tier })),
      ...analysis.modifiers.map((m) => ({ emoji: m.emoji, label: m.label, tier: m.tier })),
    ],
    aura,
  };
}

/** The GPT judge's rating, read from its full analysis. */
export function gptJudge(analysis: Analysis, model: string): JudgeInput {
  return { judge: "gpt", model, specialness: analysis.specialness, sentiment: analysis.sentiment, verdict: analysis.verdict, nickname: analysis.nickname };
}

/** "+2,400" / "-350" style formatting for aura numbers. */
export function formatAura(aura: number, withSign = false): string {
  const abs = Math.abs(aura).toLocaleString("en-US");
  if (aura < 0) return `-${abs}`;
  return withSign ? `+${abs}` : abs;
}

/** Bucket for coloring the aura digits by magnitude. */
export function auraMagnitude(aura: number): "negative" | "low" | "mid" | "high" | "max" {
  if (aura < 0) return "negative";
  if (aura < 25_000) return "low";
  if (aura < 150_000) return "mid";
  if (aura < 500_000) return "high";
  return "max";
}

/** Public name for a judge ("JUDGE 1"): screens, cards and voice never name the model behind it. */
export function judgeName(index: number): string {
  return `JUDGE ${index + 1}`;
}
