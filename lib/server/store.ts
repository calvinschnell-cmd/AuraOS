import type { TokenUsage } from "@/lib/analyze";
import { DAILY_SCAN_CAP, OPENAI_INPUT_USD_PER_M, OPENAI_MODEL, OPENAI_OUTPUT_USD_PER_M } from "@/lib/config";
import { isMockMode } from "@/lib/env";
import type { HottestHour, JudgeSplit, LeaderboardEntry, PlayerHistory, PlayerInfo, RemoteCommand, StoreKind, TimelineBucket, UsageStats } from "@/lib/kiosk/types";
import type { KioskStatus } from "@/lib/kiosk/status";
import { makeHandle, newHandleCode } from "@/lib/players";
import type { Analysis } from "@/lib/schema";
import { NEAR_ZERO_MAX, type JudgeId, type ScoreBreakdown } from "@/lib/scoring";
import type { BattleRecord } from "@/lib/battle/types";
import { REACTIONS, type FeedEntry } from "@/lib/feed/types";
import type { CardKind } from "@/lib/share/caption";
import { dayKey, dayStart } from "./day";
import { TigerStore, getTigerPool } from "./tigerStore";

/**
 * Persistence. Tiger Data (TimescaleDB) when TIGER_DATABASE_URL is set,
 * otherwise an in-memory store that survives dev hot reloads. Never stores
 * raw photos: scans hold result JSON and aura only; cards hold the rendered,
 * face-blurred share card.
 */

export interface StoredScan {
  id: string;
  imageHash: string;
  analysis: Analysis;
  breakdown: ScoreBreakdown;
  aura: number;
  createdAt: string;
}

export interface StoredCard {
  id: string;
  scanId: string | null;
  battleId: string | null;
  imageUrl: string;
  createdAt: string;
  /** Solana devnet badge (compressed NFT) mint signature, when minted. */
  nftSignature: string | null;
  kind: CardKind;
  /** Hero number on the card (solo aura, battle gap, squad score). */
  headline: number;
  /** The "beat this score" number. */
  target: number;
  title: string;
  verdict: string | null;
  caption: string | null;
  /** Squad member cards point at the squad card (and stay out of the feed). */
  parentId: string | null;
  slot: number | null;
}

export type NewCard = Omit<StoredCard, "imageUrl" | "createdAt" | "nftSignature">;

/** Battles are stored as their outcome (no images). */
export type StoredBattle = BattleRecord;

export interface Rank {
  position: number;
  total: number;
}

export interface NewLeaderboardEntry {
  id: string;
  scanId: string;
  nickname: string;
  aura: number;
  handle: string | null;
}

/** Feed row for a card (reactions filled in by the store). */
export function feedEntryOf(card: StoredCard, reactions: Record<string, number>): FeedEntry {
  return {
    id: card.id,
    kind: card.kind,
    createdAt: card.createdAt,
    imageUrl: card.imageUrl,
    headline: card.headline,
    target: card.target,
    title: card.title,
    verdict: card.verdict,
    caption: card.caption,
    scanId: card.scanId,
    battleId: card.battleId,
    slot: card.slot,
    reactions,
  };
}

export function emptyReactions(): Record<string, number> {
  return Object.fromEntries(REACTIONS.map((r) => [r, 0]));
}

/** 15-minute buckets for the event timeline. */
export const TIMELINE_BUCKET_MS = 15 * 60 * 1000;

export interface ScanStore {
  readonly kind: StoreKind;
  getByHash(hash: string): Promise<StoredScan | null>;
  getById(id: string): Promise<StoredScan | null>;
  insert(scan: StoredScan): Promise<void>;
  countToday(): Promise<number>;
  rankToday(aura: number): Promise<Rank>;
  /** Today's specialness ratings from one judge (adaptive scoring cutoff). */
  specialnessToday(judge: JudgeId): Promise<number[]>;

  insertCard(card: NewCard, png: Buffer): Promise<StoredCard>;
  getCard(id: string): Promise<StoredCard | null>;
  /** The PNG bytes served by /api/cards/[id]/image. */
  getCardImage(id: string): Promise<Buffer | null>;
  setCardNft(id: string, signature: string): Promise<void>;

