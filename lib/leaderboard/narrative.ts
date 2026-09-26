import type { BattleRecord } from "@/lib/battle/types";
import type { LeaderboardEntry } from "@/lib/kiosk/types";

/**
 * Leaderboard as shared context (spec section 4): narrative rows derived from
 * the battle and scan history with plain rules (no LLM calls). Players are
 * identified by their AURA ID handle, which they attach from their phone.
 */

export interface Rivalry {
  a: string;
  b: string;
  battles: number;
  winsA: number;
  winsB: number;
  /** Times the lead changed hands (winner of a battle differs from the previous winner). */
  leadChanges: number;
}

export interface SquadChampion {
  battleId: string;
  score: number;
  vibe: string;
  players: number;
  createdAt: string;
}

export interface LeaderboardNarrative {
  rivalry: Rivalry | null;
  squadChampion: SquadChampion | null;
  /** handle -> consecutive battle wins (only streaks of 2+). */
  streaks: Record<string, number>;
  /** handle -> aura gained since their previous scan (only rises). */
  improved: Record<string, number>;
}

/** "Leapfrogged each other more than once". */
export const RIVALRY_MIN_LEAD_CHANGES = 2;
export const STREAK_MIN = 2;

/** The display name part of a NAME#CODE handle. */
export function handleName(handle: string): string {
  return handle.split("#")[0] ?? handle;
}

const byTime = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt);

/**
 * Rivalry of the Day: two claimed players who met in duels more than once
 * with the winner flipping back and forth. The most-played qualifying pair
 * wins (ties: the most recent).
 */
export function findRivalry(battles: readonly BattleRecord[]): Rivalry | null {
  const pairs = new Map<string, { a: string; b: string; winners: (string | null)[]; last: string }>();
  for (const b of [...battles].filter((x) => x.mode === "duel").sort(byTime)) {
    const [p, q] = b.players;
    if (!p?.handle || !q?.handle || p.handle === q.handle) continue;
    const [a, c] = [p.handle, q.handle].sort();
    const key = `${a}|${c}`;
    const winner = b.winnerSlot === null ? null : (b.players.find((x) => x.slot === b.winnerSlot)?.handle ?? null);
    const pair = pairs.get(key) ?? { a, b: c, winners: [], last: b.createdAt };
    pair.winners.push(winner);
    pair.last = b.createdAt;
    pairs.set(key, pair);
  }
  let best: (Rivalry & { last: string }) | null = null;
  for (const { a, b, winners, last } of pairs.values()) {
    const decided = winners.filter((w): w is string => w !== null);
    let leadChanges = 0;
    for (let i = 1; i < decided.length; i++) if (decided[i] !== decided[i - 1]) leadChanges++;
    if (leadChanges < RIVALRY_MIN_LEAD_CHANGES) continue;
    const r = { a, b, battles: winners.length, winsA: decided.filter((w) => w === a).length, winsB: decided.filter((w) => w === b).length, leadChanges, last };
    if (!best || r.battles > best.battles || (r.battles === best.battles && r.last > best.last)) best = r;
  }
  if (!best) return null;
  const { last: _last, ...rivalry } = best;
  void _last;
  return rivalry;
}

/** Consecutive wins per claimed player, counted back from their latest battle. */
export function winStreaks(battles: readonly BattleRecord[]): Record<string, number> {
  const history = new Map<string, boolean[]>();
  for (const b of [...battles].sort(byTime)) {
    for (const p of b.players) {
      if (!p.handle) continue;
      const list = history.get(p.handle) ?? [];
      list.push(b.winnerSlot === p.slot);
      history.set(p.handle, list);
    }
  }
  const out: Record<string, number> = {};
  for (const [handle, results] of history) {
    let n = 0;
    for (let i = results.length - 1; i >= 0 && results[i]; i--) n++;
    if (n >= STREAK_MIN) out[handle] = n;
  }
  return out;
}

/** Aura gained between each player's previous and latest leaderboard entry (rises only). */
export function mostImproved(entries: readonly LeaderboardEntry[]): Record<string, number> {
  const last = new Map<string, LeaderboardEntry[]>();
  for (const e of [...entries].sort(byTime)) {
    if (!e.handle) continue;
    last.set(e.handle, [...(last.get(e.handle) ?? []), e].slice(-2));
  }
  const out: Record<string, number> = {};
  for (const [handle, [prev, latest]] of last) {
    if (prev && latest && latest.aura > prev.aura) out[handle] = latest.aura - prev.aura;
  }
  return out;
}

export function squadChampion(battles: readonly BattleRecord[]): SquadChampion | null {
  let best: BattleRecord | null = null;
  for (const b of battles) if (b.mode === "squad" && b.squad && (!best || b.squad.score > best.squad!.score)) best = b;
  return best ? { battleId: best.id, score: best.squad!.score, vibe: best.squad!.vibe, players: best.players.length, createdAt: best.createdAt } : null;
}

export function buildNarrative(battles: readonly BattleRecord[], entries: readonly LeaderboardEntry[]): LeaderboardNarrative {
  return { rivalry: findRivalry(battles), squadChampion: squadChampion(battles), streaks: winStreaks(battles), improved: mostImproved(entries) };
}

/** "ALEX VS. JORDAN · 3 BATTLES · CURRENTLY TIED" */
export function rivalryLine(r: Rivalry): string {
  const a = handleName(r.a);
  const b = handleName(r.b);
  const standing = r.winsA === r.winsB ? `CURRENTLY TIED ${r.winsA}-${r.winsB}` : r.winsA > r.winsB ? `${a} LEADS ${r.winsA}-${r.winsB}` : `${b} LEADS ${r.winsB}-${r.winsA}`;
  return `${a} VS. ${b} · ${r.battles} BATTLES · ${standing}`;
}
