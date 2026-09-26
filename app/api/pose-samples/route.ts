import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isPoseSnapshot, type PoseSnapshot } from "@/lib/pose/landmarks";
import { ARCHETYPES } from "@/lib/pose/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUT = join(process.cwd(), "ml-service", "pose", "recorded.jsonl");
const MAX_SAMPLES = 40;

/**
 * POST { category, samples[] } from /pose-lab: labeled landmark samples from
 * the kiosk camera, appended to ml-service/pose/recorded.jsonl (the trainer
 * reads it next to the dataset). Development only: a production server
 * never writes to its own disk from a request.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "NOT AVAILABLE." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { category?: unknown; samples?: unknown } | null;
  const category = typeof body?.category === "string" && body.category in ARCHETYPES ? body.category : null;
  const samples = Array.isArray(body?.samples) ? (body.samples as unknown[]).filter(isPoseSnapshot).slice(0, MAX_SAMPLES) : [];
  if (!category || samples.length === 0) return NextResponse.json({ error: "BAD SAMPLES." }, { status: 400 });
  const stamp = Date.now();
  const lines = samples.map((s: PoseSnapshot, i) =>
    JSON.stringify({
      id: `live_${category}_${stamp}_${i}`,
      category,
      // The trainer reads aspect as width / height.
      width: Math.round(s.aspect * 1000),
      height: 1000,
      landmarks: s.landmarks,
      source: "pose-lab",
      license: "recorded at the kiosk",
    }),
  );
  await appendFile(OUT, `${lines.join("\n")}\n`, "utf8");
  return NextResponse.json({ saved: lines.length });
}