  insertLeaderboard(entry: NewLeaderboardEntry): Promise<void>;
  entryForScan(scanId: string): Promise<LeaderboardEntry | null>;
  leaderboard(limit: number): Promise<LeaderboardEntry[]>;
  recentEntries(limit: number): Promise<LeaderboardEntry[]>;
  /**
   * The card to open for each scan (scan id -> card id): its own card (solo, or
   * a squad member's personal card) first, else the battle card it was in.
   */
  cardIdsForScans(scanIds: string[]): Promise<Record<string, string>>;
  deleteEntry(id: string): Promise<boolean>;

  insertBattle(battle: StoredBattle): Promise<void>;
  getBattle(id: string): Promise<StoredBattle | null>;
  setBattleCommentary(id: string, commentary: string): Promise<void>;
  /** A player claims their slot from their phone (only an unclaimed slot). */
  claimBattleSlot(id: string, slot: number, handle: string): Promise<boolean>;
  /** Newest first (leaderboard narrative rows: rivalries, streaks, squad champion). */
  recentBattles(limit: number): Promise<StoredBattle[]>;

  /** Public feed: top-level cards, newest first, with reaction counts. */
  /** Saved cards, newest first: older than `before` (paging), newer than `since` (the live window). */
  feed(limit: number, before?: string | null, since?: string | null): Promise<FeedEntry[]>;
  /**
   * Every card on a player's profile: solo cards whose entry carries their
   * AURA ID, battle and squad cards where they claimed a slot, and their own
   * card from a squad. Newest first.
   */
  cardsForHandle(handle: string, limit: number): Promise<FeedEntry[]>;
  feedEntry(cardId: string): Promise<FeedEntry | null>;
  /** Squad member cards of a squad card. */
  childCards(parentId: string): Promise<FeedEntry[]>;
  /** One reaction per device per emoji (idempotent); returns the card's counts. */
  react(cardId: string, emoji: string, clientId: string): Promise<Record<string, number>>;
  /** Attach a handle to a solo scan's leaderboard entry (only when it has none). */
  setEntryHandle(scanId: string, handle: string): Promise<boolean>;
  /** Every leaderboard entry of these players, oldest first ("most improved" deltas). */
  entriesForHandles(handles: string[]): Promise<LeaderboardEntry[]>;

  recentFitSignatures(limit: number): Promise<string[][]>;
  insertFit(signature: string[], seed: string): Promise<void>;

  /** New player with a fresh NAME#CODE handle. */
  createPlayer(name: string): Promise<PlayerInfo>;
  getPlayer(handle: string): Promise<PlayerInfo | null>;
  playerHistory(handle: string): Promise<PlayerHistory | null>;
  /** Today in 15-minute buckets. */
  timeline(): Promise<TimelineBucket[]>;
  hottestHour(): Promise<HottestHour | null>;
  judgeSplitToday(): Promise<JudgeSplit>;
}

/** Standout item for the ticker: the most unique item's name. */
export function standoutItem(analysis: Analysis): string | null {
  const best = [...analysis.items].sort((a, b) => b.uniqueness - a.uniqueness)[0];
  return best?.name ?? null;
}

/** Fold scans into 15-minute buckets (the memory store's stand-in for Tiger's continuous aggregate). */
export function bucketScans(scans: readonly Pick<StoredScan, "aura" | "createdAt" | "breakdown">[]): TimelineBucket[] {
  const buckets = new Map<number, TimelineBucket & { sum: number }>();
  for (const s of scans) {
    const start = Math.floor(Date.parse(s.createdAt) / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS;
    const b = buckets.get(start) ?? { bucket: new Date(start).toISOString(), scans: 0, avgAura: 0, maxAura: -Infinity, minAura: Infinity, swings: 0, disagreements: 0, sum: 0 };
    b.scans += 1;
    b.sum += s.aura;
    b.maxAura = Math.max(b.maxAura, s.aura);
    b.minAura = Math.min(b.minAura, s.aura);
    if (Math.abs(s.aura) > NEAR_ZERO_MAX) b.swings += 1;
    if (s.breakdown.disagree) b.disagreements += 1;
    buckets.set(start, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, { sum, ...b }]) => ({ ...b, avgAura: Math.round(sum / b.scans) }));
}

