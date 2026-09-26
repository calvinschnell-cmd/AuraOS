import OpenAI, { APIError } from "openai";
import { OPENAI_IMAGE_DETAIL, OPENAI_MODEL } from "@/lib/config";
import { MOCK_ROASTS } from "@/lib/copy/roasts";
import { VERDICT_EXAMPLES } from "@/lib/copy/verdicts";
import { pickFixture } from "@/lib/fixtures";
import { USER_PROMPT, buildSystemPrompt } from "@/lib/prompts";
import { ITEM_CATEGORIES, MODIFIER_TIERS, SENTIMENTS, STYLES, analysisSchema, type Analysis } from "@/lib/schema";
import { applySegmentation, describeGarments, segmentGarments, type Segmentation } from "@/lib/server/segmenter";

/**
 * Server-side outfit analysis behind a typed provider interface, so the model
 * vendor can be swapped. Mock mode (no OPENAI_API_KEY) serves fixtures.
 */

export interface TokenUsage {
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
}

export interface ImageInput {
  data: Buffer;
  mimeType: string;
  /** SHA-256 hex; used for deterministic fixture picks in mock mode. */
  hash: string;
}

export interface AnalysisResult {
  analysis: Analysis;
  usage: TokenUsage;
  provider: "openai" | "mock";
  attempts: number;
}

export interface RoastResult {
  text: string;
  usage: TokenUsage;
  provider: "openai" | "mock";
}

/** Stage-1 output shared by both judges (so the photo is segmented once). Undefined: segment here. */
export interface AnalysisHints {
  seg?: Segmentation | null;
}

export interface AnalysisProvider {
  readonly name: "openai" | "mock";
  /** The model id behind the GPT judge ("mock" in mock mode). */
  readonly model: string;
  analyze(image: ImageInput, hints?: AnalysisHints): Promise<AnalysisResult>;
  /** One extra playful roast line about the outfit (thumbs down). */
  roast(image: ImageInput, prompt: string): Promise<RoastResult>;
  /** Cheap request that opens the connection (kiosk boot, idle gaps) so the first battle skips the cold start. */
  warmup(): Promise<void>;
  /**
   * Text-only streaming completion (battle commentary). Absent in mock mode:
   * callers stream their own mock text. `onUsage` fires once at the end.
   */
  streamText?(system: string, prompt: string, maxTokens: number, onUsage?: (usage: TokenUsage) => void): AsyncIterable<string>;
}

export type AnalysisErrorCode = "overheated" | "invalid" | "blocked";

