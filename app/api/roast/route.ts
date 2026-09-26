import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { AnalysisError, OVERHEATED_MESSAGE, getAnalysisProvider } from "@/lib/analyze";
import { ROAST_PROMPT } from "@/lib/prompts";
import { recordUsage } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Cached per scan id so a thumbs down never costs more than one call. */
const roastCache = new Map<string, string>();

/**
 * POST multipart { image: File, scanId: string }. One extra playful roast
 * about the outfit. The image is never stored.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "EXPECTED MULTIPART FORM DATA." }, { status: 400 });
  }
  const file = form.get("image");
  const scanId = String(form.get("scanId") ?? "");
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_IMAGE_BYTES || !scanId) {
    return NextResponse.json({ error: "BAD REQUEST." }, { status: 400 });
  }
  const cached = roastCache.get(scanId);
  if (cached) return NextResponse.json({ text: cached, cached: true });

  const data = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(data).digest("hex");
  try {
    const provider = getAnalysisProvider();
    const result = await provider.roast({ data, mimeType: file.type || "image/jpeg", hash }, ROAST_PROMPT);
    if (result.provider === "openai") recordUsage(result.usage);
    roastCache.set(scanId, result.text);
    if (roastCache.size > 500) roastCache.delete(roastCache.keys().next().value as string);
    return NextResponse.json({ text: result.text, cached: false });
  } catch (err) {
    const message = err instanceof AnalysisError ? err.message : OVERHEATED_MESSAGE;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