/** The busiest hour (by scans) among timeline buckets. */
export function hottestHourOf(buckets: readonly TimelineBucket[]): HottestHour | null {
  const hours = new Map<string, { scans: number; sum: number }>();
  for (const b of buckets) {
    const d = new Date(b.bucket);
    d.setUTCMinutes(0, 0, 0);
    const key = d.toISOString();
    const h = hours.get(key) ?? { scans: 0, sum: 0 };
    h.scans += b.scans;
    h.sum += b.avgAura * b.scans;
    hours.set(key, h);
  }
  const best = [...hours.entries()].sort((a, b) => b[1].scans - a[1].scans)[0];
  return best ? { hour: best[0], scans: best[1].scans, avgAura: Math.round(best[1].sum / best[1].scans) } : null;
}

// ---------------------------------------------------------------- memory

interface MemoryState {
  scans: StoredScan[];
  cards: StoredCard[];
  cardImages: Map<string, Buffer>;
  entries: LeaderboardEntry[];
  battles: StoredBattle[];
  fits: { signature: string[]; seed: string; createdAt: string }[];
  players: Map<string, PlayerInfo>;
  /** cardId -> emoji -> client ids */
  reactions: Map<string, Map<string, Set<string>>>;
}

export class MemoryStore implements ScanStore {
  readonly kind = "memory" as const;
  constructor(private readonly s: MemoryState) {}

  private today(): StoredScan[] {
    const start = dayStart().getTime();
    return this.s.scans.filter((x) => Date.parse(x.createdAt) >= start);
  }
  async getByHash(hash: string) {
    return this.s.scans.find((x) => x.imageHash === hash) ?? null;
  }
  async getById(id: string) {
    return this.s.scans.find((x) => x.id === id) ?? null;
  }
  async insert(scan: StoredScan) {
    this.s.scans.push(scan);
    if (this.s.scans.length > 5000) this.s.scans.splice(0, this.s.scans.length - 5000);
  }
  async countToday() {
    return this.today().length;
  }
  async specialnessToday(judge: JudgeId) {
    return this.today().flatMap((x) => x.breakdown.judges?.filter((j) => j.judge === judge).map((j) => j.specialness) ?? []);
  }
  async rankToday(aura: number) {
    const today = this.today();
    return { position: today.filter((x) => x.aura > aura).length + 1, total: Math.max(1, today.length) };
  }

  async insertCard(card: NewCard, png: Buffer) {
    const stored: StoredCard = { ...card, imageUrl: `/api/cards/${card.id}/image`, createdAt: new Date().toISOString(), nftSignature: null };
    this.s.cards.push(stored);
    this.s.cardImages.set(card.id, png);
    if (this.s.cardImages.size > 300) {
      const oldest = this.s.cards.shift();
      if (oldest) this.s.cardImages.delete(oldest.id);
    }
    return stored;
  }
  async getCard(id: string) {
    return this.s.cards.find((c) => c.id === id) ?? null;
  }
  async getCardImage(id: string) {
    return this.s.cardImages.get(id) ?? null;
  }
  async setCardNft(id: string, signature: string) {
    const card = this.s.cards.find((c) => c.id === id);
    if (card) card.nftSignature = signature;
  }

  async insertLeaderboard(entry: NewLeaderboardEntry) {
    const scan = await this.getById(entry.scanId);
    this.s.entries.push({ ...entry, createdAt: new Date().toISOString(), standout: scan ? standoutItem(scan.analysis) : null });
  }
  async entryForScan(scanId: string) {
    return this.s.entries.find((e) => e.scanId === scanId) ?? null;
  }
  async leaderboard(limit: number) {
    return [...this.s.entries].sort((a, b) => b.aura - a.aura || a.createdAt.localeCompare(b.createdAt)).slice(0, limit);
  }
  async recentEntries(limit: number) {
    return [...this.s.entries].reverse().slice(0, limit);
  }
  async cardIdsForScans(scanIds: string[]) {
    const out: Record<string, string> = {};
    const newest = [...this.s.cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const scanId of scanIds) {
      const own = newest.find((c) => c.scanId === scanId);
      const battle = own ? null : this.s.battles.find((b) => b.players.some((p) => p.scanId === scanId));
      const battleCard = battle ? newest.find((c) => c.battleId === battle.id && c.parentId === null) : null;
      const id = own?.id ?? battleCard?.id;
      if (id) out[scanId] = id;
    }
    return out;
  }
  async deleteEntry(id: string) {
    const i = this.s.entries.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.s.entries.splice(i, 1);
    return true;
  }

