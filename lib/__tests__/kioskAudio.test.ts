import { describe, expect, it } from "vitest";
import { DEFAULT_LOOP, formatLoopTime, parseLoop } from "@/lib/kiosk/musicLoop";
import { reactionFor } from "@/lib/kiosk/reactionTiers";

describe("crowd reaction tiers", () => {
  it("matches the announcer's bands", () => {
    expect(reactionFor(900_000)).toBe("woo");
    expect(reactionFor(500_000)).toBe("woo");
    expect(reactionFor(200_000)).toBe("cheer");
    expect(reactionFor(149_999)).toBe("crickets");
    expect(reactionFor(0)).toBe("crickets");
    expect(reactionFor(-149_999)).toBe("crickets");
    expect(reactionFor(-150_000)).toBe("aww");
    expect(reactionFor(-499_999)).toBe("aww");
    expect(reactionFor(-500_000)).toBe("flop");
    expect(reactionFor(-1_000_000)).toBe("flop");
  });
});

describe("music loop points", () => {
  it("accepts a sane loop and rounds to the millisecond", () => {
    expect(parseLoop({ start: 4.12345, end: 81.9999 })).toEqual({ start: 4.123, end: 82 });
    expect(parseLoop(DEFAULT_LOOP)).toEqual(DEFAULT_LOOP);
  });

  it("rejects backwards, too short, negative or junk loops", () => {
    expect(parseLoop({ start: 50, end: 40 })).toBeNull();
    expect(parseLoop({ start: 10, end: 10.5 })).toBeNull();
    expect(parseLoop({ start: -1, end: 30 })).toBeNull();
    expect(parseLoop({ start: "0", end: 30 })).toBeNull();
    expect(parseLoop(null)).toBeNull();
  });

  it("caps the end at the track length", () => {
    expect(parseLoop({ start: 0, end: 95 }, 92.57)).toBeNull();
    expect(parseLoop({ start: 0, end: 92.57 }, 92.57)).toEqual({ start: 0, end: 92.57 });
  });

  it("formats m:ss.s", () => {
    expect(formatLoopTime(82)).toBe("1:22.0");
    expect(formatLoopTime(5.25)).toBe("0:05.3");
  });
});
