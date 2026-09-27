import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/fixtures";
import type { LeaderboardBoard } from "@/lib/kiosk/types";
import { MemoryStore, defaultBoard, type StoredScan } from "@/lib/server/store";
import { gptJudge, scoreScan } from "@/lib/scoring";

const emptyStore = () =>
  new MemoryStore({ scans: [], cards: [], cardImages: new Map(), entries: [], battles: [], fits: [], players: new Map(), reactions: new Map(), hiddenAt: new Map(), rawPhotos: new Map() });

let n = 0;
async function add(store: MemoryStore, aura: number, opts: { board?: LeaderboardBoard; source?: "mirror" | "mobile"; deviceId?: string; handle?: string } = {}) {
  const analysis = FIXTURES[0];
  const breakdown = { ...scoreScan(analysis, [gptJudge(analysis, "test")], {}), aura };
  const scan: StoredScan = { id: `00000000-0000-4000-8100-${String(++n).padStart(12, "0")}`, imageHash: `b${n}`, analysis, breakdown, aura, createdAt: new Date(Date.now() + n).toISOString(), source: opts.source ?? "mirror" };
  await store.insert(scan);
  await store.insertLeaderboard({ id: `b${n}`, scanId: scan.id, nickname: `P${n}`, aura, handle: opts.handle ?? null, source: opts.source, deviceId: opts.deviceId ?? null, board: opts.board });
}

describe("four leaderboards", () => {
  it("defaults the board from the source: phone uploads on MOBILE, the rest on SOLO", () => {
    expect(defaultBoard("mobile")).toBe("mobile");
    expect(defaultBoard("mirror")).toBe("solo");
    expect(defaultBoard(undefined)).toBe("solo");
  });

  it("ranks each board on its own, and all together without one", async () => {
    const store = emptyStore();
    await add(store, 400_000, { board: "duo" }); // fit + pose: would top a mixed board
    await add(store, 300_000, { board: "squad" });
    await add(store, 120_000); // mirror solo
    await add(store, 90_000, { source: "mobile", deviceId: "phone-board-1" });
    await add(store, 80_000, { source: "mobile" });

    expect((await store.leaderboard(10, "solo")).map((e) => e.aura)).toEqual([120_000]);
    expect((await store.leaderboard(10, "duo")).map((e) => e.aura)).toEqual([400_000]);
    expect((await store.leaderboard(10, "squad")).map((e) => e.aura)).toEqual([300_000]);
    expect((await store.leaderboard(10, "mobile")).map((e) => e.aura)).toEqual([90_000, 80_000]);
    expect(await store.leaderboard(10)).toHaveLength(5);
    expect((await store.leaderboard(10, "mobile"))[0].board).toBe("mobile");
  });

  it("gives your best and your rank per board", async () => {
    const store = emptyStore();
    await add(store, 500_000, { board: "duo", handle: "ALEX#AA11" });
    await add(store, 60_000, { source: "mobile", deviceId: "phone-board-2" });
    await add(store, 40_000, { source: "mobile", handle: "ALEX#AA11" });
    // On one mixed board the duel total hides the phone scan; on MOBILE it is #2.
    expect((await store.viewerBest(null, "ALEX#AA11"))?.entry.board).toBe("duo");
    const mobile = await store.viewerBest(null, "ALEX#AA11", "mobile");
    expect(mobile?.entry.aura).toBe(40_000);
    expect(mobile?.rank).toBe(2);
    expect(await store.viewerBest(null, "ALEX#AA11", "squad")).toBeNull();
  });
});
