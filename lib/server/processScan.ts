import { createHash, randomUUID } from "node:crypto";
import { AnalysisError, getAnalysisProvider, type AnalysisResult } from "@/lib/analyze";
import { DAILY_SCAN_CAP } from "@/lib/config";
import { analysisFromGemini, geminiJudgeInput, getGeminiJudge, type GeminiVerdict } from "@/lib/judges/gemini";
import type { Analysis } from "@/lib/schema";
import { adaptiveCutoff, gptJudge, scoreScan, type JudgeId, type JudgeInput } from "@/lib/scoring";
import type { ScanSource } from "@/lib/kiosk/types";
import { classifyGarments, type ClassifierStatus } from "./segmenter";
import { getScanStore, recordUsage, type Rank, type StoredScan } from "./store";

export const CAP_MESSAGE = "DAILY SCAN CAP REACHED. THE AURA DEPARTMENT IS CLOSED FOR TODAY.";
export const MOBILE_CAP_MESSAGE = "PHONE SCANS ARE DONE FOR TODAY. THE MIRROR IS STILL OPEN AT THE BOOTH.";

export class CapError extends Error {
  constructor(message = CAP_MESSAGE) {
    super(message);
    this.name = "CapError";
  }
}

export interface ProcessedScan {
  scan: StoredScan;
  rank: Rank;
  cached: boolean;
  mock: boolean;
  /** The garment classifier stage: null when it never ran (mock mode, cached scan). */
  classifier: ClassifierStatus | null;
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Analyze + score + store one image, or return the cached scan for a known
 * hash. Two judges score the photo in parallel (GPT: full analysis, Gemini:
 * independent rating); Promise.allSettled means either can fail without
 * blocking the other. Enforces the daily cap on real model calls. Throws
 * AnalysisError (both judges failed) or CapError.
 */
export interface ProcessOptions {
  /**
   * Battle mode: one fast judge (GPT) only. Nobody waits on the dual-judge
   * consensus mid-battle, and it halves concurrent calls per battle (squads).
   */
  singleJudge?: boolean;
  /** Where the scan was taken (default mirror). */
  source?: ScanSource;
  /** Phone scans: their own share of the daily cap (the mirror keeps the rest). */
  sourceCap?: number;
}

export async function processScan(data: Buffer, mimeType: string, opts: ProcessOptions = {}): Promise<ProcessedScan> {
  const store = getScanStore();
  const hash = sha256(data);
  const provider = getAnalysisProvider();

  try {
    const existing = await store.getByHash(hash);
    if (existing) {
      const rank = await store.rankToday(existing.aura);
      // Without a key every stored scan is a fixture: keep the mock banner on cache hits too.
      return { scan: existing, rank, cached: true, mock: provider.name === "mock", classifier: null };
    }
  } catch (err) {
    console.error("[aura] store lookup failed", err);
  }

  if (provider.name === "openai") {
    const today = await store.countToday().catch(() => 0);
    if (today >= DAILY_SCAN_CAP) throw new CapError();
    if (opts.source && opts.sourceCap !== undefined) {
      const fromSource = await store.countTodayBySource(opts.source).catch(() => 0);
      if (fromSource >= opts.sourceCap) throw new CapError(MOBILE_CAP_MESSAGE);
    }
  }

  const image = { data, mimeType, hash };
  // Stage 1 once, shared by both judges (mock mode never calls the sidecar).
  const classified = provider.name === "openai" ? await classifyGarments(data, mimeType) : null;
  const seg = classified?.seg ?? null;
  const gemini = opts.singleJudge ? null : getGeminiJudge();
  const [gptOutcome, geminiOutcome] = await Promise.allSettled([
    provider.analyze(image, { seg }),
    gemini ? gemini.judge(image, seg) : Promise.reject(new Error("no second judge")),
  ]);
  if (geminiOutcome.status === "rejected" && gemini) console.warn("[aura] gemini judge failed, GPT judges alone:", String(geminiOutcome.reason));

  let result: AnalysisResult | null = null;
  let analysis: Analysis;
  const judges: JudgeInput[] = [];
  if (gptOutcome.status === "fulfilled") {
    result = gptOutcome.value;
    if (result.provider === "openai") recordUsage(result.usage);
    analysis = result.analysis;
    judges.push(gptJudge(analysis, provider.model));
  } else if (geminiOutcome.status === "fulfilled") {
    console.warn("[aura] GPT judge failed, Gemini judges alone:", gptOutcome.reason);
    analysis = analysisFromGemini(geminiOutcome.value, seg);
  } else {
    throw gptOutcome.reason instanceof AnalysisError ? gptOutcome.reason : new AnalysisError("overheated", String(gptOutcome.reason), gptOutcome.reason);
  }
  const geminiVerdict: GeminiVerdict | null = geminiOutcome.status === "fulfilled" ? geminiOutcome.value : null;
  if (geminiVerdict && gemini) judges.push(geminiJudgeInput(geminiVerdict, gemini.model));

  const cutoffs: Partial<Record<JudgeId, number>> = {};
  for (const j of judges) cutoffs[j.judge] = adaptiveCutoff(await store.specialnessToday(j.judge).catch(() => []));
  const breakdown = scoreScan(analysis, judges, cutoffs);
  const scan: StoredScan = {
    id: randomUUID(),
    imageHash: hash,
    analysis,
    breakdown,
    aura: breakdown.aura,
    createdAt: new Date().toISOString(),
    source: opts.source ?? "mirror",
  };
  try {
    await store.insert(scan);
  } catch (err) {
    console.error("[aura] store insert failed", err);
  }
  const rank = await store.rankToday(scan.aura).catch(() => ({ position: 1, total: 1 }));
  return { scan, rank, cached: false, mock: provider.name === "mock", classifier: classified?.status ?? null };
}

export function errorResponse(err: unknown): { status: number; body: { error: string; code?: string } } {
  if (err instanceof CapError) return { status: 429, body: { error: err.message, code: "cap" } };
  if (err instanceof AnalysisError) return { status: err.code === "overheated" ? 503 : 502, body: { error: err.message, code: err.code } };
  return { status: 503, body: { error: "AURA SENSORS OVERHEATED. TRY AGAIN IN A MINUTE.", code: "overheated" } };
}

export async function readImage(form: FormData, field: string, maxBytes = 6 * 1024 * 1024): Promise<{ data: Buffer; mimeType: string } | null> {
  const file = form.get(field);
  if (!(file instanceof Blob) || file.size === 0 || file.size > maxBytes) return null;
  return { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type || "image/jpeg" };
}
