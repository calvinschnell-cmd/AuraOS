import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/fixtures";
import { MemoryStore, type StoredScan } from "@/lib/server/store";
import { scoreScan, gptJudge } from "@/lib/scoring";

const emptyStore = () =>
  new MemoryStore({ scans: [], cards: [], cardImages: new Map(), entries: [], battles: [], fits: [], players: new Map(), reactions: new Map(), hiddenAt: new Map(), rawPhotos: new Map() });

let n = 0;
async function addEntry(store: MemoryStore, aura: number, opts: { deviceId?: string; handle?: string | null; source?: "mirror" | "mobile" } = {}) {
  const analysis = FIXTURES[0];
  const breakdown = { ...scoreScan(analysis, [gptJudge(analysis, "test")], {}), aura };
  const scan: StoredScan = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, imageHash: `h${n}`, analysis, breakdown, aura, createdAt: new Date(Date.now() + n).toISOString(), source: opts.source ?? "mirror" };
  await store.insert(scan);
  await store.insertLeaderboard({ id: `e${n}`, scanId: scan.id, nickname: `P${n}`, aura, handle: opts.handle ?? null, source: opts.source, deviceId: opts.deviceId ?? null });
  const cardId = `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
  await store.insertCard({ id: cardId, scanId: scan.id, battleId: null, kind: "scan", headline: aura, target: aura, title: `P${n}`, verdict: null, caption: null, parentId: null, slot: null, source: opts.source, deviceId: opts.deviceId ?? null }, Buffer.from("png"));
  return { scan, cardId };
}

describe("phone leaderboard: your best entry", () => {
  it("finds the viewer's best entry and rank even far outside the top", async () => {
    const store = emptyStore();
    for (let i = 0; i < 30; i++) await addEntry(store, 100_000 - i * 1000);
    await addEntry(store, 5_000, { deviceId: "phone-abc-123", source: "mobile" });
    await addEntry(store, 1_000, { deviceId: "phone-abc-123", source: "mobile" });
    const top = await store.leaderboard(25);
    expect(top).toHaveLength(25);
    const you = await store.viewerBest("phone-abc-123", null);
    expect(you?.entry.aura).toBe(5_000);
    expect(you?.rank).toBe(31);
    expect(you?.entry.source).toBe("mobile");
    // Device ids never leave the store.
    expect(JSON.stringify(you)).not.toContain("phone-abc-123");
    expect(JSON.stringify(top)).not.toContain("deviceId");
  });

  it("matches by AURA ID too (a mirror scan claimed with a handle)", async () => {
    const store = emptyStore();
    await addEntry(store, 50_000);
    await addEntry(store, 20_000, { handle: "SAM#AB12" });
    expect((await store.viewerBest(null, "sam#ab12"))?.rank).toBe(2);
    expect(await store.viewerBest("nobody-here-1", null)).toBeNull();
  });
});

describe("admin removal", () => {
  it("hides a card from the feed, its page, its image and the board", async () => {
    const store = emptyStore();
    const keep = await addEntry(store, 10_000);
    const gone = await addEntry(store, 90_000, { deviceId: "phone-xyz-789" });
    const before = new Date(Date.now() - 1000).toISOString();
    expect(await store.hideCard(gone.cardId)).toBe(true);
    expect((await store.feed(10)).map((e) => e.id)).toEqual([keep.cardId]);
    expect(await store.feedEntry(gone.cardId)).toBeNull();
    expect(await store.getCardImage(gone.cardId)).toBeNull();
    expect((await store.leaderboard(10)).map((e) => e.scanId)).toEqual([keep.scan.id]);
    expect(await store.viewerBest("phone-xyz-789", null)).toBeNull();
    expect(await store.hiddenCardIds(before)).toEqual([gone.cardId]);
    expect(await store.hideCard("00000000-0000-4000-9000-999999999999")).toBe(false);
  });
});
