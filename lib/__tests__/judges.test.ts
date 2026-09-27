import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisError, MockProvider, type ImageInput } from "@/lib/analyze";
import { pickFixture } from "@/lib/fixtures";
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeJudge } from "@/lib/judges/claude";
import { MockGeminiJudge, analysisFromGemini, geminiItems, geminiVerdictSchema, mergeJudgeItems } from "@/lib/judges/gemini";
import type { Item } from "@/lib/schema";
import { processScan } from "@/lib/server/processScan";

/** Full MOCK MODE: MockProvider (GPT) + MockGeminiJudge, in-memory store. */
beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
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
    // Gemini lists what it sees too, so a Gemini-only scan still has the outfit's pieces.
    expect(scan.analysis.items.length).toBeGreaterThan(0);
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
    const v = { is_outfit_photo: true, specialness: 91, sentiment: "positive" as const, verdict: "Clean.", nickname: "N", style: "streetwear" as const, modifiers: [{ emoji: "🔥", label: "Tuff", tier: "major" as const }], items: [] };
    const a = analysisFromGemini(v, null);
    expect(a.modifiers).toHaveLength(3);
    expect(a.style_mix).toEqual([{ style: "streetwear", percent: 100 }]);
  });

  describe("both judges see the outfit", () => {
    const item = (name: string, category: Item["category"]): Item => ({ name, category, color: "x", estimated_price_usd: 40, uniqueness: 30, is_statement_piece: false, box_2d: [100, 100, 500, 500] });
    const gpt = [item("tan half-zip sweater", "top"), item("black dress pants", "bottom"), item("brown shoes", "shoes")];

    it("adds what Gemini saw and GPT missed: the shirt under the sweater and the tie", () => {
      const gemini = [item("white oxford shirt", "top"), item("burgundy tie", "accessory"), item("beige quarter-zip sweater", "top")];
      const merged = mergeJudgeItems(gpt, gemini).map((i) => i.name);
      expect(merged).toEqual(["tan half-zip sweater", "black dress pants", "brown shoes", "white oxford shirt", "burgundy tie"]);
    });

    it("never doubles pants or shoes, and matches pieces named differently", () => {
      const gemini = [item("black corduroy trousers", "bottom"), item("brown penny loafers", "shoes"), item("camel knit pullover", "top")];
      expect(mergeJudgeItems(gpt, gemini)).toHaveLength(3);
      // With no shoes from GPT, Gemini's loafers are added.
      expect(mergeJudgeItems(gpt.slice(0, 2), gemini).map((i) => i.name)).toContain("brown penny loafers");
    });

    it("drops a malformed Gemini item instead of the whole verdict", () => {
      const raw = { is_outfit_photo: true, specialness: 70, sentiment: "positive", verdict: "Crisp.", nickname: "Prep", style: "old money", modifiers: [{ emoji: "👔", label: "Tie", tier: "major" }], items: [item("burgundy tie", "accessory"), { name: "mystery", category: "cape", box_2d: [1] }] };
      const v = geminiVerdictSchema.parse(raw);
      expect(geminiItems(v).map((i) => i.name)).toEqual(["burgundy tie"]);
      // Older replies without items still parse.
      expect(geminiVerdictSchema.parse({ ...raw, items: undefined }).items).toEqual([]);
      expect(analysisFromGemini(v, null).items.map((i) => i.name)).toEqual(["burgundy tie"]);
    });
  });
  describe("Claude as the third judge", () => {
    const tie = { name: "burgundy tie", category: "accessory", color: "burgundy", estimated_price_usd: 30, uniqueness: 60, is_statement_piece: false, box_2d: [300, 450, 520, 520] };
    const verdict = { is_outfit_photo: true, specialness: 88, sentiment: "positive" as const, verdict: "Tie under a quarter-zip, respect.", nickname: "Prep With A Tie", style: "old money" as const, modifiers: [{ emoji: "👔", label: "Tie layered right", tier: "major" as const }], items: [tie] };

    it("joins GPT and Gemini, is averaged in, and adds the pieces it saw", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      vi.spyOn(ClaudeJudge.prototype, "judge").mockResolvedValue(verdict);
      const { scan } = await processScan(photo(), "image/jpeg");
      const judges = scan.breakdown.judges;
      expect(judges.map((j) => j.judge)).toEqual(["gpt", "gemini", "claude"]);
      expect(scan.aura).toBe(Math.round(judges.reduce((s, j) => s + j.aura, 0) / 3));
      expect(scan.analysis.items.map((i) => i.name)).toContain("burgundy tie");
    });

    it("is left out when it fails: only the judges that answered are scored and shown", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      vi.spyOn(ClaudeJudge.prototype, "judge").mockRejectedValue(new Error("timeout"));
      const { scan } = await processScan(photo(), "image/jpeg");
      expect(scan.breakdown.judges.map((j) => j.judge)).toEqual(["gpt", "gemini"]);
    });

    it("is off without a key", async () => {
      const spy = vi.spyOn(ClaudeJudge.prototype, "judge");
      const { scan } = await processScan(photo(), "image/jpeg");
      expect(spy).not.toHaveBeenCalled();
      expect(scan.breakdown.judges.map((j) => j.judge)).not.toContain("claude");
    });

    it("parses Claude's structured reply, clamps the rating and rejects a refusal", async () => {
      const messages = Object.getPrototypeOf(new Anthropic({ apiKey: "x" }).beta.messages) as { parse: (...args: unknown[]) => Promise<unknown> };
      const image = { data: Buffer.from("img"), mimeType: "image/jpeg", hash: "h-claude" };
      vi.spyOn(messages, "parse").mockResolvedValue({ stop_reason: "end_turn", stop_details: null, parsed_output: { ...verdict, specialness: 130 }, usage: { input_tokens: 10, output_tokens: 20 } });
      const v = await new ClaudeJudge("test-key").judge(image, null);
      expect(v.specialness).toBe(100);
      expect(geminiItems(v).map((i) => i.name)).toEqual(["burgundy tie"]);
      vi.spyOn(messages, "parse").mockResolvedValue({ stop_reason: "refusal", stop_details: { category: null }, parsed_output: null, usage: { input_tokens: 10, output_tokens: 0 } });
      await expect(new ClaudeJudge("test-key").judge(image, null)).rejects.toThrow(/declined/);
    });
  });
});