export class AnalysisError extends Error {
  constructor(
    public readonly code: AnalysisErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

export const OVERHEATED_MESSAGE = "AURA SENSORS OVERHEATED. TRY AGAIN IN A MINUTE.";
export const INVALID_MESSAGE = "AURA SENSORS RETURNED STATIC. TRY AGAIN.";

const ZERO_USAGE: TokenUsage = { promptTokens: 0, outputTokens: 0, thoughtTokens: 0 };

// ---------------------------------------------------------------- mock

export class MockProvider implements AnalysisProvider {
  readonly name = "mock" as const;
  readonly model = "mock";
  constructor(private readonly delayMs = 900) {}
  async analyze(image: ImageInput): Promise<AnalysisResult> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return { analysis: pickFixture(image.hash), usage: ZERO_USAGE, provider: "mock", attempts: 1 };
  }
  async roast(image: ImageInput): Promise<RoastResult> {
    await new Promise((r) => setTimeout(r, this.delayMs / 2));
    let h = 0;
    for (let i = 0; i < image.hash.length; i++) h = (h * 31 + image.hash.charCodeAt(i)) >>> 0;
    return { text: MOCK_ROASTS[h % MOCK_ROASTS.length], usage: ZERO_USAGE, provider: "mock" };
  }
  async warmup(): Promise<void> {}
}

// ---------------------------------------------------------------- openai schema

type JsonSchema = Record<string, unknown>;

/**
 * Boxes are objects here because strict structured outputs has no fixed-length
 * tuple; normalizeAnalysis converts them back to [ymin, xmin, ymax, xmax].
 */
const box = (description: string): JsonSchema => ({
  type: "object",
  description,
  additionalProperties: false,
  required: ["ymin", "xmin", "ymax", "xmax"],
  properties: { ymin: { type: "number" }, xmin: { type: "number" }, ymax: { type: "number" }, xmax: { type: "number" } },
});

const BOX_DESC = "normalized 0-1000 of the image";

/**
 * Strict structured-output schema matching lib/schema.ts. Strict mode needs
 * every key required and additionalProperties false. Array lengths are
 * enforced while decoding (minItems/maxItems, verified against gpt-4o-mini);
 * number ranges are clamped by normalizeAnalysis, then zod validates.
 */
export const OPENAI_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["is_outfit_photo", "specialness", "sentiment", "style_mix", "items", "held_objects", "face_box", "cohesion", "modifiers", "nickname", "verdict"],
  properties: {
    is_outfit_photo: { type: "boolean" },
    specialness: { type: "number", description: "0-100 percentile vs people at a hackathon" },
    sentiment: { type: "string", enum: [...SENTIMENTS] },
    style_mix: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      description: "1 to 3 entries, percents summing to 100",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["style", "percent"],
        properties: { style: { type: "string", enum: [...STYLES] }, percent: { type: "number" } },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "color", "estimated_price_usd", "uniqueness", "is_statement_piece", "box_2d", "segment"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: [...ITEM_CATEGORIES] },
          color: { type: "string" },
          estimated_price_usd: { type: "number" },
          uniqueness: { type: "number", description: "0-100" },
          is_statement_piece: { type: "boolean" },
          box_2d: box(BOX_DESC),
          segment: { type: ["string", "null"], description: "Detected garment region label this item belongs to, or null" },
        },
      },
    },
    held_objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "box_2d"],
        properties: { name: { type: "string" }, box_2d: box(BOX_DESC) },
      },
    },
    face_box: { anyOf: [box(`face, ${BOX_DESC}`), { type: "null" }] },
    cohesion: {
      type: "object",
      additionalProperties: false,
      required: ["color_harmony", "silhouette", "style_consistency"],
      properties: {
        color_harmony: { type: "number", description: "0-100" },
        silhouette: { type: "number", description: "0-100" },
        style_consistency: { type: "number", description: "0-100" },
      },
    },
    modifiers: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      description: "3 to 6 entries",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emoji", "label", "tier"],
        properties: {
          emoji: { type: "string" },
          label: { type: "string" },
          tier: { type: "string", enum: [...MODIFIER_TIERS] },
        },
      },
    },
    nickname: { type: "string", description: "at most 30 characters" },
    verdict: { type: "string" },
  },
};

