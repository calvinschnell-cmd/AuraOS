import { describe, expect, it } from "vitest";
import { FIXTURE_RACING_JACKET } from "@/lib/fixtures";
import { createRng } from "@/lib/prng";
import {
  ADAPTIVE_MIN_SAMPLES,
  AURA_MAX,
  DEFAULT_CUTOFF,
  NEAR_ZERO_MAX,
  NO_FIT_AURA,
  adaptiveCutoff,
  auraFromSpecialness,
  auraMagnitude,
  formatAura,
  gptJudge,
  judgeName,
  judgesDisagree,
  scoreScan,
  type JudgeInput,
} from "@/lib/scoring";

const judge = (over: Partial<JudgeInput>): JudgeInput => ({ judge: "gpt", model: "gpt-4o-mini", specialness: 50, sentiment: "positive", verdict: "v", nickname: "n", ...over });

describe("specialness -> aura curve", () => {
  it("keeps ordinary fits near zero (the deadzone)", () => {
    expect(auraFromSpecialness(0, "positive")).toBe(0);
    for (let s = 0; s <= DEFAULT_CUTOFF; s += 5) {
      expect(Math.abs(auraFromSpecialness(s, "positive"))).toBeLessThanOrEqual(NEAR_ZERO_MAX);
      expect(Math.abs(auraFromSpecialness(s, "negative"))).toBeLessThanOrEqual(NEAR_ZERO_MAX);
    }
    expect(auraFromSpecialness(50, "positive")).toBeLessThan(10_000);
  });

  it("swings wide above the cutoff, to +-1,000,000 at 100", () => {
    expect(auraFromSpecialness(85, "positive")).toBeGreaterThan(55_000);
    expect(auraFromSpecialness(85, "positive")).toBeLessThan(80_000);
    expect(auraFromSpecialness(90, "positive")).toBeGreaterThan(200_000);
    expect(auraFromSpecialness(95, "positive")).toBeGreaterThan(500_000);
    expect(auraFromSpecialness(100, "positive")).toBe(AURA_MAX);
    expect(auraFromSpecialness(100, "negative")).toBe(-AURA_MAX);
  });

  it("is monotonic, symmetric in sentiment, and clamps out-of-range ratings", () => {
    let prev = -1;
    for (let s = 0; s <= 100; s++) {
      const a = auraFromSpecialness(s, "positive");
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(auraFromSpecialness(s, "negative")).toBe(-a);
      prev = a;
    }
    expect(auraFromSpecialness(140, "positive")).toBe(AURA_MAX);
    expect(auraFromSpecialness(-5, "negative") === 0).toBe(true);
  });

  it("a higher cutoff makes the same rating less extreme", () => {
    expect(auraFromSpecialness(88, "positive", 85)).toBeLessThan(auraFromSpecialness(88, "positive", 80));
  });
});

describe("adaptive cutoff", () => {
  it("uses the default until there are enough ratings today", () => {
    expect(adaptiveCutoff([])).toBe(DEFAULT_CUTOFF);
    expect(adaptiveCutoff(Array(ADAPTIVE_MIN_SAMPLES - 1).fill(95))).toBe(DEFAULT_CUTOFF);
  });

  it("tracks the 80th percentile, clamped to a sane range", () => {
    const ratings = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(adaptiveCutoff(ratings)).toBeCloseTo(80.2, 1);
    expect(adaptiveCutoff(Array(50).fill(99))).toBe(95);
    expect(adaptiveCutoff(Array(50).fill(10))).toBe(60);
  });

  it("keeps ~1 in 5 fits swinging wide even when a model rates everyone high", () => {
    // A generous model: ratings ~ N(72, 10), so most fits would clear a fixed cutoff of 80... or not.
    const rng = createRng("generous-model");
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
    const ratings = Array.from({ length: 400 }, () => Math.max(0, Math.min(100, Math.round(72 + 10 * gauss()))));
    const cutoff = adaptiveCutoff(ratings);
    const wide = ratings.filter((s) => Math.abs(auraFromSpecialness(s, "positive", cutoff)) > NEAR_ZERO_MAX).length / ratings.length;
    expect(wide).toBeGreaterThan(0.12);
    expect(wide).toBeLessThan(0.25);
    // Most fits stay modest.
    const modest = ratings.filter((s) => Math.abs(auraFromSpecialness(s, "positive", cutoff)) <= NEAR_ZERO_MAX).length / ratings.length;
    expect(modest).toBeGreaterThan(0.75);
  });
});

