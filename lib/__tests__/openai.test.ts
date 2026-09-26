import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisError, OPENAI_RESPONSE_SCHEMA, OpenAIProvider, normalizeAnalysis } from "@/lib/analyze";
import { FIXTURE_OLD_MONEY } from "@/lib/fixtures";
import { analysisSchema, type Box2D } from "@/lib/schema";
import { applySegmentation, describeGarments, type Segmentation } from "@/lib/server/segmenter";

const toObj = ([ymin, xmin, ymax, xmax]: Box2D) => ({ ymin, xmin, ymax, xmax });

/** FIXTURE_OLD_MONEY as gpt-4o-mini would return it under OPENAI_RESPONSE_SCHEMA. */
function openAiShaped(segments: (string | null)[] = []) {
  return {
    ...FIXTURE_OLD_MONEY,
    items: FIXTURE_OLD_MONEY.items.map((i, n) => ({ ...i, box_2d: toObj(i.box_2d), segment: segments[n] ?? null })),
    held_objects: FIXTURE_OLD_MONEY.held_objects.map((h) => ({ ...h, box_2d: toObj(h.box_2d) })),
    face_box: FIXTURE_OLD_MONEY.face_box ? toObj(FIXTURE_OLD_MONEY.face_box) : null,
  };
}

const SEG: Segmentation = {
  garments: [
    { label: "Upper-clothes", box_2d: [250, 300, 550, 700], area: 0.2, colors: [{ hex: "#96191d", share: 0.9 }] },
    { label: "Pants", box_2d: [550, 350, 880, 650], area: 0.12, colors: [{ hex: "#24375f", share: 0.95 }] },
  ],
  face_box: [80, 420, 200, 580],
  device: "test",
  ms: 1,
};

function completion(content: string, finish_reason = "stop") {
  return {
    id: "c",
    object: "chat.completion",
    created: 0,
    model: "gpt-4o-mini",
    choices: [{ index: 0, finish_reason, logprobs: null, message: { role: "assistant", content, refusal: null } }],
    usage: { prompt_tokens: 3000, completion_tokens: 400, total_tokens: 3400 },
  };
}

function stubOpenAI(...bodies: unknown[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const next = bodies[Math.min(calls.length - 1, bodies.length - 1)];
    return new Response(JSON.stringify(next), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const image = { data: Buffer.from("jpeg"), mimeType: "image/jpeg", hash: "h" };

describe("OpenAI strict schema", () => {
  it("is valid for strict mode: every object closed with all keys required", () => {
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      Object.values(n).forEach(visit);
    };
    visit(OPENAI_RESPONSE_SCHEMA);
  });

  it("covers every field of the analysis schema", () => {
    expect(Object.keys(OPENAI_RESPONSE_SCHEMA.properties as object).sort()).toEqual(Object.keys(analysisSchema.shape).sort());
  });

  it("object boxes normalize back to tuples", () => {
    const parsed = analysisSchema.parse(normalizeAnalysis(openAiShaped()));
    expect(parsed).toEqual(FIXTURE_OLD_MONEY);
  });
});

describe("segmentation", () => {
  it("snaps uniquely claimed items and the face to segmented regions", () => {
    const refs = FIXTURE_OLD_MONEY.items.map((_, i) => (i === 0 ? "upper-clothes" : null));
    const out = applySegmentation(FIXTURE_OLD_MONEY, refs, SEG);
    expect(out.items[0].box_2d).toEqual(SEG.garments[0].box_2d);
    expect(out.items[1].box_2d).toEqual(FIXTURE_OLD_MONEY.items[1].box_2d);
    expect(out.face_box).toEqual(SEG.face_box);
  });

  it("keeps model boxes when two items share a region (jacket over shirt)", () => {
    const refs = FIXTURE_OLD_MONEY.items.map((_, i) => (i < 2 ? "Upper-clothes" : null));
    const out = applySegmentation(FIXTURE_OLD_MONEY, refs, SEG);
    expect(out.items[0].box_2d).toEqual(FIXTURE_OLD_MONEY.items[0].box_2d);
    expect(out.items[1].box_2d).toEqual(FIXTURE_OLD_MONEY.items[1].box_2d);
  });

  it("is a no-op without a segmentation", () => {
    expect(applySegmentation(FIXTURE_OLD_MONEY, ["Pants"], null)).toBe(FIXTURE_OLD_MONEY);
    expect(describeGarments(null)).toBe("");
    expect(describeGarments(SEG)).toContain("- Pants: box_2d [550, 350, 880, 650], 12% of image, colors: navy #24375F 95%");
    expect(describeGarments(SEG)).toContain("Measured palette: neutral base (navy) with one accent (burgundy)");
  });
});

describe("OpenAIProvider", () => {
  it("sends image + garment hints with strict json_schema and returns the pipeline's Analysis", async () => {
    const segments = FIXTURE_OLD_MONEY.items.map((_, i) => (i === 0 ? "Upper-clothes" : null));
    const calls = stubOpenAI(completion(JSON.stringify(openAiShaped(segments))));
    const provider = new OpenAIProvider("sk-test", "gpt-4o-mini", 0, async () => SEG);
    const result = await provider.analyze(image);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/chat/completions");
    const body = calls[0].body as { model: string; response_format: { type: string; json_schema: { strict: boolean } }; messages: { content: unknown }[] };
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    const user = JSON.stringify(body.messages[1].content);
    expect(user).toContain("data:image/jpeg;base64,");
    expect(user).toContain("Upper-clothes: box_2d [250, 300, 550, 700]");

    expect(result.provider).toBe("openai");
    expect(analysisSchema.safeParse(result.analysis).success).toBe(true);
    expect(result.analysis.items[0].box_2d).toEqual(SEG.garments[0].box_2d);
    expect(result.analysis.face_box).toEqual(SEG.face_box);
    expect("segment" in result.analysis.items[0]).toBe(false);
    expect(result.usage).toEqual({ promptTokens: 3000, outputTokens: 400, thoughtTokens: 0 });
  });

  it("retries once on invalid output, then succeeds", async () => {
    const calls = stubOpenAI(completion("{not json"), completion(JSON.stringify(openAiShaped())));
    const result = await new OpenAIProvider("sk-test", "gpt-4o-mini", 0, async () => null).analyze(image);
    expect(calls).toHaveLength(2);
    expect(result.attempts).toBe(2);
    expect(result.usage.promptTokens).toBe(6000);
  });

  it("maps a refusal to a blocked AnalysisError without retrying", async () => {
    const refusal = completion("");
    refusal.choices[0].message = { role: "assistant", content: "", refusal: "no" } as never;
    const calls = stubOpenAI(refusal);
    await expect(new OpenAIProvider("sk-test", "gpt-4o-mini", 0, async () => null).analyze(image)).rejects.toMatchObject({ code: "blocked" });
    expect(calls).toHaveLength(1);
  });

  it("roasts with plain text", async () => {
    stubOpenAI(completion('"Those cargo pants have more pockets than plans."'));
    const r = await new OpenAIProvider("sk-test", "gpt-4o-mini", 0, async () => null).roast(image, "roast");
    expect(r.text).toBe("Those cargo pants have more pockets than plans.");
    expect(r.provider).toBe("openai");
  });

  it("rejects garbage with AnalysisError after the retry", async () => {
    stubOpenAI(completion(JSON.stringify({ hello: 1 })));
    await expect(new OpenAIProvider("sk-test", "gpt-4o-mini", 0, async () => null).analyze(image)).rejects.toBeInstanceOf(AnalysisError);
  });
});
