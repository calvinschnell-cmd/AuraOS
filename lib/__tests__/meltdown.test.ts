import { describe, expect, it } from "vitest";
import { WAVE_HELLOS, helloTier } from "@/lib/copy";
import { MeltdownTracker } from "@/lib/kiosk/meltdown";
import { battleCropBoxes } from "@/lib/kiosk/battle";
import { PLAYER_NAME_MAX, checkPlayerName, cleanNickname } from "@/lib/profanity";

describe("wave meltdown", () => {
  it("gets less enthusiastic with every wave before a scan, then sulks", () => {
    const m = new MeltdownTracker();
    const outcomes = [0, 20_000, 60_000, 61_000, 62_000, 63_000].map((t) => m.onWave(t));
    // Counted, not timed: even slow waves wear it down.
    expect(outcomes.map((o) => o.count)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(outcomes.map((o) => o.signal)).toEqual([null, null, null, "tired", "annoyed", "sulk"]);
    expect(m.shouldResume(64_000)).toBe(false);
    expect(m.shouldResume(66_000)).toBe(true);
    m.resumed();
    // Still salty: the next wave sulks again straight away.
    expect(m.onWave(70_000)).toEqual({ count: 7, signal: "sulk" });
  });

  it("forgives everything after a scan (reset)", () => {
    const m = new MeltdownTracker();
    for (let t = 0; t < 5; t++) m.onWave(t * 1000);
    m.reset();
    expect(m.onWave(10_000)).toEqual({ count: 1, signal: null });
  });

  it("picks a hello tier per wave, the greeting first and the last tier on repeat", () => {
    expect(helloTier(1)).toBeNull();
    expect(helloTier(2)).toBe(WAVE_HELLOS[0]);
    expect(helloTier(4)).toBe(WAVE_HELLOS[2]);
    expect(helloTier(40)).toBe(WAVE_HELLOS[WAVE_HELLOS.length - 1]);
    // Enthusiasm only goes down: exclamation marks dry up after the first tier.
    expect(WAVE_HELLOS[0].some((l) => l.includes("!"))).toBe(true);
    expect(WAVE_HELLOS.slice(2).flat().some((l) => /!/.test(l))).toBe(false);
  });
});

describe("battle crops", () => {
  it("uses the two people's boxes, mirrored to screen space, left first", () => {
    const [a, b] = battleCropBoxes(
      [
        { xmin: 0.6, xmax: 0.9, ymin: 0.1, ymax: 0.9 },
        { xmin: 0.1, xmax: 0.4, ymin: 0.1, ymax: 0.9 },
      ],
      true,
    );
    // mirrored: the 0.6..0.9 person lands on the left (0.1..0.4)
    expect(a.xmin).toBeCloseTo(0.02, 2);
    expect(b.xmax).toBeCloseTo(0.98, 2);
    expect(a.xmax).toBeLessThan(b.xmin + 0.2);
  });

  it("falls back to halves with fewer than two people", () => {
    const [a, b] = battleCropBoxes([{ xmin: 0.2, xmax: 0.5, ymin: 0, ymax: 1 }], false);
    expect(a).toEqual({ xmin: 0, ymin: 0, xmax: 0.5, ymax: 1 });
    expect(b).toEqual({ xmin: 0.5, ymin: 0, xmax: 1, ymax: 1 });
  });
});

describe("nickname filter", () => {
  it("validates typed leaderboard names", () => {
    expect(checkPlayerName("  Calvin   S ")).toEqual({ ok: true, name: "Calvin S" });
    expect(checkPlayerName("José_2.0")).toEqual({ ok: true, name: "José_2.0" });
    expect(checkPlayerName("   ")).toEqual({ ok: true, name: null });
    expect(checkPlayerName("x".repeat(PLAYER_NAME_MAX + 1)).ok).toBe(false);
    expect(checkPlayerName("<script>").ok).toBe(false);
    expect(checkPlayerName("ShitLord")).toEqual({ ok: false, error: "THAT NAME IS NOT LEADERBOARD SAFE. TRY ANOTHER." });
  });

  it("strips profanity and caps length", () => {
    expect(cleanNickname("Vintage Racing Jacket Guy")).toBe("Vintage Racing Jacket Guy");
    expect(cleanNickname("Shit Sneaker King")).toBe("Sneaker King");
    expect(cleanNickname("A Very Extremely Long Nickname That Goes On Forever").length).toBeLessThanOrEqual(30);
    expect(cleanNickname("****")).toBe("Mystery Fit");
  });
});
