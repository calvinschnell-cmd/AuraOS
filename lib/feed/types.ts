import type { BattleRecord } from "@/lib/battle/types";
import type { ScanSource } from "@/lib/kiosk/types";
import type { CardKind } from "@/lib/share/caption";

/**
 * The public feed (companion app). A feed entry IS a saved card: posting a
 * card writes the feed, so the two can never drift apart. Photos are never
 * stored; the card image is the rendered, face-blurred share card.
 */

export const REACTIONS = ["🔥", "💀", "👑", "🤡"] as const;
export type Reaction = (typeof REACTIONS)[number];

export function isReaction(v: unknown): v is Reaction {
  return typeof v === "string" && (REACTIONS as readonly string[]).includes(v);
}

export interface FeedEntry {
  /** Card id (the QR deep link is /r/[id]). */
  id: string;
  kind: CardKind;
  createdAt: string;
  imageUrl: string;
  /** Hero number: solo aura, battle score gap, or squad score. */
  headline: number;
  /** The number to beat (solo aura, winner total, squad score). */
  target: number;
  /** "VINTAGE RACING JACKET GUY", "PLAYER 1 VS PLAYER 2", "SQUAD OF 4". */
  title: string;
  /** One-line verdict (solo verdict, battle commentary, squad vibe). */
  verdict: string | null;
  caption: string | null;
  scanId: string | null;
  battleId: string | null;
  /** Squad: which player this per-person card belongs to. */
  slot: number | null;
  /** Mirror or phone. */
  source: ScanSource;
  reactions: Record<string, number>;
}

/** Everything the single-result page shows. */
export interface FeedDetail {
  entry: FeedEntry;
  battle: BattleRecord | null;
  /** Solo scan summary (no image). */
  scan: { nickname: string; aura: number; verdict: string; styles: string; handle: string | null } | null;
  /** Squad: each member's own card ("from Squad Battle"). */
  children: FeedEntry[];
}

/**
 * The public feed only shows the last half hour of the mirror. Nothing is
 * deleted: card links and QR codes keep working, and cards claimed with an
 * AURA ID stay on that player's profile (/u/[handle]).
 */
export const FEED_WINDOW_MS = 30 * 60 * 1000;

export function feedSince(now = Date.now()): string {
  return new Date(now - FEED_WINDOW_MS).toISOString();
}
