import type { Pool } from "pg";
import type { KioskStatus } from "@/lib/kiosk/status";
import type { RemoteCommand, RemoteCommandName } from "@/lib/kiosk/types";
import {
  CHALLENGE_TTL_MS,
  MAX_CHALLENGES,
  callChallenge,
  getKioskStatus,
  getScanStore,
  lastCalled,
  liveChallenges,
  pushChallenge,
  pushRemoteCommand,
  remoteCommandsSince,
  removeChallenge,
  setKioskStatus,
  type CalledChallenger,
  type Challenge,
} from "./store";
import { TigerStore } from "./tigerStore";

/**
 * The kiosk relay: what the mirror is showing, remote commands, the challenger
 * line and mirror launch requests. The mirror talks to the server on the kiosk
 * laptop, phones and judges use the public server; with Tiger Data configured
 * both read and write the same tables, so /admin works from either. Without it
 * (MOCK MODE, tests) everything stays in this server's memory.
 */
export interface Relay {
  readonly kind: "tiger" | "memory";
  setKioskStatus(status: Omit<KioskStatus, "at">): Promise<void>;
  /** `at` is on this server's clock. */
  kioskStatus(): Promise<KioskStatus | null>;
  pushCommand(command: RemoteCommandName): Promise<RemoteCommand>;
  commandsSince(cursor: number): Promise<{ cursor: number; commands: RemoteCommand[] }>;
  challenges(): Promise<Challenge[]>;
  /** Join the line (a name already waiting is not queued twice). Position is 1-based. */
  pushChallenge(input: Omit<Challenge, "id" | "at">): Promise<{ position: number }>;
  removeChallenge(id: number): Promise<boolean>;
  callChallenge(id: number): Promise<CalledChallenger | null>;
  lastCalled(): Promise<CalledChallenger | null>;
  /** Ask the kiosk laptop to open the mirror (it polls; see mirrorLaunch.ts). */
  requestMirrorLaunch(): Promise<void>;
  /** True once per pending request younger than LAUNCH_REQUEST_TTL_S. */
  takeMirrorLaunch(): Promise<boolean>;
}

/** Commands older than this are never replayed to a mirror that reconnects. */
const COMMAND_TTL_S = 60;
/** A launch request nobody picked up in this long is dropped (the laptop server was off). */
export const LAUNCH_REQUEST_TTL_S = 30;
const TTL_S = Math.round(CHALLENGE_TTL_MS / 1000);

const memoryRelay: Relay = {
  kind: "memory",
  setKioskStatus: async (status) => setKioskStatus({ ...status, at: Date.now() }),
  kioskStatus: async () => getKioskStatus(),
  pushCommand: async (command) => pushRemoteCommand(command),
  commandsSince: async (cursor) => remoteCommandsSince(cursor),
  challenges: async () => liveChallenges(),
  pushChallenge: async (input) => ({ position: pushChallenge(input).position }),
  removeChallenge: async (id) => removeChallenge(id),
  callChallenge: async (id) => callChallenge(id),
  lastCalled: async () => lastCalled(),
  requestMirrorLaunch: async () => {
    throw new Error("mirror launch relay needs Tiger Data");
  },
  takeMirrorLaunch: async () => false,
};

const ms = (d: Date | string) => new Date(d).getTime();

interface ChallengerRow {
  id: string;
  name: string;
  target: number;
  card_id: string;
  created_at: Date;
}

class TigerRelay implements Relay {
  readonly kind = "tiger" as const;
  constructor(private readonly store: TigerStore) {}

  private db(): Promise<Pool> {
    return this.store.connection();
  }

