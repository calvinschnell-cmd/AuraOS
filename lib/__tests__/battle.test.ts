import { describe, expect, it } from "vitest";
import { cleanCommentary, duelPrompt, mockDuelCommentary, mockSquadCommentary, parseSquadCommentary, squadPrompt, type CommentaryPlayer } from "@/lib/battle/commentary";
import { ALL_DIFFERENT_VIBE, STYLE_VIBES, computeOutcome, squadScore, squadSynergy, squadVibe, type BattleEntrant } from "@/lib/battle/score";
import { outfitFromAnalysis, colorHex } from "@/lib/clothing/fromAnalysis";
import { FIXTURE_OLD_MONEY, FIXTURE_RACING_JACKET } from "@/lib/fixtures";
import { allScored, canStart, isFull, newLobby, nextOpenSlot, withCaptured, withFailed, withScored } from "@/lib/kiosk/lobby";
import type { LobbySlot, ScanResult } from "@/lib/kiosk/types";
import { NO_POSE_SCORE, POSE_AURA_PER_POINT, POSE_NEUTRAL, type PoseResult } from "@/lib/pose/score";
import { beatThisLine, shareCaption } from "@/lib/share/caption";
import { BattleInputError, parseBattleRequest } from "@/lib/server/battles";

const pose = (score: number, archetype: PoseResult["archetype"] = "hero"): PoseResult => ({
  score,
  archetype,
  label: archetype === "unknown" ? "POSE NOT DETECTED" : "HERO STANCE",
  match: 80,
  signals: null,
  standout: null,
  source: "mock",
});

const entrant = (slot: number, fitAura: number, poseScore: number, extra: Partial<BattleEntrant> = {}): BattleEntrant => ({
  slot,
  scanId: `scan-${slot}`,
  nickname: `Fit ${slot}`,
  fitAura,
  pose: pose(poseScore),
  topStyle: "streetwear",
  cohesion: 70,
  ...extra,
});

describe("battle outcome", () => {
  it("adds the pose to the fit and ranks by total", () => {
    const o = computeOutcome("duel", [entrant(0, 100_000, POSE_NEUTRAL), entrant(1, 50_000, POSE_NEUTRAL + 10)]);
    const [a, b] = o.players;
    expect(a.total).toBe(100_000);
    expect(b.poseAura).toBe(10 * POSE_AURA_PER_POINT);
    expect(b.total).toBe(50_000 + 25_000);
    expect(o.winnerSlot).toBe(0);
    expect(o.gap).toBe(25_000);
    expect(o.decidedBy).toBe("fit");
    expect(a.place).toBe(1);
    expect(b.place).toBe(2);
  });

  it("can be won on the pose alone when the fits are close", () => {
    const o = computeOutcome("duel", [entrant(0, 30_000, 30), entrant(1, 20_000, 80)]);
    expect(o.winnerSlot).toBe(1);
    expect(o.decidedBy).toBe("pose");
    // Level fits: the pose decides it.
    expect(computeOutcome("duel", [entrant(0, 10_000, 40), entrant(1, 10_000, 45)]).decidedBy).toBe("pose");
    // Better at both.
    expect(computeOutcome("duel", [entrant(0, 90_000, 90), entrant(1, 10_000, 20)]).decidedBy).toBe("both");
  });

  it("calls a dead tie (shared place, no winner)", () => {
    const o = computeOutcome("duel", [entrant(0, 10_000, 50), entrant(1, 10_000, 50)]);
    expect(o.winnerSlot).toBeNull();
    expect(o.decidedBy).toBeNull();
    expect(o.gap).toBe(0);
    expect(o.players.map((p) => p.place)).toEqual([1, 1]);
  });

  it("scores squads with a synergy-scaled group aura and a vibe", () => {
    const o = computeOutcome("squad", [entrant(0, 100_000, 50), entrant(1, 60_000, 60), entrant(2, -20_000, 30)]);
    expect(o.squad).not.toBeNull();
    expect(o.squad!.vibe).toBe(STYLE_VIBES.streetwear);
    expect(o.players.map((p) => p.place)).toEqual([1, 2, 3]);
    expect(o.winnerSlot).toBe(0);
    expect(squadScore(100_000, 100)).toBe(125_000);
    expect(squadScore(100_000, 0)).toBe(75_000);
    // Synergy pulls a negative squad toward zero.
    expect(squadScore(-100_000, 100)).toBe(-75_000);
  });

  it("rewards cohesive but distinct squads", () => {
    const same = squadSynergy([
      { topStyle: "streetwear", cohesion: 80 },
      { topStyle: "streetwear", cohesion: 80 },
    ]);
    const distinct = squadSynergy([
      { topStyle: "streetwear", cohesion: 80 },
      { topStyle: "old money", cohesion: 80 },
    ]);
    expect(distinct).toBeGreaterThan(same);
    expect(squadVibe(["streetwear", "Y2K", "grunge"])).toBe(ALL_DIFFERENT_VIBE);
    expect(squadVibe(["Y2K", "Y2K", "grunge"])).toBe(STYLE_VIBES.Y2K);
  });

  it("validates battle requests", () => {
    expect(parseBattleRequest({ mode: "duel", players: [{ slot: 0, scanId: "a" }, { slot: 1, scanId: "b" }] }).players).toHaveLength(2);
    expect(() => parseBattleRequest({ mode: "duel", players: [{ slot: 0, scanId: "a" }] })).toThrow(BattleInputError);
    expect(() => parseBattleRequest({ mode: "squad", players: [{ slot: 0, scanId: "a" }, { slot: 0, scanId: "b" }] })).toThrow(BattleInputError);
    expect(() => parseBattleRequest({ mode: "squad", players: Array.from({ length: 6 }, (_, i) => ({ slot: i, scanId: `s${i}` })) })).toThrow(BattleInputError);
    expect(() => parseBattleRequest({ mode: "chaos", players: [] })).toThrow(BattleInputError);
  });
});

