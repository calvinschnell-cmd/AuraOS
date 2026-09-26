import { poseAura, type PoseResult } from "@/lib/pose/score";
import type { Style } from "@/lib/schema";
import type { BattleMode, BattleOutcome, BattlePlayerScore, DecidedBy, SquadSummary } from "./types";

/**
 * Pure battle scoring: fit aura + pose aura per player, places, the winner,
 * the score gap, what decided it, and (squads) the group score. Rule-based on
 * purpose: the LLM budget goes to the commentary, not arithmetic.
 */

export interface BattleEntrant {
  slot: number;
  scanId: string;
  nickname: string;
  fitAura: number;
  pose: PoseResult;
  /** Top style of the fit (squad vibe + synergy). */
  topStyle: Style | null;
  /** 0-100 cohesion of the fit (squad synergy). */
  cohesion: number;
  handle?: string | null;
}

/** Squad vibe archetype by the style most of the squad shares. */
export const STYLE_VIBES: Record<Style, string> = {
  streetwear: "chaotic streetwear energy",
  "old money": "country club board meeting",
  professional: "LinkedIn premium group photo",
  gorpcore: "trail-ready for a hike nobody planned",
  Y2K: "2003 mall food court royalty",
  techwear: "cyberpunk side quest party",
  athleisure: "gym-to-brunch pipeline",
  preppy: "student council campaign trail",
  grunge: "garage band that never practices",
  minimalist: "Scandinavian furniture catalog",
  cottagecore: "farmers market influencer collective",
  coquette: "bows-on-everything brunch club",
  balletcore: "rehearsal break at the ballet studio",
  boho: "music festival campsite collective",
  glam: "red carpet arrivals line",
  "clean girl": "slicked-back bun and iced latte society",
  "business casual": "quarterly all-hands energy",
  "hackathon survivor": "sleep-deprived hackathon collective",
  bummy: "laundry day support group",
};
export const ALL_DIFFERENT_VIBE = "group project with no group chat";
export const MIXED_VIBE = "multiverse crossover episode";

export function squadVibe(styles: readonly (Style | null)[]): string {
  const known = styles.filter((s): s is Style => s !== null);
  if (known.length === 0) return MIXED_VIBE;
  const counts = new Map<Style, number>();
  for (const s of known) counts.set(s, (counts.get(s) ?? 0) + 1);
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n >= Math.ceil(styles.length / 2) && n >= 2) return STYLE_VIBES[top];
  if (counts.size === styles.length && styles.length >= 3) return ALL_DIFFERENT_VIBE;
  return MIXED_VIBE;
}

/** 0-100: cohesive fits (mean cohesion) that are still distinct from each other (different top styles). */
export function squadSynergy(entrants: readonly Pick<BattleEntrant, "topStyle" | "cohesion">[]): number {
  const n = entrants.length;
  if (n < 2) return 0;
  const unique = new Set(entrants.map((e) => e.topStyle ?? "?")).size;
  const distinct = (unique - 1) / (n - 1);
  const cohesion = entrants.reduce((s, e) => s + Math.max(0, Math.min(100, e.cohesion)), 0) / n / 100;
  return Math.round(100 * (0.55 * cohesion + 0.45 * distinct));
}

/**
 * Group score: the members' average total, scaled by synergy (x0.75 at 0,
 * x1.25 at 100). A negative squad is dragged less negative by synergy.
 */
export function squadScore(average: number, synergy: number): number {
  const mult = 0.75 + Math.max(0, Math.min(100, synergy)) / 200;
  return Math.round(average * (average >= 0 ? mult : 2 - mult));
}

/** What won it: the pose when the fits were level or worse, the fit when the pose was level or worse. */
function decidedBy(first: BattlePlayerScore, second: BattlePlayerScore): DecidedBy {
  const fitLead = first.fitAura - second.fitAura;
  const poseLead = first.poseAura - second.poseAura;
  if (fitLead <= 0) return "pose";
  if (poseLead <= 0) return "fit";
  return "both";
}

export function computeOutcome(mode: BattleMode, entrants: readonly BattleEntrant[]): BattleOutcome {
  if (entrants.length < 2) throw new Error("a battle needs at least two players");
  const players: BattlePlayerScore[] = entrants.map((e) => {
    const pa = poseAura(e.pose.score);
    return { slot: e.slot, scanId: e.scanId, nickname: e.nickname, fitAura: e.fitAura, pose: e.pose, poseAura: pa, total: e.fitAura + pa, place: 0, handle: e.handle ?? null };
  });
  const ranked = [...players].sort((a, b) => b.total - a.total || a.slot - b.slot);
  ranked.forEach((p, i) => {
    p.place = i > 0 && p.total === ranked[i - 1].total ? ranked[i - 1].place : i + 1;
  });
  const [first, second] = ranked;
  const tie = first.total === second.total;
  let squad: SquadSummary | null = null;
  if (mode === "squad") {
    const average = Math.round(players.reduce((s, p) => s + p.total, 0) / players.length);
    const synergy = squadSynergy(entrants);
    squad = { score: squadScore(average, synergy), average, synergy, vibe: squadVibe(entrants.map((e) => e.topStyle)) };
  }
  return {
    mode,
    players: players.sort((a, b) => a.slot - b.slot),
    winnerSlot: tie ? null : first.slot,
    gap: first.total - second.total,
    decidedBy: tie ? null : decidedBy(first, second),
    squad,
  };
}

/** Player label on screens and cards ("PLAYER 1"). */
export function playerLabel(slot: number): string {
  return `PLAYER ${slot + 1}`;
}
