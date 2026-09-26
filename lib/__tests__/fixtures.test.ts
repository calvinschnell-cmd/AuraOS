import { describe, expect, it } from "vitest";
import { analysisSchema } from "@/lib/schema";
import { BATTLE_FIXTURE_PAIR, FIXTURES, pickFixture } from "@/lib/fixtures";

describe("mock fixtures", () => {
  it("every fixture matches the analysis schema", () => {
    for (const fixture of FIXTURES) {
      const parsed = analysisSchema.safeParse(fixture);
      expect(
        parsed.success,
        parsed.success ? "" : JSON.stringify(parsed.error.issues),
      ).toBe(true);
    }
  });

  it("style mixes sum to 100", () => {
    for (const fixture of FIXTURES) {
      const total = fixture.style_mix.reduce((s, m) => s + m.percent, 0);
      expect(total).toBe(100);
    }
  });

  it("includes a bummy-dominant fixture (negative aura candidate)", () => {
    const bummy = FIXTURES.find((f) =>
      f.style_mix.some((m) => m.style === "bummy" && m.percent >= 50),
    );
    expect(bummy).toBeDefined();
  });

  it("battle pair is two distinct fixtures", () => {
    const [a, b] = BATTLE_FIXTURE_PAIR;
    expect(a.nickname).not.toBe(b.nickname);
  });

  it("pickFixture is deterministic per hash", () => {
    expect(pickFixture("abc")).toBe(pickFixture("abc"));
  });
});