/** Clamp / repair small schema drifts before strict validation. */
export function normalizeAnalysis(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  const clampBox = (b: unknown) => {
    // OpenAI returns { ymin, xmin, ymax, xmax } objects (see OPENAI_RESPONSE_SCHEMA).
    if (b && typeof b === "object" && !Array.isArray(b) && "ymin" in b) {
      const o = b as Record<string, unknown>;
      b = [o.ymin, o.xmin, o.ymax, o.xmax];
    }
    return Array.isArray(b) && b.length === 4 ? b.map((v) => Math.max(0, Math.min(1000, Number(v) || 0))) : b;
  };
  const items = Array.isArray(r.items)
    ? r.items.map((i) => {
        const item = i as Record<string, unknown>;
        return {
          ...item,
          uniqueness: Math.max(0, Math.min(100, Number(item.uniqueness) || 0)),
          estimated_price_usd: Math.max(0, Number(item.estimated_price_usd) || 0),
          box_2d: clampBox(item.box_2d),
        };
      })
    : r.items;
  const held = Array.isArray(r.held_objects) ? r.held_objects.map((h) => ({ ...(h as object), box_2d: clampBox((h as Record<string, unknown>).box_2d) })) : [];
  let styleMix = Array.isArray(r.style_mix) ? (r.style_mix as { style: string; percent: number }[]).slice(0, 3) : r.style_mix;
  if (Array.isArray(styleMix) && styleMix.length > 0) {
    const total = styleMix.reduce((s, m) => s + (Number(m.percent) || 0), 0);
    if (total > 0) styleMix = styleMix.map((m) => ({ ...m, percent: Math.round(((Number(m.percent) || 0) / total) * 100) }));
  }
  const cohesion = r.cohesion as Record<string, unknown> | undefined;
  const clamp100 = (v: unknown) => Math.max(0, Math.min(100, Number(v) || 0));
  return {
    ...r,
    specialness: Math.max(0, Math.min(100, Number(r.specialness) || 0)),
    items,
    held_objects: held,
    style_mix: styleMix,
    face_box: r.face_box === undefined ? null : clampBox(r.face_box),
    cohesion: cohesion
      ? { color_harmony: clamp100(cohesion.color_harmony), silhouette: clamp100(cohesion.silhouette), style_consistency: clamp100(cohesion.style_consistency) }
      : cohesion,
    nickname: typeof r.nickname === "string" ? r.nickname.slice(0, 30) : r.nickname,
    modifiers: Array.isArray(r.modifiers) ? r.modifiers.slice(0, 6) : r.modifiers,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new AnalysisError("invalid", INVALID_MESSAGE, err);
  }
}

export function validateAnalysis(raw: unknown): Analysis {
  const parsed = analysisSchema.safeParse(normalizeAnalysis(raw));
  if (!parsed.success) throw new AnalysisError("invalid", INVALID_MESSAGE, parsed.error);
  return parsed.data;
}

export function parseAnalysis(text: string): Analysis {
  return validateAnalysis(parseJson(text));
}

/** Per-item `segment` labels from raw model output (zod strips them), in item order. */
function segmentRefs(raw: unknown): (string | null)[] {
  const items = (raw as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.map((i) => ((i as { segment?: unknown })?.segment as string) ?? null) : [];
}

// ---------------------------------------------------------------- openai

/** 429 / 5xx, or no status at all (connection error / timeout). */
function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 429 || status >= 500;
}

function usageFrom(u: OpenAI.CompletionUsage | undefined): TokenUsage {
  const thoughts = u?.completion_tokens_details?.reasoning_tokens ?? 0;
  return { promptTokens: u?.prompt_tokens ?? 0, outputTokens: (u?.completion_tokens ?? 0) - thoughts, thoughtTokens: thoughts };
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { promptTokens: a.promptTokens + b.promptTokens, outputTokens: a.outputTokens + b.outputTokens, thoughtTokens: a.thoughtTokens + b.thoughtTokens };
}

