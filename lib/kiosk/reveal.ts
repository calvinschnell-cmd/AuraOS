import { formatAura } from "@/lib/scoring";
import type { ScanResult } from "./types";

/**
 * Result reveal timeline (pure). Everything lands in under 8 seconds:
 * photo -> boxes one by one -> aura digit by digit -> stats -> modifiers ->
 * rank -> verdict.
 */

export const REVEAL_MAX_MS = 8000;

export interface RevealTimeline {
  photoAt: number;
  glowAt: number;
  boxesAt: number[];
  auraAt: number;
  auraDigitMs: number;
  auraText: string;
  statsAt: number;
  modifiersAt: number[];
  rankAt: number;
  verdictAt: number;
  doneAt: number;
}

export function buildRevealTimeline(scan: ScanResult): RevealTimeline {
  const boxCount = scan.analysis.items.length + scan.analysis.held_objects.length;
  const boxesStart = 450;
  const boxesEnd = 2600;
  const spacing = boxCount > 1 ? Math.min(240, (boxesEnd - boxesStart) / (boxCount - 1)) : 0;
  const boxesAt = Array.from({ length: boxCount }, (_, i) => Math.round(boxesStart + i * spacing));
  const lastBox = boxCount > 0 ? boxesAt[boxCount - 1] : boxesStart;

  const auraText = formatAura(scan.aura);
  const auraDigitMs = 110;
  const auraAt = lastBox + 350;
  const auraEnd = auraAt + auraText.length * auraDigitMs;

  const statsAt = auraEnd + 300;
  const modCount = scan.breakdown.modifiers.length;
  const modifiersAt = Array.from({ length: modCount }, (_, i) => statsAt + 550 + i * 210);
  const lastMod = modCount > 0 ? modifiersAt[modCount - 1] : statsAt + 400;
  const rankAt = lastMod + 420;
  const verdictAt = rankAt + 520;
  const doneAt = Math.min(REVEAL_MAX_MS, verdictAt + 600);

  return { photoAt: 0, glowAt: 300, boxesAt, auraAt, auraDigitMs, auraText, statsAt, modifiersAt, rankAt, verdictAt, doneAt };
}

export interface RevealState {
  photo: boolean;
  glow: boolean;
  boxesShown: number;
  /** Characters of the aura text typed so far. */
  auraChars: number;
  stats: boolean;
  modifiersShown: number;
  rank: boolean;
  verdict: boolean;
  done: boolean;
}

export function revealState(t: RevealTimeline, elapsedMs: number): RevealState {
  const e = elapsedMs;
  const auraChars = e < t.auraAt ? 0 : Math.min(t.auraText.length, Math.floor((e - t.auraAt) / t.auraDigitMs) + 1);
  return {
    photo: e >= t.photoAt,
    glow: e >= t.glowAt,
    boxesShown: t.boxesAt.filter((at) => e >= at).length,
    auraChars,
    stats: e >= t.statsAt,
    modifiersShown: t.modifiersAt.filter((at) => e >= at).length,
    rank: e >= t.rankAt,
    verdict: e >= t.verdictAt,
    done: e >= t.doneAt,
  };
}

/** Convert a box_2d [ymin, xmin, ymax, xmax] (0-1000) to CSS percentages. */
export function boxToPercent(box: [number, number, number, number]): { top: number; left: number; width: number; height: number } {
  const [ymin, xmin, ymax, xmax] = box;
  return {
    top: ymin / 10,
    left: xmin / 10,
    width: Math.max(0, (xmax - xmin) / 10),
    height: Math.max(0, (ymax - ymin) / 10),
  };
}
