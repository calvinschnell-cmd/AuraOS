import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisError, MockProvider, type ImageInput } from "@/lib/analyze";
import { pickFixture } from "@/lib/fixtures";
import { MockGeminiJudge, analysisFromGemini, geminiVerdictSchema } from "@/lib/judges/gemini";
import { processScan } from "@/lib/server/processScan";

/** Full MOCK MODE: MockProvider (GPT) + MockGeminiJudge, in-memory store. */
beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  // Skip the mock provider's artificial delay.
  vi.spyOn(MockProvider.prototype, "analyze").mockImplementation(async (image: ImageInput) => ({
    analysis: pickFixture(image.hash),
    usage: { promptTokens: 0, outputTokens: 0, thoughtTokens: 0 },
    provider: "mock",
    attempts: 1,
  }));
});
afterEach(() => vi.restoreAllMocks());

let n = 0;
/** A fresh image each time (scans are cached by hash). */
const photo = () => Buffer.from(`photo-${Date.now()}-${n++}`);

describe("dual-judge pipeline", () => {
  it("scores with both judges in parallel and averages them", async () => {
    const { scan } = await processScan(photo(), "image/jpeg");
    const judges = scan.breakdown.judges;
    expect(judges.map((j) => j.judge)).toEqual(["gpt", "gemini"]);
    expect(scan.aura).toBe(Math.round((judges[0].aura + judges[1].aura) / 2));
  });

  it("keeps going with GPT alone when Gemini fails", async () => {
    vi.spyOn(MockGeminiJudge.prototype, "judge").mockRejectedValue(new Error("gemini down"));
    const { scan } = await processScan(photo(), "image/jpeg");
    expect(scan.breakdown.judges.map((j) => j.judge)).toEqual(["gpt"]);
    expect(scan.breakdown.disagree).toBe(false);
  });

  it("keeps going with Gemini alone when GPT fails", async () => {
    vi.spyOn(MockProvider.prototype, "analyze").mockRejectedValue(new AnalysisError("overheated", "gpt down"));
    const { scan } = await processScan(photo(), "image/jpeg");
    expect(scan.breakdown.judges.map((j) => j.judge)).toEqual(["gemini"]);
    expect(scan.analysis.items).toEqual([]);
    expect(scan.analysis.modifiers.length).toBeGreaterThanOrEqual(3);
  });

  it("fails only when both judges fail", async () => {
    vi.spyOn(MockProvider.prototype, "analyze").mockRejectedValue(new AnalysisError("overheated", "gpt down"));
    vi.spyOn(MockGeminiJudge.prototype, "judge").mockRejectedValue(new Error("gemini down"));
    await expect(processScan(photo(), "image/jpeg")).rejects.toBeInstanceOf(AnalysisError);
  });

  it("mock Gemini sometimes disagrees, so the payoff can be demoed offline", async () => {
    const judge = new MockGeminiJudge(pickFixture);
    const verdicts = await Promise.all(Array.from({ length: 30 }, (_, i) => judge.judge({ hash: `h${i}` })));
    verdicts.forEach((v) => expect(geminiVerdictSchema.safeParse(v).success).toBe(true));
    const flipped = verdicts.filter((v, i) => v.sentiment !== pickFixture(`h${i}`).sentiment).length;
    expect(flipped).toBeGreaterThan(3);
    expect(flipped).toBeLessThan(27);
  });

  it("builds a valid analysis from Gemini alone", () => {
    const v = { is_outfit_photo: true, specialness: 91, sentiment: "positive" as const, verdict: "Clean.", nickname: "N", style: "streetwear" as const, modifiers: [{ emoji: "🔥", label: "Tuff", tier: "major" as const }] };
    const a = analysisFromGemini(v, null);
    expect(a.modifiers).toHaveLength(3);
    expect(a.style_mix).toEqual([{ style: "streetwear", percent: 100 }]);
  });
});
