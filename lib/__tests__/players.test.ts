import { describe, expect, it } from "vitest";
import { FIXTURE_RACING_JACKET } from "@/lib/fixtures";
import { HANDLE_CODE_LENGTH, historyPath, makeHandle, newHandleCode, parseHandle } from "@/lib/players";
import { TIGER_SCHEMA } from "@/lib/server/tigerSchema";
import { MemoryStore, bucketScans, hottestHourOf, type StoredScan } from "@/lib/server/store";
import { gptJudge, scoreScan } from "@/lib/scoring";

describe("player handles (AURA ID)", () => {
  it("generates readable codes (no 0/O/1/I/L)", () => {
    for (let i = 0; i < 200; i++) {
      const code = newHandleCode();
      expect(code).toHaveLength(HANDLE_CODE_LENGTH);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("parses typed handles loosely and rejects bad codes", () => {
    expect(parseHandle("calvin#k7qx")).toEqual({ name: "CALVIN", code: "K7QX", handle: "CALVIN#K7QX" });
    expect(parseHandle("  Big Dawg # K7QX ")).toEqual({ name: "BIG DAWG", code: "K7QX", handle: "BIG DAWG#K7QX" });
    expect(parseHandle("calvin")).toBeNull();
    expect(parseHandle("calvin#K0QX")).toBeNull(); // 0 is never issued
    expect(parseHandle("#K7QX")).toBeNull();
    expect(makeHandle(" calvin ", "k7qx")).toBe("CALVIN#K7QX");
    expect(historyPath("CALVIN#K7QX")).toBe("/u/CALVIN%23K7QX");
  });
});

const scanAt = (iso: string, specialness: number, sentiment: "positive" | "negative"): StoredScan => {
  const analysis = { ...FIXTURE_RACING_JACKET, specialness, sentiment };
  const breakdown = scoreScan(analysis, [gptJudge(analysis, "gpt-4o-mini")]);
  return { id: iso, imageHash: iso, analysis, breakdown, aura: breakdown.aura, createdAt: iso };
};

describe("time series (memory stand-in for the Tiger continuous aggregate)", () => {
  it("buckets scans every 15 minutes with swings and disagreements", () => {
    const scans = [scanAt("2026-09-24T14:01:00Z", 40, "positive"), scanAt("2026-09-24T14:14:00Z", 95, "positive"), scanAt("2026-09-24T14:16:00Z", 96, "negative")];
    const buckets = bucketScans(scans);
    expect(buckets.map((b) => b.bucket)).toEqual(["2026-09-24T14:00:00.000Z", "2026-09-24T14:15:00.000Z"]);
    expect(buckets[0]).toMatchObject({ scans: 2, swings: 1 });
    expect(buckets[0].maxAura).toBeGreaterThan(500_000);
    expect(buckets[1]).toMatchObject({ scans: 1, swings: 1 });
    expect(buckets[1].minAura).toBeLessThan(-500_000);
  });

  it("finds the busiest hour", () => {
    const scans = [scanAt("2026-09-24T13:05:00Z", 50, "positive"), scanAt("2026-09-24T14:05:00Z", 50, "positive"), scanAt("2026-09-24T14:50:00Z", 50, "positive")];
    expect(hottestHourOf(bucketScans(scans))).toMatchObject({ hour: "2026-09-24T14:00:00.000Z", scans: 2 });
    expect(hottestHourOf([])).toBeNull();
  });

  it("keeps a player's history in order across scans", async () => {
    const store = new MemoryStore({ scans: [], cards: [], cardImages: new Map(), entries: [], battles: [], fits: [], players: new Map(), reactions: new Map(), hiddenAt: new Map(), rawPhotos: new Map() });
    const player = await store.createPlayer("Calvin");
    expect(player.handle).toMatch(/^CALVIN#[A-Z2-9]{4}$/);
    expect(await store.getPlayer(player.handle)).toEqual(player);
    for (const [i, aura] of [12_000, -40_000, 300_000].entries()) {
      await store.insertLeaderboard({ id: `e${i}`, scanId: `s${i}`, nickname: "Calvin", aura, handle: player.handle });
    }
    await store.insertLeaderboard({ id: "other", scanId: "sx", nickname: "Someone", aura: 1, handle: null });
    const history = await store.playerHistory(player.handle);
    expect(history?.scans.map((s) => s.aura)).toEqual([12_000, -40_000, 300_000]);
    expect(await store.playerHistory("NOBODY#AAAA")).toBeNull();
  });
});

describe("Tiger schema", () => {
  it("uses hypertables and a real-time continuous aggregate", () => {
    const sql = TIGER_SCHEMA.join("\n");
    expect(sql).toMatch(/create_hypertable\('scans'/);
    expect(sql).toMatch(/create_hypertable\('judge_scores'/);
    expect(sql).toMatch(/timescaledb\.continuous, timescaledb\.materialized_only = false/);
    expect(sql).toMatch(/add_continuous_aggregate_policy\('aura_15m'/);
    // Every statement is idempotent (safe to re-run on each boot).
    for (const s of TIGER_SCHEMA) expect(s).toMatch(/IF NOT EXISTS|if_not_exists => TRUE/);
  });
});
