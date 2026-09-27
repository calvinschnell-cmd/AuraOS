import { rootCertificates, type ConnectionOptions } from "node:tls";
import { Pool, type PoolClient } from "pg";
import type { HottestHour, JudgeSplit, LeaderboardEntry, PlayerHistory, PlayerInfo, ScanSource, TimelineBucket } from "@/lib/kiosk/types";
import { makeHandle, newHandleCode } from "@/lib/players";
import type { Analysis } from "@/lib/schema";
import type { JudgeId, ScoreBreakdown } from "@/lib/scoring";
import { dayStart } from "./day";
import type { BattleOutcome } from "@/lib/battle/types";
import type { FeedEntry } from "@/lib/feed/types";
import type { CardKind } from "@/lib/share/caption";
import type { Duel, DuelAccept } from "@/lib/duels/types";
import { emptyReactions, feedEntryOf, type NewCard, type NewLeaderboardEntry, type ScanStore, type StoredBattle, type StoredCard, type StoredScan } from "./store";
import { TIGER_SCHEMA } from "./tigerSchema";
import { TIMESCALE_CA_PEM } from "./timescaleCa";

/**
 * Tiger Data (TimescaleDB on Postgres) store. Connection string from
 * TIGER_DATABASE_URL (never hardcoded). The schema (tigerSchema.ts) is applied
 * idempotently on first use. Time-series reads go through the aura_15m
 * continuous aggregate and the judge_scores hypertable.
 */

const g = globalThis as unknown as { __auraTigerPools?: Map<string, Pool> };

/**
 * pg connection options with full TLS verification (certificate chain and
 * hostname) against the public roots plus Timescale's CA. sslmode is dropped
 * from the URL because pg lets it override the explicit `ssl` option.
 */
export function tigerConnectionOptions(url: string): { connectionString: string; ssl: ConnectionOptions } {
  const parsed = new URL(url);
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) parsed.searchParams.delete(key);
  return {
    connectionString: parsed.toString(),
    ssl: { rejectUnauthorized: true, ca: [...rootCertificates, TIMESCALE_CA_PEM], servername: parsed.hostname },
  };
}

/** One pool per connection string, surviving dev hot reloads. */
export function getTigerPool(url: string): Pool {
  g.__auraTigerPools ??= new Map();
  let pool = g.__auraTigerPools.get(url);
  if (!pool) {
    pool = new Pool({ ...tigerConnectionOptions(url), max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 8_000, statement_timeout: 8_000 });
    pool.on("error", (err) => console.error("[aura] tiger pool error", err.message));
    g.__auraTigerPools.set(url, pool);
  }
  return pool;
}

/** Apply the schema (idempotent). */
export async function ensureTigerSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    for (const statement of TIGER_SCHEMA) await client.query(statement);
  } finally {
    client.release();
  }
}

interface ScanRow {
  id: string;
  image_hash: string;
  aura: number;
  analysis: Analysis;
  breakdown: ScoreBreakdown;
  created_at: Date;
  source: string;
}

interface EntryRow {
  id: string;
  scan_id: string;
  handle: string | null;
  nickname: string;
  aura: number;
  standout: string | null;
  created_at: Date;
  source: string;
}

