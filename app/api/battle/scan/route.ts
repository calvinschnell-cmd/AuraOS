import { NextResponse } from "next/server";
import type { BattleScanResponse } from "@/lib/kiosk/types";
import { parsePoseField, poseForCapture } from "@/lib/server/pose";
import { errorResponse, processScan, readImage } from "@/lib/server/processScan";
import { usageSnapshot } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST multipart { image, pose? } for one lobby capture. Scored the moment
 * the player captures (while the next player steps up), by a single fast
 * judge, plus the pose sub-score from the live landmarks. The image is never
 * stored.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "EXPECTED MULTIPART FORM DATA." }, { status: 400 });
  }
  const image = await readImage(form, "image");
  if (!image) return NextResponse.json({ error: "NO IMAGE." }, { status: 400 });
  try {
    const processed = await processScan(image.data, image.mimeType, { singleJudge: true });
    const { scan, rank, cached, mock } = processed;
    const body: BattleScanResponse = {
      scan: { id: scan.id, analysis: scan.analysis, aura: scan.aura, breakdown: scan.breakdown, rank, cached, mock },
      pose: poseForCapture(parsePoseField(form.get("pose")), scan.imageHash),
      usage: await usageSnapshot(),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[aura] battle capture failed", err);
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