const commentaryPlayers = (o: ReturnType<typeof computeOutcome>): CommentaryPlayer[] =>
  o.players.map((p) => ({ ...p, styles: "streetwear 70%", standoutItem: `item ${p.slot}`, cohesion: 70, uniqueness: 60, fitValue: 200, verdict: "v", modifiers: ["Big jacket (major)"] }));

describe("battle commentary", () => {
  it("builds one head-to-head prompt with both breakdowns and the decider", () => {
    const o = computeOutcome("duel", [entrant(0, 30_000, 30), entrant(1, 20_000, 80)]);
    const prompt = duelPrompt(o, commentaryPlayers(o));
    expect(prompt).toContain("Player 1");
    expect(prompt).toContain("Player 2");
    expect(prompt).toContain("POSE decided it");
    expect(prompt).toMatch(/Under 40 words/);
  });

  it("mock commentary calls out the pose when it decided the battle", () => {
    const o = computeOutcome("duel", [entrant(0, 30_000, 30), entrant(1, 20_000, 80)]);
    const text = mockDuelCommentary(o, commentaryPlayers(o));
    expect(text).toMatch(/that pose sealed it/);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(45);
  });

  it("squad commentary has one line per player and parses back", () => {
    const o = computeOutcome("squad", [entrant(0, 10_000, 70), entrant(1, 5_000, 20), entrant(2, -5_000, 10)]);
    const players = commentaryPlayers(o);
    expect(squadPrompt(o, players)).toContain('"P1:"');
    const parsed = parseSquadCommentary(mockSquadCommentary(o, players));
    expect(Object.keys(parsed.lines)).toEqual(["0", "1", "2"]);
    expect(parsed.opener).toMatch(/Certified/);
    expect(parseSquadCommentary("Vibe line.\nP2: nice\nPlayer 3 - wow").lines).toEqual({ 1: "nice", 2: "wow" });
    expect(cleanCommentary('  "**Big** win"  ')).toBe("Big win");
  });
});

describe("share mechanics", () => {
  it("writes a caption and a beat-this line", () => {
    expect(beatThisLine(847_203)).toBe("THINK YOU CAN BEAT 847,203?");
    expect(shareCaption({ kind: "scan", target: 847_203, seed: "x" })).toContain("847,203");
    expect(shareCaption({ kind: "battle", target: 100, gap: 50, seed: "x" })).toMatch(/50/);
    expect(shareCaption({ kind: "battle", target: 100, gap: 0, seed: "x" })).toMatch(/tie/);
    expect(shareCaption({ kind: "squad", target: 999, vibe: "chaotic streetwear energy", seed: "y" })).toMatch(/999/);
  });
});

