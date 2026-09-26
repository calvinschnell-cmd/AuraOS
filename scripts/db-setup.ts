/**
 * Tiger Data setup + check: `npm run db:setup`.
 * Applies the schema (idempotent), then verifies the hypertables and the
 * continuous aggregate exist and runs every time-series read the app uses.
 * Reads TIGER_DATABASE_URL from .env.local like Next does. Read-only after
 * the schema step, so it is safe to run against the live event database.
 */
import { loadEnvConfig } from "@next/env";
import { ensureTigerSchema, getTigerPool, TigerStore } from "../lib/server/tigerStore";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.TIGER_DATABASE_URL?.trim();
  if (!url) {
    console.error("TIGER_DATABASE_URL is not set in .env.local.");
    process.exit(1);
  }
  const pool = getTigerPool(url);
  const t0 = Date.now();
  await ensureTigerSchema(pool);
  console.log(`schema applied in ${Date.now() - t0}ms`);

  const { rows: version } = await pool.query<{ extversion: string }>(`SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`);
  console.log(`timescaledb ${version[0]?.extversion ?? "(not installed!)"}`);
  const { rows: hypertables } = await pool.query<{ hypertable_name: string }>(`SELECT hypertable_name FROM timescaledb_information.hypertables ORDER BY 1`);
  console.log(`hypertables: ${hypertables.map((h) => h.hypertable_name).join(", ")}`);
  const { rows: caggs } = await pool.query<{ view_name: string; materialized_only: boolean }>(`SELECT view_name, materialized_only FROM timescaledb_information.continuous_aggregates`);
  console.log(`continuous aggregates: ${caggs.map((c) => `${c.view_name} (real-time: ${!c.materialized_only})`).join(", ")}`);

  const store = new TigerStore(pool);
  const [count, timeline, hottest, split, top] = await Promise.all([store.countToday(), store.timeline(), store.hottestHour(), store.judgeSplitToday(), store.leaderboard(3)]);
  console.log(`today: ${count} scans, ${timeline.length} timeline buckets, hottest hour ${hottest ? `${hottest.hour} (${hottest.scans} scans)` : "none yet"}`);
  console.log(`judges: ${split.disagreements} disagreements in ${split.scans} two-judge scans; leaderboard top: ${top.map((e) => `${e.nickname} ${e.aura}`).join(", ") || "empty"}`);
  await pool.end();
  console.log("Tiger Data OK.");
}

main().catch((err) => {
  console.error("Tiger Data setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
