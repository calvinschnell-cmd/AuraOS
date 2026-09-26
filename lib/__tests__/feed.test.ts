import { describe, expect, it } from "vitest";
import { computeOutcome } from "@/lib/battle/score";
import type { BattleRecord } from "@/lib/battle/types";
import { FIXTURE_RACING_JACKET } from "@/lib/fixtures";
import { battleCardMeta, metaForm, scanCardMeta, squadMemberMeta } from "@/lib/kiosk/cardJobs";
import type { BattleResult, LeaderboardEntry, ScanResult } from "@/lib/kiosk/types";
import { buildNarrative, findRivalry, handleName, mostImproved, rivalryLine, squadChampion, winStreaks } from "@/lib/leaderboard/narrative";
import type { PoseResult } from "@/lib/pose/score";
import { gptJudge, scoreScan } from "@/lib/scoring";
import { MemoryStore, liveChallenges, pushChallenge, type NewCard } from "@/lib/server/store";

const pose: PoseResult = { score: 50, archetype: "hero", label: "HERO STANCE", match: 70, signals: null, standout: null, source: "mock" };

let seq = 0;
function duel(a: string | null, b: string | null, winner: 0 | 1 | null, minute: number): BattleRecord {
  const fits: [number, number] = winner === null ? [100, 100] : winner === 0 ? [200, 100] : [100, 200];
  const o = computeOutcome("duel", [
    { slot: 0, scanId: `s${seq}a`, nickname: "A", fitAura: fits[0], pose, topStyle: "streetwear", cohesion: 50, handle: a },
    { slot: 1, scanId: `s${seq}b`, nickname: "B", fitAura: fits[1], pose, topStyle: "Y2K", cohesion: 50, handle: b },
  ]);
  seq++;
  return { ...o, id: `b${seq}`, commentary: null, createdAt: new Date(Date.UTC(2026, 8, 26, 12, minute)).toISOString() };
}

describe("leaderboard narrative", () => {
  it("finds the rivalry of the day (lead changed hands more than once)", () => {
    const battles = [duel("ALEX#AAAA", "JORDAN#BBBB", 0, 1), duel("JORDAN#BBBB", "ALEX#AAAA", 0, 2), duel("ALEX#AAAA", "JORDAN#BBBB", 0, 3)];
    const r = findRivalry(battles)!;
    expect(r.battles).toBe(3);
    expect(r.leadChanges).toBe(2);
    expect(r.winsA + r.winsB).toBe(3);
    expect(rivalryLine(r)).toMatch(/^ALEX VS\. JORDAN · 3 BATTLES · ALEX LEADS 2-1$/);
    // One flip only is not a rivalry yet; unclaimed players never count.
    expect(findRivalry(battles.slice(0, 2))).toBeNull();
    expect(findRivalry([duel(null, "JORDAN#BBBB", 0, 1), duel("JORDAN#BBBB", null, 1, 2), duel(null, "JORDAN#BBBB", 0, 3)])).toBeNull();
  });

  it("reports a tied rivalry", () => {
    const r = findRivalry([duel("A#AAAA", "B#BBBB", 0, 1), duel("A#AAAA", "B#BBBB", 1, 2), duel("A#AAAA", "B#BBBB", 0, 3), duel("A#AAAA", "B#BBBB", 1, 4)])!;
    expect(rivalryLine(r)).toContain("CURRENTLY TIED 2-2");
  });

  it("counts win streaks back from the latest battle", () => {
    const streaks = winStreaks([duel("A#AAAA", "B#BBBB", 1, 1), duel("A#AAAA", "C#CCCC", 0, 2), duel("A#AAAA", "B#BBBB", 0, 3), duel("A#AAAA", "C#CCCC", 0, 4)]);
    expect(streaks["A#AAAA"]).toBe(3);
    expect(streaks["B#BBBB"]).toBeUndefined();
  });

  it("shows most-improved deltas and the squad champion", () => {
    const e = (handle: string, aura: number, minute: number): LeaderboardEntry => ({ id: `${handle}${minute}`, scanId: "s", nickname: "n", aura, createdAt: new Date(Date.UTC(2026, 8, 26, 12, minute)).toISOString(), standout: null, handle });
    expect(mostImproved([e("A#AAAA", 100, 1), e("A#AAAA", 440, 2), e("B#BBBB", 500, 1), e("B#BBBB", 10, 2)])).toEqual({ "A#AAAA": 340 });
    const squad = computeOutcome("squad", [0, 1, 2].map((slot) => ({ slot, scanId: `q${slot}`, nickname: "Q", fitAura: 1000 * slot, pose, topStyle: "streetwear" as const, cohesion: 80 })));
    const champ = squadChampion([{ ...squad, id: "sq", commentary: null, createdAt: "2026-09-26T12:00:00.000Z" }])!;
    expect(champ.players).toBe(3);
    expect(champ.score).toBe(squad.squad!.score);
    expect(buildNarrative([], []).rivalry).toBeNull();
    expect(handleName("CALVIN#K7QX")).toBe("CALVIN");
  });
});

