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
 * Local garment segmentation sidecar (ml-service/, segformer on CUDA).
 * Set ML_SERVICE_URL=off to skip it; analysis also falls back to image-only
 * scoring when the sidecar is unreachable.
 */
export const ML_SERVICE_URL: string | null = (() => {
  const v = process.env.ML_SERVICE_URL?.trim();
  if (v?.toLowerCase() === "off") return null;
  return (v || "http://127.0.0.1:8001").replace(/\/+$/, "");
})();
export const ML_SERVICE_TIMEOUT_MS = 4000;

/** "Today" for caps and ranks is measured in this timezone. */
export const KIOSK_TIMEZONE: string = process.env.KIOSK_TIMEZONE?.trim() || "America/New_York";

/** Real analysis calls allowed per day. Override with DAILY_SCAN_CAP. */
export const DEFAULT_DAILY_SCAN_CAP = 600;

export const DAILY_SCAN_CAP: number = (() => {
  const raw = Number.parseInt(process.env.DAILY_SCAN_CAP ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_SCAN_CAP;
})();

/** Capture settings: long side max, JPEG quality (also strips EXIF). */
export const CAPTURE_MAX_LONG_SIDE = 1024;
export const CAPTURE_JPEG_QUALITY = 0.85;

/** Share card dimensions. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export const APP_VERSION = "2.0.0";
export const EVENT_NAME = "HACKGT 13";
