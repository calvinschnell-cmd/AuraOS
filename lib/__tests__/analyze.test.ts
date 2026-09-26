import { describe, expect, it } from "vitest";
import { AnalysisError, MockProvider, normalizeAnalysis, parseAnalysis } from "@/lib/analyze";
import { FIXTURE_OLD_MONEY } from "@/lib/fixtures";
import { buildRevealTimeline, revealState } from "@/lib/kiosk/reveal";
import type { ScanResult } from "@/lib/kiosk/types";
import { SLANG_PER_SCAN, TONE_NOTES, W_SLANG } from "@/lib/copy/voice";
import { buildSystemPrompt } from "@/lib/prompts";
import { gptJudge, scoreScan } from "@/lib/scoring";
import { dayKey, dayStart } from "@/lib/server/day";

describe("analysis provider", () => {
  it("mock provider returns a valid fixture deterministically", async () => {
    const p = new MockProvider(0);
    const a = await p.analyze({ data: Buffer.from(""), mimeType: "image/jpeg", hash: "deadbeef" });
    const b = await p.analyze({ data: Buffer.from(""), mimeType: "image/jpeg", hash: "deadbeef" });
    expect(a.analysis).toEqual(b.analysis);
    expect(a.provider).toBe("mock");
  });

  it("parses and repairs slightly off model output", () => {
    const raw = {
      ...FIXTURE_OLD_MONEY,
      style_mix: [
        { style: "old money", percent: 70 },
        { style: "preppy", percent: 50 },
      ],
      items: FIXTURE_OLD_MONEY.items.map((i) => ({ ...i, uniqueness: 140, box_2d: [-5, 0, 1200, 900] })),
      nickname: "A".repeat(40),
    };
    const parsed = parseAnalysis(JSON.stringify(raw));
    expect(parsed.style_mix.reduce((s, m) => s + m.percent, 0)).toBe(100);
    expect(parsed.items[0].uniqueness).toBe(100);
    expect(parsed.items[0].box_2d).toEqual([0, 0, 1000, 900]);
    expect(parsed.nickname.length).toBe(30);
  });

  it("rejects garbage with a friendly error", () => {
    expect(() => parseAnalysis("not json")).toThrow(AnalysisError);
    expect(() => parseAnalysis(JSON.stringify({ hello: 1 }))).toThrow(AnalysisError);
    expect(normalizeAnalysis(null)).toBeNull();
  });

  it("system prompt embeds the verdict examples", () => {
    const prompt = buildSystemPrompt(["Owns a fermentation crock"]);
    expect(prompt).toContain("- Owns a fermentation crock");
    expect(prompt).not.toContain("{{VERDICT_EXAMPLES}}");
  });

  it("system prompt carries the voice guide from lib/copy/voice.ts", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain("{{VOICE}}");
    expect(prompt).toContain("Most lines use one slang term or none");
    expect(prompt).toContain(TONE_NOTES[0]);
    expect(prompt).toMatch(/Never use: .*gyatt.*slay/);
  });

  it("rotates a seeded handful of slang per scan", () => {
    const allowed = (prompt: string, label: string) => prompt.match(new RegExp(`${label}: (.*)\\.`))?.[1].split(", ") ?? [];
    const a = buildSystemPrompt(undefined, "hash-a");
    expect(buildSystemPrompt(undefined, "hash-a")).toBe(a); // deterministic per image
    const wA = allowed(a, "if a W");
    expect(wA).toHaveLength(SLANG_PER_SCAN.w);
    wA.forEach((t) => expect(W_SLANG).toContain(t));
    // Different photos see different slang.
    const seen = new Set(["b", "c", "d", "e", "f"].flatMap((h) => allowed(buildSystemPrompt(undefined, h), "if a W")));
    expect(seen.size).toBeGreaterThan(SLANG_PER_SCAN.w);
  });
});

describe("day boundaries", () => {
  it("computes local midnight in the kiosk timezone", () => {
    const d = new Date("2026-09-22T03:30:00Z"); // 23:30 previous day in New York (EDT)
    expect(dayKey(d, "America/New_York")).toBe("2026-09-21");
    expect(dayStart(d, "America/New_York").toISOString()).toBe("2026-09-21T04:00:00.000Z");
    expect(dayKey(d, "UTC")).toBe("2026-09-22");
  });
});

describe("reveal timeline", () => {
  const breakdown = scoreScan(FIXTURE_OLD_MONEY, [gptJudge(FIXTURE_OLD_MONEY, "gpt-4o-mini")]);
  const scan: ScanResult = {
    id: "s",
    analysis: FIXTURE_OLD_MONEY,
    aura: breakdown.aura,
    breakdown,
    rank: { position: 7, total: 143 },
    capturedAt: 0,
    image: { dataUrl: "", width: 720, height: 960, hash: "h", placeholder: true },
    cached: false,
    mock: true,
  };

  it("completes in under 8 seconds in order", () => {
    const t = buildRevealTimeline(scan);
    expect(t.doneAt).toBeLessThanOrEqual(8000);
    expect(t.boxesAt.length).toBe(FIXTURE_OLD_MONEY.items.length + FIXTURE_OLD_MONEY.held_objects.length);
    expect(t.auraAt).toBeGreaterThan(t.boxesAt[t.boxesAt.length - 1]);
    expect(t.statsAt).toBeGreaterThan(t.auraAt);
    expect(t.rankAt).toBeGreaterThan(t.modifiersAt[t.modifiersAt.length - 1]);
    expect(t.verdictAt).toBeGreaterThan(t.rankAt);
  });

  it("reveals progressively", () => {
    const t = buildRevealTimeline(scan);
    expect(revealState(t, 0).boxesShown).toBe(0);
    expect(revealState(t, t.boxesAt[1]).boxesShown).toBe(2);
    expect(revealState(t, t.auraAt).auraChars).toBe(1);
    expect(revealState(t, t.verdictAt).verdict).toBe(true);
    const end = revealState(t, 8000);
    expect(end.done).toBe(true);
    expect(end.auraChars).toBe(t.auraText.length);
    expect(end.modifiersShown).toBe(breakdown.modifiers.length);
  });
});