describe("lobby", () => {
  const slot = (n: number, id = `c${n}`): LobbySlot => ({ slot: n, captureId: id, image: { dataUrl: "", width: 1, height: 1, hash: id, placeholder: true }, pose: null, status: "scoring", scan: null, poseResult: null });

  it("fills slots in order and knows when it can start", () => {
    let duel = newLobby("duel");
    expect(duel.capacity).toBe(2);
    duel = withCaptured(duel, [slot(0)]);
    expect(duel.next).toBe(1);
    expect(canStart(duel)).toBe(false);
    duel = withCaptured(duel, [slot(1)]);
    expect(isFull(duel)).toBe(true);
    expect(canStart(duel)).toBe(true);
    expect(allScored(duel)).toBe(false);
    const scan = { id: "s" } as ScanResult;
    duel = withScored(withScored(duel, "c0", scan, pose(50)), "c1", scan, pose(60));
    expect(allScored(duel)).toBe(true);

    let squad = newLobby("squad");
    expect(squad.capacity).toBe(5);
    squad = withCaptured(squad, [slot(0), slot(1)]);
    expect(canStart(squad)).toBe(true);
    expect(isFull(squad)).toBe(false);
  });

  it("a failed score frees that slot so the player steps up again", () => {
    let lobby = withCaptured(newLobby("squad"), [slot(0), slot(1), slot(2)]);
    lobby = withFailed(lobby, "c1", "AURA SENSORS OVERHEATED.");
    expect(lobby.slots.map((s) => s.slot)).toEqual([0, 2]);
    expect(lobby.next).toBe(1);
    expect(lobby.error).toBe("PLAYER 2: AURA SENSORS OVERHEATED.");
    expect(nextOpenSlot(lobby.slots, 5)).toBe(1);
  });
});

describe("detected outfit -> mannequin", () => {
  it("maps items to garment types and colors", () => {
    const o = outfitFromAnalysis(FIXTURE_RACING_JACKET, "x");
    expect(o.costume).toBe("none");
    expect(o.outerwear.type).not.toBe("none");
    expect(outfitFromAnalysis(FIXTURE_RACING_JACKET, "x")).toEqual(o);
    expect(colorHex("light wash blue denim")).toBe("#8cc4e8");
    expect(colorHex("black")).toBe("#1d1d1f");
    expect(colorHex("chartreuse-ish")).toBeNull();
    const om = outfitFromAnalysis(FIXTURE_OLD_MONEY, "y");
    expect(om.bottom.type).not.toBe("none");
  });

  it("dresses the mannequin in a detected dress (no jeans under it)", () => {
    const item = FIXTURE_RACING_JACKET.items[0];
    const withItems = (...items: { name: string; color: string; category: typeof item.category }[]) => ({
      ...FIXTURE_RACING_JACKET,
      items: items.map((i) => ({ ...item, ...i })),
    });
    // The real scan from testing: red dress, white tights, pink ballet shoes.
    const ballet = outfitFromAnalysis(withItems({ name: "red dress", color: "red", category: "top" }, { name: "white tights", color: "white", category: "bottom" }, { name: "pink ballet shoes", color: "pink", category: "shoes" }), "d");
    expect(ballet.top.type).toBe("dress");
    expect(ballet.top.primary).toBe(colorHex("red"));
    expect(ballet.bottom.type).toBe("none");
    // Filed under bottom, floor length: a gown.
    expect(outfitFromAnalysis(withItems({ name: "black maxi dress", color: "black", category: "bottom" }), "g").top.type).toBe("gown");
    // Not dresses.
    const shirt = outfitFromAnalysis(withItems({ name: "white dress shirt", color: "white", category: "top" }, { name: "navy dress pants", color: "navy", category: "bottom" }), "s");
    expect(shirt.top.type).toBe("dress_shirt");
    expect(shirt.bottom.type).toBe("slacks");
  });

  it("keeps a neutral pose score when nothing was detected", () => {
    expect(NO_POSE_SCORE).toBe(POSE_NEUTRAL);
  });
});
