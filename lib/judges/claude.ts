import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CLAUDE_MODEL, CLAUDE_TIMEOUT_MS } from "@/lib/config";
import { VERDICT_EXAMPLES } from "@/lib/copy/verdicts";
import { JUDGE_PROMPT, buildSystemPrompt } from "@/lib/prompts";
import { ITEM_CATEGORIES, MODIFIER_TIERS, SENTIMENTS, STYLES } from "@/lib/schema";
import { describeGarments, type Segmentation } from "@/lib/server/segmenter";
import { geminiVerdictSchema, type GeminiVerdict, type Judge } from "./gemini";

/**
 * Claude as the third, independent judge: same photo, same prompt and
 * segmenter hints as Gemini, same verdict shape (rating, verdict, nickname,
 * style, modifiers and the items it sees). Runs in parallel with the other
 * two; a timeout, refusal or bad reply only drops this judge from the scan.
 */

/** What Claude is asked to return. Ranges are checked afterwards with the shared judge schema. */
const claudeOutputSchema = z.object({
  is_outfit_photo: z.boolean(),
  specialness: z.number(),
  sentiment: z.enum(SENTIMENTS),
  verdict: z.string(),
  nickname: z.string(),
  style: z.enum(STYLES),
  modifiers: z.array(z.object({ emoji: z.string(), label: z.string(), tier: z.enum(MODIFIER_TIERS) })),
  items: z.array(
    z.object({
      name: z.string(),
      category: z.enum(ITEM_CATEGORIES),
      color: z.string(),
      estimated_price_usd: z.number(),
      uniqueness: z.number(),
      is_statement_piece: z.boolean(),
      box_2d: z.array(z.number()),
    }),
  ),
});

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const mediaType = (mime: string): ImageMediaType => (mime === "image/png" || mime === "image/gif" || mime === "image/webp" ? mime : "image/jpeg");

export class ClaudeJudge implements Judge {
  readonly mock = false;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model = CLAUDE_MODEL,
    private readonly timeoutMs = CLAUDE_TIMEOUT_MS,
  ) {
    // No retries: a slow judge is dropped, it never doubles the wait.
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async judge(image: { data: Buffer; mimeType: string; hash: string }, seg: Segmentation | null): Promise<GeminiVerdict> {
    const response = await this.client.beta.messages.parse(
      {
        model: this.model,
        // On a policy decline Anthropic re-runs the same request on a fallback model inside this call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 8000,
        system: buildSystemPrompt(VERDICT_EXAMPLES, image.hash),
        // A quick read, not a deep think: the scan waits for the slowest judge.
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: zodOutputFormat(claudeOutputSchema) },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType(image.mimeType), data: image.data.toString("base64") } },
              { type: "text", text: JUDGE_PROMPT + describeGarments(seg) },
            ],
          },
        ],
      },
      { timeout: this.timeoutMs },
    );
    if (response.stop_reason === "refusal") throw new Error(`Claude declined to judge (${response.stop_details?.category ?? "no category"})`);
    const out = response.parsed_output;
    if (!out) throw new Error(`Claude returned no verdict (stop: ${response.stop_reason})`);
    const parsed = geminiVerdictSchema.safeParse({ ...out, specialness: Math.max(0, Math.min(100, out.specialness)) });
    if (!parsed.success) throw parsed.error;
    console.info(`[aura] claude judge: specialness ${parsed.data.specialness} ${parsed.data.sentiment} (in=${response.usage.input_tokens} out=${response.usage.output_tokens})`);
    return parsed.data;
  }
}

let cached: { key: string; judge: Judge | null } | null = null;

/** The third judge: Claude when ANTHROPIC_API_KEY is set, otherwise none (MOCK MODE included). Rebuilt when the key changes. */
export function getClaudeJudge(): Judge | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (cached?.key === apiKey) return cached.judge;
  const judge = apiKey ? new ClaudeJudge(apiKey) : null;
  cached = { key: apiKey, judge };
  return judge;
}