  async insertBattle(battle: StoredBattle) {
    this.s.battles.push(structuredClone(battle));
    if (this.s.battles.length > 2000) this.s.battles.splice(0, this.s.battles.length - 2000);
  }
  async getBattle(id: string) {
    const b = this.s.battles.find((x) => x.id === id);
    return b ? structuredClone(b) : null;
  }
  async setBattleCommentary(id: string, commentary: string) {
    const b = this.s.battles.find((x) => x.id === id);
    if (b) b.commentary = commentary;
  }
  async claimBattleSlot(id: string, slot: number, handle: string) {
    const p = this.s.battles.find((x) => x.id === id)?.players.find((x) => x.slot === slot);
    if (!p || p.handle) return false;
    p.handle = handle;
    return true;
  }
  async recentBattles(limit: number) {
    return this.s.battles
      .slice(-limit)
      .reverse()
      .map((b) => structuredClone(b));
  }

  private counts(cardId: string): Record<string, number> {
    const out = emptyReactions();
    for (const [emoji, clients] of this.s.reactions.get(cardId) ?? []) out[emoji] = clients.size;
    return out;
  }
  async feed(limit: number, before?: string | null, since?: string | null) {
    return this.s.cards
      .filter((c) => c.parentId === null && (!before || c.createdAt < before) && (!since || c.createdAt > since))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((c) => feedEntryOf(c, this.counts(c.id)));
  }
  async cardsForHandle(handle: string, limit: number) {
    const h = handle.toUpperCase();
    const soloScans = new Set(this.s.entries.filter((e) => e.handle === h).map((e) => e.scanId));
    const claimed = this.s.battles.flatMap((b) => b.players.filter((p) => p.handle === h).map((p) => ({ battleId: b.id, scanId: p.scanId })));
    const battleIds = new Set(claimed.map((c) => c.battleId));
    const memberScans = new Set(claimed.map((c) => c.scanId));
    return this.s.cards
      .filter((c) =>
        c.parentId === null
          ? (c.battleId === null && c.scanId !== null && soloScans.has(c.scanId)) || (c.battleId !== null && battleIds.has(c.battleId))
          : c.scanId !== null && memberScans.has(c.scanId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((c) => feedEntryOf(c, this.counts(c.id)));
  }
  async feedEntry(cardId: string) {
    const c = this.s.cards.find((x) => x.id === cardId);
    return c ? feedEntryOf(c, this.counts(c.id)) : null;
  }
  async childCards(parentId: string) {
    return this.s.cards
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
      .map((c) => feedEntryOf(c, this.counts(c.id)));
  }
  async react(cardId: string, emoji: string, clientId: string) {
    let byEmoji = this.s.reactions.get(cardId);
    if (!byEmoji) this.s.reactions.set(cardId, (byEmoji = new Map()));
    let clients = byEmoji.get(emoji);
    if (!clients) byEmoji.set(emoji, (clients = new Set()));
    clients.add(clientId);
    return this.counts(cardId);
  }
  async setEntryHandle(scanId: string, handle: string) {
    const e = this.s.entries.find((x) => x.scanId === scanId);
    if (!e || e.handle) return false;
    e.handle = handle;
    return true;
  }
  async entriesForHandles(handles: string[]) {
    const set = new Set(handles);
    return this.s.entries.filter((e) => e.handle !== null && set.has(e.handle)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async recentFitSignatures(limit: number) {
    return this.s.fits.slice(-limit).map((f) => f.signature);
  }
  async insertFit(signature: string[], seed: string) {
    this.s.fits.push({ signature, seed, createdAt: new Date().toISOString() });
    if (this.s.fits.length > 300) this.s.fits.splice(0, this.s.fits.length - 300);
  }

  async createPlayer(name: string) {
    for (;;) {
      const handle = makeHandle(name, newHandleCode());
      if (this.s.players.has(handle)) continue;
      const player = { handle, name: name.trim() };
      this.s.players.set(handle, player);
      return player;
    }
  }
  async getPlayer(handle: string) {
    return this.s.players.get(handle) ?? null;
  }
  async playerHistory(handle: string) {
    const player = this.s.players.get(handle);
    if (!player) return null;
    const scans = this.s.entries
      .filter((e) => e.handle === handle)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((e) => ({ scanId: e.scanId, aura: e.aura, nickname: e.nickname, createdAt: e.createdAt }));
    return { ...player, scans };
  }
  async timeline() {
    return bucketScans(this.today());
  }
  async hottestHour() {
    return hottestHourOf(await this.timeline());
  }
  async judgeSplitToday() {
    const two = this.today().filter((x) => (x.breakdown.judges?.length ?? 0) >= 2);
    return { scans: two.length, disagreements: two.filter((x) => x.breakdown.disagree).length };
  }
}

// ---------------------------------------------------------------- usage log + remote queue (per server instance)

interface UsageState {
  day: string;
  calls: number;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
}

function freshUsage(): UsageState {
  return { day: dayKey(), calls: 0, promptTokens: 0, outputTokens: 0, thoughtTokens: 0 };
}

interface Globals {
  memory: MemoryState;
  usage: UsageState;
  remote: { cursor: number; commands: RemoteCommand[] };
  challenges: Challenge[];
  /** Last "you're up" call from the operator (the mirror announces it). */
  called?: CalledChallenger | null;
  /** What the mirror is showing (posted by the kiosk, read by /admin). */
  kioskStatus?: KioskStatus | null;
  store?: ScanStore;
  storeUrl?: string;
}

const g = globalThis as unknown as { __auraServer?: Globals };
g.__auraServer ??= {
  memory: { scans: [], cards: [], cardImages: new Map(), entries: [], battles: [], fits: [], players: new Map(), reactions: new Map() },
  usage: freshUsage(),
  remote: { cursor: 0, commands: [] },
  challenges: [],
};
const globals = g.__auraServer;
// Older dev instances may predate some fields.
globals.memory.cards ??= [];
globals.memory.cardImages ??= new Map();
globals.memory.entries ??= [];
globals.memory.battles ??= [];
globals.memory.fits ??= [];
globals.memory.players ??= new Map();
globals.memory.reactions ??= new Map();
// Battles and cards from before N-player battles lack the new fields: drop them (dev memory only).
globals.memory.battles = globals.memory.battles.filter((b) => Array.isArray((b as Partial<StoredBattle>).players));
globals.memory.cards = globals.memory.cards.filter((c) => typeof (c as Partial<StoredCard>).kind === "string");
globals.remote ??= { cursor: 0, commands: [] };
globals.challenges ??= [];
globals.called ??= null;
globals.kioskStatus ??= null;

/** Tiger Data when TIGER_DATABASE_URL is set, else memory. Rebuilt when the URL changes (dev .env reloads). */
export function getScanStore(): ScanStore {
  const url = process.env.TIGER_DATABASE_URL?.trim() ?? "";
  // Reuse the instance unless the URL changed, or dev hot reload replaced the class it was built from.
  const current = globals.store && (url ? globals.store instanceof TigerStore : globals.store instanceof MemoryStore);
  if (globals.store && current && globals.storeUrl === url) return globals.store;
  globals.storeUrl = url;
  globals.store = url ? new TigerStore(getTigerPool(url)) : new MemoryStore(globals.memory);
  return globals.store;
}

function usageForToday(): UsageState {
  if (globals.usage.day !== dayKey()) globals.usage = freshUsage();
  return globals.usage;
}

export function recordUsage(usage: TokenUsage): void {
  const u = usageForToday();
  u.calls += 1;
  u.promptTokens += usage.promptTokens;
  u.outputTokens += usage.outputTokens;
  u.thoughtTokens += usage.thoughtTokens;
  console.info(`[aura] openai call #${u.calls} today: prompt=${usage.promptTokens} output=${usage.outputTokens} thoughts=${usage.thoughtTokens}`);
}

export function estimateSpendUsd(u: { promptTokens: number; outputTokens: number; thoughtTokens: number }): number {
  const input = (u.promptTokens / 1_000_000) * OPENAI_INPUT_USD_PER_M;
  const output = ((u.outputTokens + u.thoughtTokens) / 1_000_000) * OPENAI_OUTPUT_USD_PER_M;
  return Math.round((input + output) * 10000) / 10000;
}

export async function usageSnapshot(): Promise<UsageStats> {
  const u = usageForToday();
  const store = getScanStore();
  let scansToday = 0;
  try {
    scansToday = await store.countToday();
  } catch {
    scansToday = -1;
  }
  return {
    day: u.day,
    callsToday: u.calls,
    scansToday,
    cap: DAILY_SCAN_CAP,
    promptTokens: u.promptTokens,
    outputTokens: u.outputTokens,
    thoughtTokens: u.thoughtTokens,
    estimatedSpendUsd: estimateSpendUsd(u),
    store: store.kind,
    model: OPENAI_MODEL,
    mock: isMockMode(),
  };
}

/** Remote control command queue (per server instance; the kiosk polls it). */
export function pushRemoteCommand(command: RemoteCommand["command"]): RemoteCommand {
  const r = globals.remote;
  r.cursor += 1;
  const cmd: RemoteCommand = { id: r.cursor, command, at: Date.now() };
  r.commands.push(cmd);
  if (r.commands.length > 50) r.commands.splice(0, r.commands.length - 50);
  return cmd;
}

export function remoteCommandsSince(cursor: number): { cursor: number; commands: RemoteCommand[] } {
  const r = globals.remote;
  return { cursor: r.cursor, commands: r.commands.filter((c) => c.id > cursor) };
}

// ---------------------------------------------------------------- challenger queue (per server instance)

/** Someone tapped "BEAT THIS SCORE" on a phone: they are up next at the kiosk. */
export interface Challenge {
  id: number;
  name: string;
  /** The score they are chasing, and the card it came from. */
  target: number;
  cardId: string;
  at: number;
}

/** The operator called someone up: the mirror says their name once. */
export interface CalledChallenger {
  seq: number;
  name: string;
  target: number;
  at: number;
}
let callSeq = 0;

/** Drop an entry (the operator's remove button). */
export function removeChallenge(id: number): boolean {
  const queue = liveChallenges();
  const i = queue.findIndex((c) => c.id === id);
  if (i < 0) return false;
  queue.splice(i, 1);
  return true;
}

/** Call someone up: out of the queue, and the mirror announces them. */
export function callChallenge(id: number): CalledChallenger | null {
  const queue = liveChallenges();
  const i = queue.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const [c] = queue.splice(i, 1);
  globals.called = { seq: ++callSeq, name: c.name, target: c.target, at: Date.now() };
  return globals.called;
}

export function lastCalled(): CalledChallenger | null {
  return globals.called ?? null;
}

export function setKioskStatus(status: KioskStatus): void {
  globals.kioskStatus = status;
}

export function getKioskStatus(): KioskStatus | null {
  return globals.kioskStatus ?? null;
}

/** A challenge stays in the queue this long (then they probably wandered off). */
export const CHALLENGE_TTL_MS = 20 * 60 * 1000;
export const MAX_CHALLENGES = 12;
let challengeSeq = 0;

export function liveChallenges(now = Date.now()): Challenge[] {
  globals.challenges = globals.challenges.filter((c) => now - c.at < CHALLENGE_TTL_MS);
  return globals.challenges;
}

/** Join the queue (a name already waiting is not queued twice). Returns the position (1-based). */
export function pushChallenge(input: Omit<Challenge, "id" | "at">, now = Date.now()): { challenge: Challenge; position: number } {
  const queue = liveChallenges(now);
  const existing = queue.findIndex((c) => c.name.toUpperCase() === input.name.toUpperCase());
  if (existing >= 0) return { challenge: queue[existing], position: existing + 1 };
  const challenge: Challenge = { ...input, id: ++challengeSeq, at: now };
  queue.push(challenge);
  if (queue.length > MAX_CHALLENGES) queue.splice(0, queue.length - MAX_CHALLENGES);
  return { challenge, position: queue.indexOf(challenge) + 1 };
}
