import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { GEMINI_MODEL, GEMINI_TIMEOUT_MS } from "@/lib/config";
import { VERDICT_EXAMPLES } from "@/lib/copy/verdicts";
import { pickFixture } from "@/lib/fixtures";
import { hashString } from "@/lib/prng";
import { JUDGE_PROMPT, buildSystemPrompt } from "@/lib/prompts";
import { MODIFIER_TIERS, SENTIMENTS, STYLES, type Analysis } from "@/lib/schema";
import type { JudgeInput } from "@/lib/scoring";
import { describeGarments, type Segmentation } from "@/lib/server/segmenter";

/**
 * Gemini as the second, independent judge. It sees the same photo and the
 * same segmenter/palette hints as GPT and returns its own specialness,
 * sentiment and verdict; lib/scoring.ts turns both into aura. Lightweight on
 * purpose (no boxes or item list): GPT keeps the full analysis.
 */

export const geminiVerdictSchema = z.object({
  is_outfit_photo: z.boolean(),
  specialness: z.number().min(0).max(100),
  sentiment: z.enum(SENTIMENTS),
  verdict: z.string().min(1),
  nickname: z.string().min(1),
  style: z.enum(STYLES),
  modifiers: z.array(z.object({ emoji: z.string(), label: z.string().min(1), tier: z.enum(MODIFIER_TIERS) })).min(1),
});
export type GeminiVerdict = z.infer<typeof geminiVerdictSchema>;

/** Plain JSON Schema for Gemini structured output (responseJsonSchema). */
export const GEMINI_JUDGE_SCHEMA = {
  type: "object",
  required: ["is_outfit_photo", "specialness", "sentiment", "verdict", "nickname", "style", "modifiers"],
  properties: {
    is_outfit_photo: { type: "boolean" },
    specialness: { type: "number", minimum: 0, maximum: 100 },
    sentiment: { type: "string", enum: [...SENTIMENTS] },
    verdict: { type: "string" },
    nickname: { type: "string" },
    style: { type: "string", enum: [...STYLES] },
    modifiers: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        required: ["emoji", "label", "tier"],
        properties: { emoji: { type: "string" }, label: { type: "string" }, tier: { type: "string", enum: [...MODIFIER_TIERS] } },
      },
    },
  },
} as const;

export interface Judge {
  readonly model: string;
  readonly mock: boolean;
  judge(image: { data: Buffer; mimeType: string; hash: string }, seg: Segmentation | null): Promise<GeminiVerdict>;
}

export function geminiJudgeInput(v: GeminiVerdict, model: string): JudgeInput {
  return { judge: "gemini", model, specialness: v.specialness, sentiment: v.sentiment, verdict: v.verdict, nickname: v.nickname.slice(0, 30) };
}

export class GeminiJudge implements Judge {
  readonly mock = false;
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model = GEMINI_MODEL,
    private readonly timeoutMs = GEMINI_TIMEOUT_MS,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async judge(image: { data: Buffer; mimeType: string; hash: string }, seg: Segmentation | null): Promise<GeminiVerdict> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: image.mimeType, data: image.data.toString("base64") } }, { text: JUDGE_PROMPT + describeGarments(seg) }] }],
      config: {
        systemInstruction: buildSystemPrompt(VERDICT_EXAMPLES, image.hash),
        responseMimeType: "application/json",
        responseJsonSchema: GEMINI_JUDGE_SCHEMA,
        temperature: 1.0,
        maxOutputTokens: 1024,
        // Flash thinks by default; the judge does not need it and it costs latency.
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: AbortSignal.timeout(this.timeoutMs),
      },
    });
    const text = response.text;
    if (!text) throw new Error("Gemini returned no text");
    const parsed = geminiVerdictSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw parsed.error;
    const meta = response.usageMetadata;
    console.info(`[aura] gemini judge: specialness ${parsed.data.specialness} ${parsed.data.sentiment} (prompt=${meta?.promptTokenCount ?? 0} output=${meta?.candidatesTokenCount ?? 0})`);
    return parsed.data;
  }
}

/** Mock mode: a deterministic second opinion that sometimes disagrees, so the reveal can be demoed offline. */
export class MockGeminiJudge implements Judge {
  readonly mock = true;
  readonly model = "gemini-mock";
  constructor(private readonly base: (hash: string) => Analysis) {}

  async judge(image: { hash: string }): Promise<GeminiVerdict> {
    const a = this.base(image.hash);
    const h = hashString(`gemini:${image.hash}`);
    const flip = h % 3 === 0; // a third of mock scans: the judges disagree
    return {
      is_outfit_photo: a.is_outfit_photo,
      specialness: flip ? 92 : Math.max(0, Math.min(100, a.specialness + ((h % 11) - 5))),
      sentiment: flip ? (a.sentiment === "positive" ? "negative" : "positive") : a.sentiment,
      verdict: flip ? "Hard disagree. This is the fit of the day and I will die on this hill." : "Second opinion: the first judge was not wrong.",
      nickname: a.nickname,
      style: a.style_mix[0]?.style ?? "streetwear",
      modifiers: a.modifiers.slice(0, 3),
    };
  }
}

/**
 * When GPT fails but Gemini answered: a minimal analysis from Gemini alone,
 * so the scan still completes (no item boxes; face box from segmentation).
 */
export function analysisFromGemini(v: GeminiVerdict, seg: Segmentation | null): Analysis {
  const modifiers = [...v.modifiers];
  while (modifiers.length < 3) modifiers.push({ emoji: "🤖", label: "Judged by Gemini only", tier: "minor" });
  return {
    is_outfit_photo: v.is_outfit_photo,
    specialness: v.specialness,
    sentiment: v.sentiment,
    style_mix: [{ style: v.style, percent: 100 }],
    items: [],
    held_objects: [],
    face_box: seg?.face_box ?? null,
    cohesion: { color_harmony: 50, silhouette: 50, style_consistency: 50 },
    modifiers: modifiers.slice(0, 6),
    nickname: v.nickname.slice(0, 30),
    verdict: v.verdict,
  };
}

let cached: { key: string; judge: Judge | null } | null = null;

/**
 * The second judge: real Gemini when GEMINI_API_KEY is set, a mock in full
 * MOCK MODE (no OpenAI key either) so the dual-judge reveal can be demoed,
 * otherwise none (GPT judges alone). Rebuilt when the keys change.
 */
export function getGeminiJudge(): Judge | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const mockMode = !process.env.OPENAI_API_KEY?.trim();
  const key = `${apiKey}|${mockMode}`;
  if (cached?.key === key) return cached.judge;
  const judge = apiKey ? new GeminiJudge(apiKey) : mockMode ? new MockGeminiJudge(pickFixture) : null;
  cached = { key, judge };
  return judge;
}
