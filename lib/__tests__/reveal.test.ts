import { describe, expect, it } from "vitest";
import { countdownScript, revealOrder, revealedSlots, slotsAtStep, type RevealPlayer } from "@/lib/battle/reveal";
import { GUT_REACTIONS, gutReaction, gutTier } from "@/lib/copy/reactions";
import { FIXTURE_RACING_JACKET } from "@/lib/fixtures";
import { transition } from "@/lib/kiosk/machine";
import { createRng } from "@/lib/prng";
import { CLASH_HARMONY_FLOOR, CLASH_PER_POINT, SHORTS_PENALTY, fitPenalties, gptJudge, scoreScan } from "@/lib/scoring";

const player = (slot: number, place: number, total: number, modifiers: string[] = []): RevealPlayer => ({ slot, place, total, nickname: `Fit ${slot}`, modifiers });

describe("squad countdown", () => {
  const squad = [player(0, 2, 90_000), player(1, 4, -200_000), player(2, 1, 400_000), player(3, 3, 5_000)];

  it("calls places from dead last to first", () => {
    expect(revealOrder(squad).map((s) => s.place)).toEqual([4, 3, 2, 1]);
    expect(slotsAtStep(squad, 0)).toEqual([1]);
    expect(slotsAtStep(squad, 3)).toEqual([2]);
    expect([...revealedSlots(squad, 2)].sort()).toEqual([1, 3]);
    expect(revealedSlots(squad, 0).size).toBe(0);
  });

  it("calls tied players together", () => {
    const tied = [player(0, 1, 10), player(1, 2, 5), player(2, 2, 5)];
    const order = revealOrder(tied);
    expect(order).toHaveLength(2);
    expect(order[0].players.map((p) => p.slot)).toEqual([1, 2]);
    const script = countdownScript(tied, { groupAura: 10, opener: null, lines: {}, rand: createRng("tie").next });
    expect(script.steps[0].callout.toLowerCase()).toMatch(/tie|sharing/);
    expect(script.steps[0].reveal).toMatch(/Players 2 and 3/);
  });

  it("says dead last first, the champion last, and never repeats a callout", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const script = countdownScript(squad, { groupAura: 150_000, opener: "Certified group chat energy.", lines: { 1: "Dogshit fit." }, rand: createRng(seed).next });
      expect(script.steps).toHaveLength(4);
      expect(script.steps[0].callout).toMatch(/last|rear|bottom|somebody/i);
      expect(script.steps[0].reveal).toMatch(/Player 2/);
      expect(script.steps[0].reveal).toMatch(/Dogshit fit\./);
      expect(script.steps[3].callout).toMatch(/champion|carrying|number one|crown/i);
      expect(script.steps[3].reveal).toMatch(/Player 3/);
      expect(new Set(script.steps.map((s) => s.callout)).size).toBe(4);
      expect(script.intro).toMatch(/150,000/);
      expect(script.outro).toBe("Certified group chat energy.");
    }
  });

  it("falls back to a gut reaction when the commentator has no line", () => {
    const script = countdownScript(squad, { groupAura: 0, opener: null, lines: {}, rand: createRng("x").next });
    const champion = script.steps[3].reveal;
    expect(GUT_REACTIONS.legendary.some((l) => champion.includes(l))).toBe(true);
    expect(script.outro).toBeNull();
  });

  it("holds the card (thumbs up) until every place is called", () => {
    expect(transition("BATTLE_RESULT", { type: "THUMB_UP" }, { revealing: true })).toBeNull();
    expect(transition("BATTLE_RESULT", { type: "THUMB_UP" }, { revealing: false })).toBe("CLAIM");
    expect(transition("BATTLE_RESULT", { type: "REVEAL_STEP", battleId: "b", step: 1 })).toBe("BATTLE_RESULT");
  });
});

describe("gut reactions", () => {
  it("scale with the score", () => {
    expect(gutTier(500_000)).toBe("legendary");
    expect(gutTier(150_000)).toBe("great");
    expect(gutTier(3_000)).toBe("mid");
    expect(gutTier(-60_000)).toBe("low");
    expect(gutTier(-400_000)).toBe("awful");
    expect(GUT_REACTIONS.awful).toContain("Dogshit fit.");
    expect(GUT_REACTIONS.mid).toContain("Calm little fit.");
  });

  it("call out fit crimes on a bad score, never on a great one", () => {
    expect(gutReaction(-90_000, ["SHORTS TAX -80,000"], 0)).toMatch(/^Shorts/);
    expect(gutReaction(-90_000, ["CLASHING COLORWAYS -120,000"], 0)).toMatch(/colors|colorway/i);
    expect(gutReaction(400_000, ["SHORTS TAX -80,000"], 0)).not.toMatch(/Shorts/);
  });
});

describe("house-rule penalties", () => {
  const judge = gptJudge(FIXTURE_RACING_JACKET, "gpt-4o-mini");

  it("tax shorts, clashing colorways and pieces that don't go", () => {
    const clean = scoreScan(FIXTURE_RACING_JACKET, [judge]);
    expect(fitPenalties(FIXTURE_RACING_JACKET)).toEqual([]);

    const shorts = { ...FIXTURE_RACING_JACKET, items: [...FIXTURE_RACING_JACKET.items, { ...FIXTURE_RACING_JACKET.items[0], name: "baggy jorts shorts" }] };
    expect(scoreScan(shorts, [judge]).aura).toBe(clean.aura - SHORTS_PENALTY);
    expect(scoreScan(shorts, [judge]).modifiers.some((m) => m.label.startsWith("SHORTS TAX"))).toBe(true);
    // "shortsleeve" is not shorts
    expect(fitPenalties({ ...FIXTURE_RACING_JACKET, items: [{ ...FIXTURE_RACING_JACKET.items[0], name: "shortsleeve tee" }] })).toEqual([]);

    const clash = { ...FIXTURE_RACING_JACKET, cohesion: { ...FIXTURE_RACING_JACKET.cohesion, color_harmony: 15, style_consistency: 30 } };
    const penalties = fitPenalties(clash);
    expect(penalties.map((p) => p.label)).toEqual(["CLASHING COLORWAYS", "PIECES DON'T GO"]);
    expect(penalties[0].aura).toBe(-(CLASH_HARMONY_FLOOR - 15) * CLASH_PER_POINT);
    expect(scoreScan(clash, [judge]).aura).toBeLessThan(clean.aura - 100_000);
  });

  it("never apply to a no-fit photo (that is a flat -1,000,000)", () => {
    expect(fitPenalties({ ...FIXTURE_RACING_JACKET, is_outfit_photo: false, cohesion: { color_harmony: 0, silhouette: 0, style_consistency: 0 } })).toEqual([]);
  });
});
