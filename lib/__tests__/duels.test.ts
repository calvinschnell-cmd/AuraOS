import { beforeAll, describe, expect, it, vi } from "vitest";
import { isDuelId, newDuelId } from "@/lib/duels/types";
import { FIXTURES } from "@/lib/fixtures";
import { gptJudge, scoreScan } from "@/lib/scoring";

let n = 0;
async function phoneCard(deviceId: string, aura: number, name: string) {
  const { getScanStore } = await import("@/lib/server/store");
  const store = getScanStore();
  const analysis = FIXTURES[n % FIXTURES.length];
  n += 1;
  const id = `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
  await store.insert({ id, imageHash: `duel-${n}`, analysis, breakdown: { ...scoreScan(analysis, [gptJudge(analysis, "t")], {}), aura }, aura, createdAt: new Date().toISOString(), source: "mobile" });
  await store.insertLeaderboard({ id: `de${n}`, scanId: id, nickname: name, aura, handle: null, source: "mobile", deviceId });
  const cardId = `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`;
  await store.insertCard({ id: cardId, scanId: id, battleId: null, kind: "scan", headline: aura, target: aura, title: name, verdict: null, caption: null, parentId: null, slot: null, source: "mobile", deviceId }, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  return cardId;
}

describe("challenge ids", () => {
  it("are 12 lowercase base36 chars, random", async () => {
    const { randomBytes } = await import("node:crypto");
    const ids = new Set(Array.from({ length: 500 }, () => newDuelId((k) => randomBytes(k))));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(isDuelId(id)).toBe(true);
    expect(isDuelId("ABCDEFGHIJKL")).toBe(false);
    expect(isDuelId("short")).toBe(false);
  });
});

describe("challenge by link (async battles)", () => {
  beforeAll(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("TIGER_DATABASE_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("only the phone that made a card can challenge from it, and it keeps one link", async () => {
    const { createDuel, DuelError } = await import("@/lib/server/duels");
    const card = await phoneCard("alice-phone-0001", 50_000, "ALICE");
    await expect(createDuel(card, "someone-else-001")).rejects.toBeInstanceOf(DuelError);
    const d1 = await createDuel(card, "alice-phone-0001");
    const d2 = await createDuel(card, "alice-phone-0001");
    expect(d1.id).toBe(d2.id);
    expect(isDuelId(d1.id)).toBe(true);
  });

  it("battles each friend against the stored scan, hides the score until they scan, and posts to the feed", async () => {
    const { acceptDuel, createDuel, duelView } = await import("@/lib/server/duels");
    const { getScanStore } = await import("@/lib/server/store");
    const store = getScanStore();
    const aliceCard = await phoneCard("alice-phone-0002", 50_000, "ALICE");
    const duel = await createDuel(aliceCard, "alice-phone-0002");

    // A visitor sees who sent it, not the score or any result.
    const before = await duelView(duel.id, "bob-phone-00001");
    expect(before?.role).toBe("visitor");
    expect(before?.challenger.aura).toBeNull();
    expect(before?.battles).toEqual([]);

    // You can't accept your own link, or with someone else's card.
    await expect(acceptDuel(duel.id, aliceCard, "alice-phone-0002")).rejects.toThrow(/OWN CHALLENGE/);
    const bobCard = await phoneCard("bob-phone-00001", 20_000, "BOB");
    await expect(acceptDuel(duel.id, bobCard, "carol-phone-0001")).rejects.toThrow(/THIS PHONE/);

    const bob = await acceptDuel(duel.id, bobCard, "bob-phone-00001");
    expect((await acceptDuel(duel.id, bobCard, "bob-phone-00001")).id).toBe(bob.id); // retry: same result
    const battle = await store.getBattle(bob.battleId);
    expect(battle?.players.map((p) => p.scanId)).toEqual([(await store.getCard(aliceCard))!.scanId, (await store.getCard(bobCard))!.scanId]);
    expect(battle?.commentary).toBeTruthy();

    // Several friends: each gets their own battle against the same original scan.
    const carolCard = await phoneCard("carol-phone-0001", 90_000, "CAROL");
    await acceptDuel(duel.id, carolCard, "carol-phone-0001");

    const bobView = await duelView(duel.id, "bob-phone-00001");
    expect(bobView?.role).toBe("friend");
    expect(bobView?.challenger.aura).toBe(50_000);
    expect(bobView?.battles.filter((b) => b.mine)).toHaveLength(1);
    const alice = await duelView(duel.id, "alice-phone-0002");
    expect(alice?.role).toBe("challenger");
    expect(alice?.count).toBe(2);
    expect(alice?.battles.map((b) => b.friend.name).sort()).toEqual(["BOB", "CAROL"]);
    expect(JSON.stringify(alice)).not.toContain("phone-");

    // The battles are their own feed items that open the challenge.
    const feed = await store.feed(10);
    const challenges = feed.filter((e) => e.kind === "challenge");
    if (challenges.length > 0) expect(challenges.every((e) => e.challengeId === duel.id)).toBe(true);
    const accepts = await store.duelAccepts(duel.id);
    expect(accepts).toHaveLength(2);
  }, 30_000);
});