/** Ids are uuid columns: anything else (a bad URL, a typo) is simply not found instead of a SQL error. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string): boolean => UUID.test(id);

const sourceOf = (v: string | null | undefined): ScanSource => (v === "mobile" ? "mobile" : "mirror");
const toScan = (r: ScanRow): StoredScan => ({ id: r.id, imageHash: r.image_hash, aura: r.aura, analysis: r.analysis, breakdown: r.breakdown, createdAt: r.created_at.toISOString(), source: sourceOf(r.source) });
const toEntry = (r: EntryRow): LeaderboardEntry => ({
  id: r.id,
  scanId: r.scan_id,
  handle: r.handle,
  nickname: r.nickname,
  aura: r.aura,
  standout: r.standout,
  createdAt: r.created_at.toISOString(),
  source: sourceOf(r.source),
});
interface CardRow {
  id: string;
  scan_id: string | null;
  battle_id: string | null;
  nft_signature: string | null;
  created_at: Date;
  kind: string;
  headline: number;
  target: number;
  title: string;
  verdict: string | null;
  caption: string | null;
  parent_id: string | null;
  slot: number | null;
  source: string;
  device_id: string | null;
  hidden_at: Date | null;
}

const CARD_COLS = "id, scan_id, battle_id, nft_signature, created_at, kind, headline, target, title, verdict, caption, parent_id, slot, source, device_id, hidden_at";
const toCard = (r: CardRow): StoredCard => ({
  id: r.id,
  scanId: r.scan_id,
  battleId: r.battle_id,
  imageUrl: `/api/cards/${r.id}/image`,
  createdAt: r.created_at.toISOString(),
  nftSignature: r.nft_signature,
  kind: (["scan", "battle", "squad", "challenge"].includes(r.kind) ? r.kind : r.battle_id ? "battle" : "scan") as CardKind,
  headline: r.headline,
  target: r.target,
  title: r.title,
  verdict: r.verdict,
  caption: r.caption,
  parentId: r.parent_id,
  slot: r.slot,
  source: sourceOf(r.source),
  deviceId: r.device_id,
  hidden: r.hidden_at !== null,
});

interface BattleRow {
  id: string;
  outcome: BattleOutcome | null;
  commentary: string | null;
  created_at: Date;
}

interface DuelRow {
  id: string;
  card_id: string;
  scan_id: string;
  device_id: string;
  created_at: Date;
}
interface AcceptRow {
  id: string;
  duel_id: string;
  card_id: string;
  scan_id: string;
  battle_id: string;
  feed_card_id: string | null;
  device_id: string;
  created_at: Date;
}
const toDuel = (r: DuelRow): Duel => ({ id: r.id, cardId: r.card_id, scanId: r.scan_id, deviceId: r.device_id, createdAt: r.created_at.toISOString() });

const SCAN_COLS = "id, image_hash, aura, analysis, breakdown, created_at, source";
const ENTRY_COLS = "id, scan_id, handle, nickname, aura, standout, created_at, source";

export class TigerStore implements ScanStore {
  readonly kind = "tiger" as const;
  private ready: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  /** Schema on first use; retried on the next call if it failed. */
  /** The pool, schema applied (the kiosk relay shares it). */
  connection(): Promise<Pool> {
    return this.db();
  }

  private async db(): Promise<Pool> {
    this.ready ??= ensureTigerSchema(this.pool).catch((err) => {
      this.ready = null;
      throw err;
    });
    await this.ready;
    return this.pool;
  }

  private async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await (await this.db()).connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------- scans

  async getByHash(hash: string) {
    const { rows } = await (await this.db()).query<ScanRow>(`SELECT ${SCAN_COLS} FROM scans WHERE image_hash = $1 ORDER BY created_at DESC LIMIT 1`, [hash]);
    return rows[0] ? toScan(rows[0]) : null;
  }
  async getById(id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await (await this.db()).query<ScanRow>(`SELECT ${SCAN_COLS} FROM scans WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? toScan(rows[0]) : null;
  }
  async insert(scan: StoredScan) {
    const judges = scan.breakdown.judges ?? [];
    await this.tx(async (c) => {
      await c.query(
        `INSERT INTO scans (id, created_at, image_hash, aura, judge_count, disagree, analysis, breakdown, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [scan.id, scan.createdAt, scan.imageHash, scan.aura, Math.max(1, judges.length), scan.breakdown.disagree ?? false, scan.analysis, scan.breakdown, scan.source ?? "mirror"],
      );
      for (const j of judges) {
        await c.query(
          `INSERT INTO judge_scores (created_at, scan_id, judge, model, specialness, sentiment, cutoff, aura) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [scan.createdAt, scan.id, j.judge, j.model, j.specialness, j.sentiment, j.cutoff, j.aura],
        );
      }
    });
  }
  async countToday() {
    const { rows } = await (await this.db()).query<{ n: string }>(`SELECT count(*) AS n FROM scans WHERE created_at >= $1`, [dayStart()]);
    return Number(rows[0].n);
  }
  async countTodayBySource(source: ScanSource) {
    const { rows } = await (await this.db()).query<{ n: string }>(`SELECT count(*) AS n FROM scans WHERE created_at >= $1 AND source = $2`, [dayStart(), source]);
    return Number(rows[0].n);
  }
  async saveRawPhoto(scanId: string, data: Buffer, mimeType: string) {
    if (!isUuid(scanId)) return;
    await (await this.db()).query(`INSERT INTO raw_photos (scan_id, mime_type, data) VALUES ($1, $2, $3) ON CONFLICT (scan_id) DO NOTHING`, [scanId, mimeType, data]);
  }
  async rankToday(aura: number) {
    const { rows } = await (await this.db()).query<{ above: string; total: string }>(
      `SELECT count(*) FILTER (WHERE aura > $2) AS above, count(*) AS total FROM scans WHERE created_at >= $1`,
      [dayStart(), aura],
    );
    return { position: Number(rows[0].above) + 1, total: Math.max(1, Number(rows[0].total)) };
  }
  async specialnessToday(judge: JudgeId) {
    const { rows } = await (await this.db()).query<{ specialness: number }>(`SELECT specialness FROM judge_scores WHERE judge = $1 AND created_at >= $2`, [judge, dayStart()]);
    return rows.map((r) => r.specialness);
  }

  // ---------------------------------------------------------------- cards

  async insertCard(card: NewCard, png: Buffer) {
    const { rows } = await (await this.db()).query<{ created_at: Date }>(
      `INSERT INTO cards (id, scan_id, battle_id, png, kind, headline, target, title, verdict, caption, parent_id, slot, source, device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING created_at`,
      [card.id, card.scanId, card.battleId, png, card.kind, card.headline, card.target, card.title, card.verdict, card.caption, card.parentId, card.slot, card.source ?? "mirror", card.deviceId ?? null],
    );
    return {
      ...card,
      source: card.source ?? "mirror",
      deviceId: card.deviceId ?? null,
      hidden: false,
      imageUrl: `/api/cards/${card.id}/image`,
      createdAt: rows[0].created_at.toISOString(),
      nftSignature: null,
    };
  }
  async getCard(id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await (await this.db()).query<CardRow>(`SELECT ${CARD_COLS} FROM cards WHERE id = $1`, [id]);
    return rows[0] ? toCard(rows[0]) : null;
  }
  async getCardImage(id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await (await this.db()).query<{ png: Buffer }>(`SELECT png FROM cards WHERE id = $1 AND hidden_at IS NULL`, [id]);
    return rows[0]?.png ?? null;
  }
  async setCardNft(id: string, signature: string) {
    await (await this.db()).query(`UPDATE cards SET nft_signature = $2 WHERE id = $1`, [id, signature]);
  }
  async setCardDevice(id: string, deviceId: string) {
    if (!isUuid(id)) return false;
    const { rowCount } = await (await this.db()).query(`UPDATE cards SET device_id = $2 WHERE id = $1 AND device_id IS NULL`, [id, deviceId]);
    return (rowCount ?? 0) > 0;
  }
  async hideCard(id: string) {
    if (!isUuid(id)) return false;
    return this.tx(async (c) => {
      const { rows } = await c.query<{ scan_id: string | null; battle_id: string | null }>(
        `UPDATE cards SET hidden_at = coalesce(hidden_at, now()) WHERE id = $1 RETURNING scan_id, battle_id`,
        [id],
      );
      if (!rows[0]) return false;
      await c.query(`UPDATE cards SET hidden_at = coalesce(hidden_at, now()) WHERE parent_id = $1`, [id]);
      if (rows[0].scan_id && !rows[0].battle_id) await c.query(`UPDATE leaderboard_entries SET hidden = true WHERE scan_id = $1`, [rows[0].scan_id]);
      return true;
    });
  }
  async hiddenCardIds(since: string) {
    const { rows } = await (await this.db()).query<{ id: string }>(`SELECT id FROM cards WHERE hidden_at > $1 ORDER BY hidden_at DESC LIMIT 200`, [since]);
    return rows.map((r) => r.id);
  }

  // ---------------------------------------------------------------- leaderboard

  async insertLeaderboard(entry: NewLeaderboardEntry) {
    const scan = await this.getById(entry.scanId);
    const standout = scan ? ([...scan.analysis.items].sort((a, b) => b.uniqueness - a.uniqueness)[0]?.name ?? null) : null;
    await (await this.db()).query(
      `INSERT INTO leaderboard_entries (id, scan_id, handle, nickname, aura, standout, source, device_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (scan_id) DO NOTHING`,
      [entry.id, entry.scanId, entry.handle, entry.nickname, entry.aura, standout, entry.source ?? "mirror", entry.deviceId ?? null],
    );
  }
  async entryForScan(scanId: string) {
    if (!isUuid(scanId)) return null;
    const { rows } = await (await this.db()).query<EntryRow>(`SELECT ${ENTRY_COLS} FROM leaderboard_entries WHERE scan_id = $1`, [scanId]);
    return rows[0] ? toEntry(rows[0]) : null;
  }
  async leaderboard(limit: number) {
    const { rows } = await (await this.db()).query<EntryRow>(`SELECT ${ENTRY_COLS} FROM leaderboard_entries WHERE NOT hidden ORDER BY aura DESC, created_at ASC LIMIT $1`, [limit]);
    return rows.map(toEntry);
  }
  async viewerBest(deviceId: string | null, handle: string | null) {
    if (!deviceId && !handle) return null;
    const db = await this.db();
    const { rows } = await db.query<EntryRow>(
      `SELECT ${ENTRY_COLS} FROM leaderboard_entries WHERE NOT hidden AND (device_id = $1 OR handle = $2) ORDER BY aura DESC, created_at ASC LIMIT 1`,
      [deviceId, handle?.toUpperCase() ?? null],
    );
    const best = rows[0];
    if (!best) return null;
    const { rows: r } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM leaderboard_entries WHERE NOT hidden AND (aura > $1 OR (aura = $1 AND created_at < $2))`,
      [best.aura, best.created_at],
    );
    return { entry: toEntry(best), rank: Number(r[0].n) + 1 };
  }
  async recentEntries(limit: number) {
    const { rows } = await (await this.db()).query<EntryRow>(`SELECT ${ENTRY_COLS} FROM leaderboard_entries WHERE NOT hidden ORDER BY created_at DESC LIMIT $1`, [limit]);
    return rows.map(toEntry);
  }
  async cardIdsForScans(scanIds: string[]) {
    if (scanIds.length === 0) return {};
    // Own card first (solo, or a squad member's personal card), else the battle card they were in.
    const { rows } = await (await this.db()).query<{ scan_id: string; card_id: string }>(
      `SELECT DISTINCT ON (scan_id) scan_id, card_id FROM (
         SELECT scan_id, id AS card_id, created_at, 0 AS pri FROM cards WHERE scan_id = ANY($1::uuid[])
         UNION ALL
         SELECT bp.scan_id, c.id AS card_id, c.created_at, 1 AS pri
           FROM battle_players bp JOIN cards c ON c.battle_id = bp.battle_id AND c.parent_id IS NULL
          WHERE bp.scan_id = ANY($1::uuid[])
       ) found ORDER BY scan_id, pri, created_at DESC`,
      [scanIds],
    );
    return Object.fromEntries(rows.map((r) => [r.scan_id, r.card_id]));
  }
  async deleteEntry(id: string) {
    if (!isUuid(id)) return false;
    const { rowCount } = await (await this.db()).query(`DELETE FROM leaderboard_entries WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }

  // ---------------------------------------------------------------- battles, fit history

  async insertBattle(b: StoredBattle) {
    const { id, commentary, createdAt, ...outcome } = b;
    await this.tx(async (c) => {
      await c.query(
        `INSERT INTO battles (id, scan_a, scan_b, roast, created_at, mode, outcome, commentary) VALUES ($1, $2, $3, $4, $5, $6, $7, $4)`,
        [id, b.players[0].scanId, b.players[1].scanId, commentary, createdAt, b.mode, outcome],
      );
      for (const p of b.players) {
        await c.query(
          `INSERT INTO battle_players (battle_id, slot, scan_id, handle, total, place, won, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, p.slot, p.scanId, p.handle, p.total, p.place, b.winnerSlot === p.slot, createdAt],
        );
      }
    });
  }

  /** Battle rows -> records, with handles from battle_players (claims update those rows). */
  private async hydrateBattles(rows: BattleRow[]): Promise<StoredBattle[]> {
    const withOutcome = rows.filter((r) => r.outcome && Array.isArray(r.outcome.players));
    if (withOutcome.length === 0) return [];
    const { rows: handles } = await (await this.db()).query<{ battle_id: string; slot: number; handle: string | null }>(
      `SELECT battle_id, slot, handle FROM battle_players WHERE battle_id = ANY($1::uuid[])`,
      [withOutcome.map((r) => r.id)],
    );
    const key = (id: string, slot: number) => `${id}:${slot}`;
    const byKey = new Map(handles.map((h) => [key(h.battle_id, h.slot), h.handle]));
    return withOutcome.map((r) => {
      const o = r.outcome!;
      return {
        ...o,
        players: o.players.map((p) => ({ ...p, handle: byKey.get(key(r.id, p.slot)) ?? p.handle ?? null })),
        id: r.id,
        commentary: r.commentary,
        createdAt: r.created_at.toISOString(),
      };
    });
  }
  async getBattle(id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await (await this.db()).query<BattleRow>(`SELECT id, outcome, commentary, created_at FROM battles WHERE id = $1`, [id]);
    return (await this.hydrateBattles(rows))[0] ?? null;
  }
  async setBattleCommentary(id: string, commentary: string) {
    if (!isUuid(id)) return;
    await (await this.db()).query(`UPDATE battles SET commentary = $2, roast = $2 WHERE id = $1`, [id, commentary]);
  }
  async claimBattleSlot(id: string, slot: number, handle: string) {
    if (!isUuid(id)) return false;
    const { rowCount } = await (await this.db()).query(`UPDATE battle_players SET handle = $3 WHERE battle_id = $1 AND slot = $2 AND handle IS NULL`, [id, slot, handle]);
    return (rowCount ?? 0) > 0;
  }
  async recentBattles(limit: number) {
    const { rows } = await (await this.db()).query<BattleRow>(
      `SELECT id, outcome, commentary, created_at FROM battles WHERE outcome IS NOT NULL ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return this.hydrateBattles(rows);
  }

  // ---------------------------------------------------------------- feed (cards) + reactions

  private async reactionCounts(ids: string[]): Promise<Map<string, Record<string, number>>> {
    const out = new Map(ids.map((id) => [id, emptyReactions()]));
    if (ids.length === 0) return out;
    const { rows } = await (await this.db()).query<{ card_id: string; emoji: string; n: string }>(
      `SELECT card_id, emoji, count(*) AS n FROM reactions WHERE card_id = ANY($1::uuid[]) GROUP BY card_id, emoji`,
      [ids],
    );
    for (const r of rows) out.get(r.card_id)![r.emoji] = Number(r.n);
    return out;
  }
  private async toFeed(rows: CardRow[]): Promise<FeedEntry[]> {
    const solo = rows.filter((r) => r.scan_id && !r.battle_id).map((r) => r.scan_id!);
    const challenges = rows.filter((r) => r.kind === "challenge").map((r) => r.id);
    const [counts, handles, duelIds] = await Promise.all([
      this.reactionCounts(rows.map((r) => r.id)),
      solo.length
        ? (await this.db()).query<{ scan_id: string; handle: string | null }>(`SELECT scan_id, handle FROM leaderboard_entries WHERE scan_id = ANY($1::uuid[])`, [solo]).then((q) => new Map(q.rows.map((h) => [h.scan_id, h.handle])))
        : Promise.resolve(new Map<string, string | null>()),
      challenges.length
        ? (await this.db())
            .query<{ feed_card_id: string; duel_id: string }>(`SELECT feed_card_id, duel_id FROM duel_accepts WHERE feed_card_id = ANY($1::uuid[])`, [challenges])
            .then((q) => new Map(q.rows.map((d) => [d.feed_card_id, d.duel_id])))
        : Promise.resolve(new Map<string, string>()),
    ]);
    return rows.map((r) =>
      feedEntryOf(toCard(r), counts.get(r.id) ?? emptyReactions(), (r.scan_id && !r.battle_id ? handles.get(r.scan_id) : null) ?? null, duelIds.get(r.id) ?? null),
    );
  }
  async feed(limit: number, before?: string | null, since?: string | null) {
    const { rows } = await (await this.db()).query<CardRow>(
      `SELECT ${CARD_COLS} FROM cards WHERE parent_id IS NULL AND hidden_at IS NULL AND ($2::timestamptz IS NULL OR created_at < $2) AND ($3::timestamptz IS NULL OR created_at > $3) ORDER BY created_at DESC LIMIT $1`,
      [limit, before ?? null, since ?? null],
    );
    return this.toFeed(rows);
  }
  async cardsForHandle(handle: string, limit: number) {
    const { rows } = await (await this.db()).query<CardRow>(
      `SELECT ${CARD_COLS} FROM cards
        WHERE hidden_at IS NULL AND (
              (parent_id IS NULL AND battle_id IS NULL AND scan_id IN (SELECT scan_id FROM leaderboard_entries WHERE handle = $1))
           OR (parent_id IS NULL AND battle_id IN (SELECT battle_id FROM battle_players WHERE handle = $1))
           OR (parent_id IS NOT NULL AND scan_id IN (SELECT scan_id FROM battle_players WHERE handle = $1)))
        ORDER BY created_at DESC LIMIT $2`,
      [handle.toUpperCase(), limit],
    );
    return this.toFeed(rows);
  }
  async feedEntry(cardId: string) {
    if (!isUuid(cardId)) return null;
    const { rows } = await (await this.db()).query<CardRow>(`SELECT ${CARD_COLS} FROM cards WHERE id = $1 AND hidden_at IS NULL`, [cardId]);
    return (await this.toFeed(rows))[0] ?? null;
  }
  async childCards(parentId: string) {
    if (!isUuid(parentId)) return [];
    const { rows } = await (await this.db()).query<CardRow>(`SELECT ${CARD_COLS} FROM cards WHERE parent_id = $1 AND hidden_at IS NULL ORDER BY slot`, [parentId]);
    return this.toFeed(rows);
  }
  async react(cardId: string, emoji: string, clientId: string) {
    if (isUuid(cardId)) {
      await (await this.db()).query(`INSERT INTO reactions (card_id, emoji, client_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [cardId, emoji, clientId]);
    }
    return (await this.reactionCounts([cardId])).get(cardId) ?? emptyReactions();
  }
  async setEntryHandle(scanId: string, handle: string) {
    if (!isUuid(scanId)) return false;
    const { rowCount } = await (await this.db()).query(`UPDATE leaderboard_entries SET handle = $2 WHERE scan_id = $1 AND handle IS NULL`, [scanId, handle]);
    return (rowCount ?? 0) > 0;
  }
  async entriesForHandles(handles: string[]) {
    if (handles.length === 0) return [];
    const { rows } = await (await this.db()).query<EntryRow>(`SELECT ${ENTRY_COLS} FROM leaderboard_entries WHERE NOT hidden AND handle = ANY($1::text[]) ORDER BY created_at ASC`, [handles]);
    return rows.map(toEntry);
  }
  // ---------------------------------------------------------------- challenge links

  async createDuel(duel: Omit<Duel, "createdAt">) {
    const db = await this.db();
    await db.query(`INSERT INTO duels (id, card_id, scan_id, device_id) VALUES ($1, $2, $3, $4) ON CONFLICT (card_id) DO NOTHING`, [duel.id, duel.cardId, duel.scanId, duel.deviceId]);
    return (await this.duelForCard(duel.cardId))!;
  }
  async getDuel(id: string) {
    const { rows } = await (await this.db()).query<DuelRow>(`SELECT id, card_id, scan_id, device_id, created_at FROM duels WHERE id = $1`, [id]);
    return rows[0] ? toDuel(rows[0]) : null;
  }
  async duelForCard(cardId: string) {
    if (!isUuid(cardId)) return null;
    const { rows } = await (await this.db()).query<DuelRow>(`SELECT id, card_id, scan_id, device_id, created_at FROM duels WHERE card_id = $1`, [cardId]);
    return rows[0] ? toDuel(rows[0]) : null;
  }
  async addDuelAccept(a: Omit<DuelAccept, "createdAt">) {
    const { rows } = await (await this.db()).query<{ created_at: Date }>(
      `INSERT INTO duel_accepts (id, duel_id, card_id, scan_id, battle_id, feed_card_id, device_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at`,
      [a.id, a.duelId, a.cardId, a.scanId, a.battleId, a.feedCardId, a.deviceId],
    );
    return { ...a, createdAt: rows[0].created_at.toISOString() };
  }
  async duelAccepts(duelId: string) {
    const { rows } = await (await this.db()).query<AcceptRow>(
      `SELECT id, duel_id, card_id, scan_id, battle_id, feed_card_id, device_id, created_at FROM duel_accepts WHERE duel_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [duelId],
    );
    return rows.map((r) => ({ id: r.id, duelId: r.duel_id, cardId: r.card_id, scanId: r.scan_id, battleId: r.battle_id, feedCardId: r.feed_card_id, deviceId: r.device_id, createdAt: r.created_at.toISOString() }));
  }

  async recentFitSignatures(limit: number) {
    const { rows } = await (await this.db()).query<{ signature: string }>(`SELECT signature FROM fit_history ORDER BY created_at DESC LIMIT $1`, [limit]);
    return rows.reverse().map((r) => r.signature.split("|"));
  }
  async insertFit(signature: string[], seed: string) {
    await (await this.db()).query(`INSERT INTO fit_history (signature, seed) VALUES ($1, $2)`, [signature.join("|"), seed]);
  }

  // ---------------------------------------------------------------- players (per-user history)

  async createPlayer(name: string) {
    const db = await this.db();
    for (let attempt = 0; attempt < 10; attempt++) {
      const handle = makeHandle(name, newHandleCode());
      const { rows } = await db.query<{ handle: string }>(`INSERT INTO players (handle, name) VALUES ($1, $2) ON CONFLICT (handle) DO NOTHING RETURNING handle`, [handle, name.trim()]);
      if (rows[0]) return { handle, name: name.trim() };
    }
    throw new Error("could not allocate a player handle");
  }
  async getPlayer(handle: string): Promise<PlayerInfo | null> {
    const { rows } = await (await this.db()).query<PlayerInfo>(`SELECT handle, name FROM players WHERE handle = $1`, [handle]);
    return rows[0] ?? null;
  }
  async playerHistory(handle: string): Promise<PlayerHistory | null> {
    const player = await this.getPlayer(handle);
    if (!player) return null;
    const { rows } = await (await this.db()).query<EntryRow>(`SELECT ${ENTRY_COLS} FROM leaderboard_entries WHERE handle = $1 ORDER BY created_at ASC`, [handle]);
    return { ...player, scans: rows.map((r) => ({ scanId: r.scan_id, aura: r.aura, nickname: r.nickname, createdAt: r.created_at.toISOString() })) };
  }

  // ---------------------------------------------------------------- time series (aura_15m continuous aggregate)

  async timeline(): Promise<TimelineBucket[]> {
    const { rows } = await (await this.db()).query<{ bucket: Date; scans: string; avg_aura: string; max_aura: number; min_aura: number; swings: string; disagreements: string }>(
      `SELECT bucket, scans, avg_aura, max_aura, min_aura, swings, disagreements FROM aura_15m WHERE bucket >= $1 ORDER BY bucket`,
      [dayStart()],
    );
    return rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      scans: Number(r.scans),
      avgAura: Math.round(Number(r.avg_aura)),
      maxAura: r.max_aura,
      minAura: r.min_aura,
      swings: Number(r.swings),
      disagreements: Number(r.disagreements),
    }));
  }
  async hottestHour(): Promise<HottestHour | null> {
    // Hierarchical rollup: hourly buckets on top of the 15-minute aggregate.
    const { rows } = await (await this.db()).query<{ hour: Date; scans: string; avg_aura: string }>(
      `SELECT time_bucket(INTERVAL '1 hour', bucket) AS hour, sum(scans) AS scans, sum(avg_aura * scans) / nullif(sum(scans), 0) AS avg_aura
       FROM aura_15m WHERE bucket >= $1 GROUP BY hour ORDER BY sum(scans) DESC, hour DESC LIMIT 1`,
      [dayStart()],
    );
    const r = rows[0];
    return r ? { hour: r.hour.toISOString(), scans: Number(r.scans), avgAura: Math.round(Number(r.avg_aura)) } : null;
  }
  async judgeSplitToday(): Promise<JudgeSplit> {
    const { rows } = await (await this.db()).query<{ scans: string; disagreements: string }>(
      `SELECT count(*) FILTER (WHERE judge_count >= 2) AS scans, count(*) FILTER (WHERE disagree) AS disagreements FROM scans WHERE created_at >= $1`,
      [dayStart()],
    );
    return { scans: Number(rows[0].scans), disagreements: Number(rows[0].disagreements) };
  }
}