describe("no fit", () => {
  it("costs a flat -1,000,000 whatever the judges said, with a penalty modifier", () => {
    const b = scoreScan({ ...FIXTURE_RACING_JACKET, is_outfit_photo: false }, [judge({ specialness: 100 }), judge({ judge: "gemini", model: "gemini-3.8-flash", specialness: 95 })]);
    expect(NO_FIT_AURA).toBe(-1_000_000);
    expect(b.aura).toBe(NO_FIT_AURA);
    expect(b.judges.every((j) => j.aura === NO_FIT_AURA)).toBe(true);
    expect(b.disagree).toBe(false);
    expect(b.modifiers[0]).toMatchObject({ label: "NO FIT DETECTED", tier: "penalty" });
  });

  it("leaves a real outfit alone", () => {
    expect(scoreScan(FIXTURE_RACING_JACKET, [judge({ specialness: 90 })]).aura).toBeGreaterThan(0);
  });
});

describe("two judges", () => {
  it("averages the judges into the official aura", () => {
    const b = scoreScan(FIXTURE_RACING_JACKET, [judge({ specialness: 90 }), judge({ judge: "gemini", model: "gemini-3.8-flash", specialness: 70 })]);
    expect(b.judges).toHaveLength(2);
    expect(b.aura).toBe(Math.round((b.judges[0].aura + b.judges[1].aura) / 2));
    expect(b.judges.every((j) => j.cutoff === DEFAULT_CUTOFF)).toBe(true);
  });

  it("calls out a disagreement only when it is significant", () => {
    expect(judgesDisagree([{ aura: 400_000 }, { aura: 50_000 }])).toBe(true); // far apart
    expect(judgesDisagree([{ aura: 120_000 }, { aura: -80_000 }])).toBe(true); // opposite ways, meaningful gap
    // Three judges: the two furthest apart decide.
    expect(judgesDisagree([{ aura: 100_000 }, { aura: 120_000 }, { aura: 500_000 }])).toBe(true);
    expect(judgesDisagree([{ aura: 100_000 }, { aura: 120_000 }, { aura: 130_000 }])).toBe(false);
    expect(judgesDisagree([{ aura: 5_000 }, { aura: -3_000 }])).toBe(false); // both basically zero
    expect(judgesDisagree([{ aura: 600_000 }, { aura: 450_000 }])).toBe(false); // both huge, same way
    expect(judgesDisagree([{ aura: 900_000 }])).toBe(false);
  });

  it("works with a single judge (the other failed or is off)", () => {
    const b = scoreScan(FIXTURE_RACING_JACKET, [judge({ specialness: 88 })]);
    expect(b.judges).toHaveLength(1);
    expect(b.disagree).toBe(false);
    expect(b.aura).toBe(b.judges[0].aura);
    expect(() => scoreScan(FIXTURE_RACING_JACKET, [])).toThrow();
  });

  it("uses each judge's own cutoff", () => {
    const b = scoreScan(FIXTURE_RACING_JACKET, [judge({ specialness: 88 }), judge({ judge: "gemini", model: "g", specialness: 88 })], { gemini: 90 });
    expect(b.judges[0].aura).toBeGreaterThan(b.judges[1].aura);
  });

  it("reads the GPT judge from its analysis and keeps descriptive stats", () => {
    const j = gptJudge(FIXTURE_RACING_JACKET, "gpt-4o-mini");
    expect(j).toMatchObject({ judge: "gpt", specialness: FIXTURE_RACING_JACKET.specialness, sentiment: FIXTURE_RACING_JACKET.sentiment });
    const b = scoreScan(FIXTURE_RACING_JACKET, [j]);
    expect(b.fitValue).toBe(180 + 30 + 70 + 140 + 25);
    expect(b.cohesionScore).toBe(Math.round((78 + 84 + 81) / 3));
    expect(b.statementCount).toBe(1);
    expect(b.modifiers.map((m) => m.tier)).toEqual(FIXTURE_RACING_JACKET.modifiers.map((m) => m.tier));
  });

  it("names the judges without naming the models", () => {
    expect(judgeName(0)).toBe("JUDGE 1");
    expect(judgeName(1)).toBe("JUDGE 2");
  });
});

describe("formatting", () => {
  it("formats and buckets aura values", () => {
    expect(formatAura(2400)).toBe("2,400");
    expect(formatAura(-350)).toBe("-350");
    expect(formatAura(2400, true)).toBe("+2,400");
    expect(formatAura(-1_000_000)).toBe("-1,000,000");
    expect(auraMagnitude(-1)).toBe("negative");
    expect(auraMagnitude(10_000)).toBe("low");
    expect(auraMagnitude(60_000)).toBe("mid");
    expect(auraMagnitude(300_000)).toBe("high");
    expect(auraMagnitude(800_000)).toBe("max");
  });
});