function scan(): ScanResult {
  const analysis = FIXTURE_RACING_JACKET;
  const breakdown = scoreScan(analysis, [gptJudge(analysis, "gpt-4o-mini")]);
  return { id: "scan-1", analysis, aura: breakdown.aura, breakdown, rank: { position: 1, total: 1 }, capturedAt: 0, image: { dataUrl: "", width: 1, height: 1, hash: "h", placeholder: true }, cached: false, mock: true };
}

describe("cards = feed", () => {
  const card = (over: Partial<NewCard>): NewCard => ({ id: crypto.randomUUID(), scanId: "scan-1", battleId: null, kind: "scan", headline: 1, target: 1, title: "T", verdict: null, caption: null, parentId: null, slot: null, ...over });

  it("posts every saved card to the feed (newest first), squad members nested", async () => {
    const store = new MemoryStore({ scans: [], cards: [], cardImages: new Map(), entries: [], battles: [], fits: [], players: new Map(), reactions: new Map() });
    const first = await store.insertCard(card({ title: "FIRST" }), Buffer.from("a"));
    await new Promise((r) => setTimeout(r, 5));
    const squadCard = await store.insertCard(card({ kind: "squad", title: "SQUAD", scanId: null, battleId: "b1" }), Buffer.from("b"));
    const member = await store.insertCard(card({ parentId: squadCard.id, slot: 2, battleId: "b1" }), Buffer.from("c"));
    const feed = await store.feed(10);
    expect(feed.map((f) => f.title)).toEqual(["SQUAD", "FIRST"]);
    expect((await store.childCards(squadCard.id)).map((c) => c.id)).toEqual([member.id]);
    expect(await store.feed(10, squadCard.createdAt)).toHaveLength(1);
    expect((await store.feedEntry(first.id))?.reactions["🔥"]).toBe(0);
  });

  it("counts one reaction per device per emoji", async () => {
    const store = new MemoryStore({ scans: [], cards: [], cardImages: new Map(), entries: [], battles: [], fits: [], players: new Map(), reactions: new Map() });
    const c = await store.insertCard(card({}), Buffer.from("a"));
    await store.react(c.id, "🔥", "device-aaaa");
    await store.react(c.id, "🔥", "device-aaaa");
    const counts = await store.react(c.id, "🔥", "device-bbbb");
    expect(counts["🔥"]).toBe(2);
    expect(counts["💀"]).toBe(0);
  });

  it("claims a battle slot once", async () => {
    const store = new MemoryStore({ scans: [], cards: [], cardImages: new Map(), entries: [], battles: [], fits: [], players: new Map(), reactions: new Map() });
    const b = duel(null, null, 0, 1);
    await store.insertBattle(b);
    expect(await store.claimBattleSlot(b.id, 1, "SAM#K7QX")).toBe(true);
    expect(await store.claimBattleSlot(b.id, 1, "OTHER#K7QX")).toBe(false);
    expect((await store.getBattle(b.id))?.players[1].handle).toBe("SAM#K7QX");
    expect((await store.recentBattles(5))[0].id).toBe(b.id);
  });

  it("builds card meta for solo, battle and squad member cards", () => {
    const s = scan();
    const solo = scanCardMeta("id1", s, "CALVIN", null);
    expect(solo).toMatchObject({ kind: "scan", headline: s.aura, target: s.aura, title: "CALVIN" });
    const o = computeOutcome("squad", [0, 1].map((slot) => ({ slot, scanId: `s${slot}`, nickname: `N${slot}`, fitAura: 1000 + slot, pose, topStyle: "streetwear" as const, cohesion: 60 })));
    const battle: BattleResult = { ...o, id: "b", commentary: "Vibe.\nP1: one\nP2: two", createdAt: "", capturedAt: 0, players: o.players.map((p) => ({ ...p, scan: s })) };
    const meta = battleCardMeta("id2", battle);
    expect(meta.kind).toBe("squad");
    expect(meta.title).toBe("SQUAD OF 2");
    expect(meta.verdict).toContain("Vibe.");
    const member = squadMemberMeta("id3", "id2", battle, 1);
    expect(member).toMatchObject({ parentId: "id2", slot: 1, verdict: "two", kind: "scan" });
    const form = metaForm(member, new Blob(["x"]));
    expect(form.get("parentId")).toBe("id2");
    expect(form.get("name")).toBeNull();
  });

  it("queues challengers without duplicates", () => {
    const now = Date.now();
    const a = pushChallenge({ name: "Zed", target: 5, cardId: "c" }, now);
    const b = pushChallenge({ name: "zed", target: 5, cardId: "c" }, now);
    expect(b.position).toBe(a.position);
    expect(liveChallenges(now + 60 * 60 * 1000).some((c) => c.name === "Zed")).toBe(false);
  });
});
