import type { PoseResult } from "@/lib/pose/score";
import type { PoseSnapshot } from "@/lib/pose/landmarks";

/**
 * Aura Battles: a 1v1 duel or a squad of up to five. One lobby, one result
 * screen and one card template scale with the player count; nothing is
 * hardcoded to two.
 */

export type BattleMode = "duel" | "squad";

export const DUEL_SIZE = 2;
export const SQUAD_MIN = 2;
/** Layout sanity: five mannequins still fit the kiosk screen. */
export const SQUAD_MAX = 5;

export function capacityFor(mode: BattleMode): number {
  return mode === "duel" ? DUEL_SIZE : SQUAD_MAX;
}

/** What decided the top spot: the outfit, the pose, or both pointed the same way. */
export type DecidedBy = "fit" | "pose" | "both";

/** Squad-mode aggregate ("squad synergy" is the joke stat). */
export interface SquadSummary {
  /** The group Aura score on the banner. */
  score: number;
  /** Mean total of the members. */
  average: number;
  /** 0-100: cohesive (fits hold together) but distinct (different styles). */
  synergy: number;
  /** "Chaotic streetwear energy". */
  vibe: string;
}

/** One player's numbers in a battle (no images: safe to store and send around). */
export interface BattlePlayerScore {
  slot: number;
  scanId: string;
  nickname: string;
  /** Fit score: the scan's aura (single judge in battle mode). */
  fitAura: number;
  pose: PoseResult;
  /** Aura the pose adds or costs (lib/pose/score.ts poseAura). */
  poseAura: number;
  /** fitAura + poseAura: what the battle is decided on. */
  total: number;
  /** 1 = first place (ties share a place). */
  place: number;
  /** AURA ID (NAME#CODE) once the player claims their slot from their phone. */
  handle: string | null;
}

export interface BattleOutcome {
  mode: BattleMode;
  players: BattlePlayerScore[];
  /** Winning slot; null when the top two are tied. */
  winnerSlot: number | null;
  /** Total gap between first and second place: the battle card's hero number. */
  gap: number;
  decidedBy: DecidedBy | null;
  squad: SquadSummary | null;
}

/** A capture's pose, sent with the photo (landmarks from the live MediaPipe runtime). */
export interface CapturePose {
  snapshot: PoseSnapshot | null;
}

/** A stored battle (no images): what the feed, leaderboard and cards read. */
export interface BattleRecord extends BattleOutcome {
  id: string;
  /** Head-to-head / group commentary once generated (null until the stream finishes). */
  commentary: string | null;
  createdAt: string;
}
