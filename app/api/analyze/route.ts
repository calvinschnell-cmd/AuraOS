import { NextResponse } from "next/server";
import type { AnalyzeResponse } from "@/lib/kiosk/types";
import { errorResponse, processScan, readImage } from "@/lib/server/processScan";
import { usageSnapshot } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST multipart { image: File }. Returns the cached scan for a known image
 * hash, otherwise analyzes, scores, stores (result + aura only) and ranks.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "EXPECTED MULTIPART FORM DATA." }, { status: 400 });
  }
  const image = await readImage(form, "image");
  if (!image) return NextResponse.json({ error: "NO IMAGE RECEIVED." }, { status: 400 });

  try {
    const { scan, rank, cached, mock } = await processScan(image.data, image.mimeType);
    const body: AnalyzeResponse = {
      id: scan.id,
      analysis: scan.analysis,
      aura: scan.aura,
      breakdown: scan.breakdown,
      rank,
      cached,
      mock,
      usage: await usageSnapshot(),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[aura] analysis failed", err);
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
