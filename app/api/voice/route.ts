import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ELEVENLABS_MODEL, ELEVENLABS_VOICE_ID } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Longest line we voice (verdicts and roasts are one or two sentences). */
const MAX_CHARS = 400;
/** Crude global rate limit so a hosted kiosk cannot be used to burn ElevenLabs credits. */
const MAX_PER_MINUTE = 40;

const g = globalThis as unknown as { __auraVoice?: { cache: Map<string, Buffer>; hits: number[] } };
g.__auraVoice ??= { cache: new Map(), hits: [] };
const voice = g.__auraVoice;

/**
 * POST { text } -> audio/mpeg of the line in the ElevenLabs voice.
 * 404 when ELEVENLABS_API_KEY is unset (the kiosk falls back to the browser
 * voice immediately). Clips are cached per voice + text.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "VOICE OFF." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text || text.length > MAX_CHARS) return NextResponse.json({ error: "BAD TEXT." }, { status: 400 });

  const key = createHash("sha256").update(`${ELEVENLABS_VOICE_ID}|${text}`).digest("hex");
  const cached = voice.cache.get(key);
  if (cached) return audio(cached);

  const now = Date.now();
  voice.hits = voice.hits.filter((t) => now - t < 60_000);
  if (voice.hits.length >= MAX_PER_MINUTE) return NextResponse.json({ error: "VOICE BUSY." }, { status: 429 });
  voice.hits.push(now);

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[aura] elevenlabs ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return NextResponse.json({ error: "VOICE FAILED." }, { status: 502 });
    }
    const clip = Buffer.from(await res.arrayBuffer());
    voice.cache.set(key, clip);
    if (voice.cache.size > 200) voice.cache.delete(voice.cache.keys().next().value as string);
    return audio(clip);
  } catch (err) {
    console.warn("[aura] elevenlabs unavailable:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "VOICE FAILED." }, { status: 502 });
  }
}

function audio(clip: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(clip), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
