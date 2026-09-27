import type { ScanSource } from "@/lib/kiosk/types";

/**
 * Challenge by link (/c/[id]): someone shares a challenge from their own card;
 * every friend who opens it and scans gets their own async battle against
 * that original scan (the same scoring comparison and commentary as a kiosk
 * duel, just not at the same moment).
 */

/** A challenge link. The id is random and URL-safe (never sequential). */
export interface Duel {
  id: string;
  /** The challenger's card (and its scan): what everyone battles. */
  cardId: string;
  scanId: string;
  /** The phone that created it (server-only). */
  deviceId: string;
  createdAt: string;
}

/** One friend's accept: their card, the battle it produced, and its feed post. */
export interface DuelAccept {
  id: string;
  duelId: string;
  cardId: string;
  scanId: string;
  battleId: string;
  /** The "challenge" feed card (both cards side by side). */
  feedCardId: string | null;
  /** Server-only. */
  deviceId: string;
  createdAt: string;
}

export interface DuelPlayerView {
  name: string;
  handle: string | null;
  cardId: string;
  imageUrl: string;
  source: ScanSource;
  /** Hidden (null) from someone who has not scanned yet. */
  aura: number | null;
}

export interface DuelBattleView {
  acceptId: string;
  createdAt: string;
  friend: DuelPlayerView;
  challengerTotal: number;
  friendTotal: number;
  winner: "challenger" | "friend" | "tie";
  gap: number;
  commentary: string | null;
  battleId: string;
  /** Accepted from this phone. */
  mine: boolean;
}

/** What /c/[id] shows a given viewer. */
export interface DuelView {
  id: string;
  challenger: DuelPlayerView;
  /** challenger: made the link; friend: this phone accepted it; visitor: not yet. */
  role: "challenger" | "friend" | "visitor";
  /** How many friends took it on (everyone sees this). */
  count: number;
  /** Every result, newest first; empty for visitors (it would give the score away). */
  battles: DuelBattleView[];
}

/** Random URL-safe id: 12 chars of lowercase base36 (~62 bits), so a link read aloud or typed still works. */
export function newDuelId(randomBytes: (n: number) => Uint8Array): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(24);
  let out = "";
  for (const b of bytes) {
    if (b >= 252) continue; // 252 = 36 * 7: keep the distribution flat
    out += alphabet[b % 36];
    if (out.length === 12) break;
  }
  return out.length === 12 ? out : newDuelId(randomBytes);
}

export const isDuelId = (v: string): boolean => /^[0-9a-z]{12}$/.test(v);
