import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { REACTION_SFX, isReaction, type Reaction } from "@/lib/kiosk/reactionTiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generated once, kept on this machine's disk (gitignored). */
const DIR = path.join(process.cwd(), "public", "audio", "reactions");

const g = globalThis as unknown as { __auraSfx?: Map<Reaction, Promise<Buffer | null>> };
g.__auraSfx ??= new Map();
const inflight = g.__auraSfx;

async function generate(name: Reaction, apiKey: string): Promise<Buffer | null> {
  const { prompt, seconds } = REACTION_SFX[name];
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: prompt, duration_seconds: seconds, prompt_influence: 0.6 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[aura] elevenlabs sfx ${name} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    const clip = Buffer.from(await res.arrayBuffer());
    await mkdir(DIR, { recursive: true });
    await writeFile(path.join(DIR, `${name}.mp3`), clip);
    return clip;
  } catch (err) {
    console.warn(`[aura] elevenlabs sfx ${name} unavailable:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * GET: a crowd reaction clip (audio/mpeg). From disk if it was generated
 * before, else generated once with the ElevenLabs sound-effects API and saved.
 * 404 without ELEVENLABS_API_KEY (MOCK MODE): the kiosk synthesizes one.
 * Only the five fixed reactions exist, so this can never burn more than five
 * generations per machine.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }): Promise<NextResponse> {
  const { name } = await params;
  if (!isReaction(name)) return NextResponse.json({ error: "UNKNOWN SOUND." }, { status: 404 });
  try {
    return audio(await readFile(path.join(DIR, `${name}.mp3`)));
  } catch {
    // not generated yet
  }
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "SFX OFF." }, { status: 404 });
  let job = inflight.get(name);
  if (!job) {
    job = generate(name, apiKey);
    inflight.set(name, job);
    void job.then((clip) => {
      if (!clip) inflight.delete(name); // failed: a later request may try again
    });
  }
  const clip = await job;
  return clip ? audio(clip) : NextResponse.json({ error: "SFX FAILED." }, { status: 502 });
}

function audio(clip: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(clip), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