  async setKioskStatus(status: Omit<KioskStatus, "at">) {
    await (await this.db()).query(
      `INSERT INTO kiosk_status (id, status, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [status],
    );
  }

  async kioskStatus() {
    const { rows } = await (await this.db()).query<{ status: Omit<KioskStatus, "at">; age_ms: number }>(
      `SELECT status, (extract(epoch FROM now() - updated_at) * 1000)::float8 AS age_ms FROM kiosk_status WHERE id = 1`,
    );
    const r = rows[0];
    // Age from the database clock, so the two servers' clocks never have to agree.
    return r ? { ...r.status, at: Date.now() - Math.max(0, r.age_ms) } : null;
  }

  async pushCommand(command: RemoteCommandName) {
    const db = await this.db();
    const { rows } = await db.query<{ id: string; created_at: Date }>(`INSERT INTO remote_commands (command) VALUES ($1) RETURNING id, created_at`, [command]);
    await db.query(`DELETE FROM remote_commands WHERE created_at < now() - INTERVAL '1 hour'`);
    return { id: Number(rows[0].id), command, at: ms(rows[0].created_at) };
  }

  async commandsSince(cursor: number) {
    const { rows } = await (await this.db()).query<{ cursor: string; commands: { id: string; command: RemoteCommandName; at: number }[] }>(
      `SELECT coalesce(max(id), 0) AS cursor,
              coalesce(json_agg(json_build_object('id', id, 'command', command, 'at', (extract(epoch FROM created_at) * 1000)::bigint) ORDER BY id)
                FILTER (WHERE id > $1 AND created_at > now() - make_interval(secs => $2)), '[]') AS commands
       FROM remote_commands`,
      [cursor, COMMAND_TTL_S],
    );
    return { cursor: Number(rows[0].cursor), commands: rows[0].commands.map((c) => ({ ...c, id: Number(c.id), at: Number(c.at) })) };
  }

  async challenges() {
    const { rows } = await (await this.db()).query<ChallengerRow>(
      `SELECT id, name, target, card_id, created_at FROM challengers
       WHERE called_at IS NULL AND NOT removed AND created_at > now() - make_interval(secs => $1)
       ORDER BY id DESC LIMIT $2`,
      [TTL_S, MAX_CHALLENGES],
    );
    return rows.reverse().map((r) => ({ id: Number(r.id), name: r.name, target: r.target, cardId: r.card_id, at: ms(r.created_at) }));
  }

  async pushChallenge(input: Omit<Challenge, "id" | "at">) {
    const waiting = await this.challenges();
    const existing = waiting.findIndex((c) => c.name.toUpperCase() === input.name.toUpperCase());
    if (existing >= 0) return { position: existing + 1 };
    const db = await this.db();
    await db.query(`INSERT INTO challengers (name, target, card_id) VALUES ($1, $2, $3)`, [input.name, input.target, input.cardId]);
    await db.query(`DELETE FROM challengers WHERE created_at < now() - INTERVAL '1 day'`);
    return { position: Math.min(waiting.length + 1, MAX_CHALLENGES) };
  }

  async removeChallenge(id: number) {
    const { rowCount } = await (await this.db()).query(`UPDATE challengers SET removed = true WHERE id = $1 AND called_at IS NULL AND NOT removed`, [id]);
    return (rowCount ?? 0) > 0;
  }

  async callChallenge(id: number) {
    const { rows } = await (await this.db()).query<{ name: string; target: number; called_at: Date }>(
      `UPDATE challengers SET called_at = now()
       WHERE id = $1 AND called_at IS NULL AND NOT removed AND created_at > now() - make_interval(secs => $2)
       RETURNING name, target, called_at`,
      [id, TTL_S],
    );
    const r = rows[0];
    // The call time doubles as the sequence number the mirror watches for.
    return r ? { seq: ms(r.called_at), name: r.name, target: r.target, at: ms(r.called_at) } : null;
  }

  async lastCalled() {
    const { rows } = await (await this.db()).query<{ name: string; target: number; called_at: Date }>(
      `SELECT name, target, called_at FROM challengers WHERE called_at IS NOT NULL ORDER BY called_at DESC LIMIT 1`,
    );
    const r = rows[0];
    return r ? { seq: ms(r.called_at), name: r.name, target: r.target, at: ms(r.called_at) } : null;
  }

  async requestMirrorLaunch() {
    await (await this.db()).query(`INSERT INTO mirror_launches DEFAULT VALUES`);
  }

  async takeMirrorLaunch() {
    const { rowCount } = await (await this.db()).query(
      `UPDATE mirror_launches SET taken_at = now() WHERE taken_at IS NULL AND requested_at > now() - make_interval(secs => $1)`,
      [LAUNCH_REQUEST_TTL_S],
    );
    return (rowCount ?? 0) > 0;
  }
}

const tigerRelays = new WeakMap<TigerStore, TigerRelay>();

/** Tiger Data when the scan store is Tiger (shared by every server), else this server's memory. */
export function getRelay(): Relay {
  const store = getScanStore();
  if (!(store instanceof TigerStore)) return memoryRelay;
  let relay = tigerRelays.get(store);
  if (!relay) {
    relay = new TigerRelay(store);
    tigerRelays.set(store, relay);
  }
  return relay;
}
