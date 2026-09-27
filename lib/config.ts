/**
 * Single source of truth for model + quota settings. Server-only values read
 * process.env; everything has a safe default so MOCK MODE works with no .env.
 */

/**
 * OpenAI vision model for outfit scoring and roasts (structured outputs).
 * Override with OPENAI_MODEL.
 */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export const OPENAI_MODEL: string =
  process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;

/**
 * Gemini, the second judge (parallel to GPT). Override with GEMINI_MODEL.
 * Only used when GEMINI_API_KEY is set.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const GEMINI_MODEL: string = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
/** The second judge never holds up a scan longer than this. */
export const GEMINI_TIMEOUT_MS = 10_000;

/**
 * Claude, the third judge (parallel to GPT and Gemini). Override with
 * CLAUDE_MODEL. Only used when ANTHROPIC_API_KEY is set.
 */
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5";
export const CLAUDE_MODEL: string = process.env.CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
/** The third judge never holds up a scan longer than this (no retries). */
export const CLAUDE_TIMEOUT_MS = 12_000;

/**
 * ElevenLabs voice for verdicts and roasts (browser voice otherwise).
 * Default: "Liam" from ElevenLabs' stock library; override with ELEVENLABS_VOICE_ID.
 */
export const DEFAULT_ELEVENLABS_VOICE_ID = "TX3LPaxmHKxFdv7VOQHJ";
export const ELEVENLABS_VOICE_ID: string = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVENLABS_VOICE_ID;
/** Low-latency model: a spoken line comes back in well under a second. */
export const ELEVENLABS_MODEL = "eleven_flash_v2_5";
/** The kiosk waits this long for a clip before falling back to the browser voice. */
export const VOICE_CLIENT_TIMEOUT_MS = 3_000;

/**
 * Image detail sent to OpenAI. "high" tiles the 1024px capture (better item
 * boxes and logos, ~25k image tokens on gpt-4o-mini); "low" is ~2.8k tokens.
 */
export const OPENAI_IMAGE_DETAIL: "low" | "high" | "auto" = (() => {
  const v = process.env.OPENAI_IMAGE_DETAIL?.trim().toLowerCase();
  return v === "low" || v === "auto" ? v : "high";
})();

/** Rough list prices used for the debug overlay's spend estimate (USD per 1M tokens, gpt-4o-mini). */
export const OPENAI_INPUT_USD_PER_M: number = Number.parseFloat(process.env.OPENAI_INPUT_USD_PER_M ?? "") || 0.15;
export const OPENAI_OUTPUT_USD_PER_M: number = Number.parseFloat(process.env.OPENAI_OUTPUT_USD_PER_M ?? "") || 0.6;

/**
 * Local garment segmentation sidecar (ml-service/, segformer on CUDA): see
 * classifierConfig. ML_SERVICE_URL=off skips it in local mode; analysis also
 * falls back to image-only scoring when the sidecar is unreachable.
 */
export const ML_SERVICE_TIMEOUT_MS = 4000;

export type ClassifierMode = "local" | "remote" | "skip";

/**
 * Where the garment classifier (the segmenter sidecar) runs, read per call so
 * tests and env reloads apply. CLASSIFIER_MODE=local (default): ML_SERVICE_URL
 * or 127.0.0.1:8001 (the kiosk laptop's GPU). remote: CLASSIFIER_URL (a
 * tunnel to the laptop). skip: never called (the public server has no GPU).
 * A down or slow classifier never fails a scan: it is skipped and logged.
 */
export function classifierConfig(env: Record<string, string | undefined> = process.env): { mode: ClassifierMode; url: string | null; timeoutMs: number } {
  const raw = env.CLASSIFIER_MODE?.trim().toLowerCase();
  const mode: ClassifierMode = raw === "remote" || raw === "skip" ? raw : "local";
  const timeout = Number.parseInt(env.CLASSIFIER_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : ML_SERVICE_TIMEOUT_MS;
  if (mode === "skip") return { mode, url: null, timeoutMs };
  if (mode === "remote") {
    const url = env.CLASSIFIER_URL?.trim();
    return { mode, url: url ? url.replace(/\/+$/, "") : null, timeoutMs };
  }
  const v = env.ML_SERVICE_URL?.trim();
  return { mode, url: v?.toLowerCase() === "off" ? null : (v || "http://127.0.0.1:8001").replace(/\/+$/, ""), timeoutMs };
}

/** Phone scans (POST /api/scan/quick): uploads, rate limits and their share of the daily cap. */
export function mobileScanConfig(env: Record<string, string | undefined> = process.env) {
  const int = (key: string, fallback: number) => {
    const n = Number.parseInt(env[key] ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    maxUploadBytes: int("SCAN_MAX_UPLOAD_BYTES", 5 * 1024 * 1024),
    /** Per phone (device id). */
    perDevice: int("SCAN_RATE_LIMIT", 5),
    /** Per IP, looser: the whole venue shares one wifi IP. */
    perIp: int("SCAN_RATE_LIMIT_IP", 30),
    windowMs: int("SCAN_RATE_WINDOW_MIN", 10) * 60_000,
    /** Phone scans stop here so the mirror always keeps the rest of DAILY_SCAN_CAP. */
    dailyCap: int("MOBILE_DAILY_SCAN_CAP", 400),
    storeRawPhotos: env.STORE_RAW_PHOTOS?.trim().toLowerCase() === "true",
  };
}

/** "Today" for caps and ranks is measured in this timezone. */
export const KIOSK_TIMEZONE: string = process.env.KIOSK_TIMEZONE?.trim() || "America/New_York";

/** Real analysis calls allowed per day. Override with DAILY_SCAN_CAP. */
export const DEFAULT_DAILY_SCAN_CAP = 600;

export const DAILY_SCAN_CAP: number = (() => {
  const raw = Number.parseInt(process.env.DAILY_SCAN_CAP ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_SCAN_CAP;
})();

/**
 * Capture settings: long side max, JPEG quality (also strips EXIF). 1536 keeps
 * a full-body portrait frame at ~864 px wide, so small pieces (a tie, a collar,
 * shoes) are real pixels for the judges; OpenAI bills "high" detail by 512 px
 * tiles after scaling the short side to 768, so this costs no more tokens
 * than 1024 did.
 */
export const CAPTURE_MAX_LONG_SIDE = 1536;
export const CAPTURE_JPEG_QUALITY = 0.85;

/** Share card dimensions. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export const APP_VERSION = "2.0.0";
export const EVENT_NAME = "HACKGT 13";