function imagePart(image: ImageInput, detail: "low" | "high" | "auto"): OpenAI.Chat.ChatCompletionContentPartImage {
  return { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data.toString("base64")}`, detail } };
}

/**
 * Stage 1: local segformer sidecar finds garment regions (optional, degrades
 * to image-only). Stage 2: OpenAI scores the photo + region hints with strict
 * structured output; item and face boxes then snap to the segmented regions.
 */
export class OpenAIProvider implements AnalysisProvider {
  readonly name = "openai" as const;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model = OPENAI_MODEL,
    private readonly backoffMs = 1500,
    private readonly segment: typeof segmentGarments = segmentGarments,
  ) {
    // Retries are handled below (one retry, like the rest of the pipeline expects).
    this.client = new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 });
  }

  async analyze(image: ImageInput, hints: AnalysisHints = {}): Promise<AnalysisResult> {
    const seg = hints.seg !== undefined ? hints.seg : await this.segment(image.data, image.mimeType);
    if (seg) console.info(`[aura] segmenter: ${seg.garments.map((g) => g.label).join(", ") || "no garments"} (${Math.round(seg.ms)}ms on ${seg.device})`);

    let lastError: unknown;
    let usage: TokenUsage = ZERO_USAGE;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: buildSystemPrompt(VERDICT_EXAMPLES, image.hash) },
            { role: "user", content: [imagePart(image, OPENAI_IMAGE_DETAIL), { type: "text", text: USER_PROMPT + describeGarments(seg) }] },
          ],
          response_format: { type: "json_schema", json_schema: { name: "aura_analysis", strict: true, schema: OPENAI_RESPONSE_SCHEMA } },
          temperature: 1.0,
          // A full analysis is ~350 tokens; the cap stops a degenerate reply fast.
          max_completion_tokens: 1500,
        });
        usage = addUsage(usage, usageFrom(completion.usage));
        const choice = completion.choices[0];
        if (!choice || choice.message.refusal || choice.finish_reason === "content_filter") {
          throw new AnalysisError("blocked", INVALID_MESSAGE);
        }
        if (choice.finish_reason === "length" || !choice.message.content) throw new AnalysisError("invalid", INVALID_MESSAGE);
        const raw = parseJson(choice.message.content);
        const analysis = applySegmentation(validateAnalysis(raw), segmentRefs(raw), seg);
        return { analysis, usage, provider: "openai", attempts: attempt };
      } catch (err) {
        lastError = err;
        const retryable =
          (err instanceof APIError && isRetryableStatus(err.status)) ||
          (err instanceof AnalysisError && err.code === "invalid");
        if (!retryable || attempt === 2) break;
        await new Promise((r) => setTimeout(r, this.backoffMs));
      }
    }
    if (lastError instanceof AnalysisError) throw lastError;
    if (lastError instanceof APIError) {
      throw new AnalysisError(isRetryableStatus(lastError.status) ? "overheated" : "invalid", OVERHEATED_MESSAGE, lastError);
    }
    throw new AnalysisError("overheated", OVERHEATED_MESSAGE, lastError);
  }

  async warmup(): Promise<void> {
    // A metadata GET: no tokens, but it opens (and keeps alive) the TLS connection.
    await this.client.models.retrieve(this.model);
  }

  async *streamText(system: string, prompt: string, maxTokens: number, onUsage?: (usage: TokenUsage) => void): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 1.0,
      // Hard cap: generation time can never exceed the budget, whatever the prompt asks.
      max_completion_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
      if (chunk.usage) onUsage?.(usageFrom(chunk.usage));
    }
  }

  async roast(image: ImageInput, prompt: string): Promise<RoastResult> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: buildSystemPrompt(VERDICT_EXAMPLES, image.hash) },
          // A one-liner does not need tiled detail; low keeps it cheap and fast.
          { role: "user", content: [imagePart(image, "low"), { type: "text", text: prompt }] },
        ],
        temperature: 1.0,
        max_completion_tokens: 120,
      });
      const message = completion.choices[0]?.message;
      const text = (message?.content ?? "").trim().replace(/^["']|["']$/g, "");
      if (!text || message?.refusal) throw new AnalysisError("blocked", INVALID_MESSAGE);
      return { text, usage: usageFrom(completion.usage), provider: "openai" };
    } catch (err) {
      if (err instanceof AnalysisError) throw err;
      throw new AnalysisError("overheated", OVERHEATED_MESSAGE, err);
    }
  }
}

// ---------------------------------------------------------------- factory

let cached: { key: string; provider: AnalysisProvider } | null = null;

/**
 * Real OpenAI (+ local segmenter) when OPENAI_API_KEY is set, otherwise
 * fixtures. Rebuilt when the key changes (next dev reloads .env.local live).
 */
export function getAnalysisProvider(): AnalysisProvider {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (cached?.key === key) return cached.provider;
  cached = { key, provider: key ? new OpenAIProvider(key) : new MockProvider() };
  return cached.provider;
}
