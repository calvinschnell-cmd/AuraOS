import { NextResponse } from "next/server";
import { mobileScanConfig } from "@/lib/config";
import type { QuickScanResponse } from "@/lib/kiosk/types";
import { corsHeaders } from "@/lib/server/cors";
import { IMAGE_MIME, sniffImage, stripMetadata } from "@/lib/server/imageSafety";
import { errorResponse, processScan } from "@/lib/server/processScan";
import { clientIp, deviceIdFrom, scanLimiter } from "@/lib/server/rateLimit";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (request: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...corsHeaders(request), ...extra } });

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * POST multipart { image } with an X-Device-Id header: a phone scan (/scan).
 * The same scoring pipeline as the mirror (processScan, one fast judge),
 * tagged source "mobile". Only JPEG / PNG / WebP up to 5 MB, metadata
 * (EXIF, GPS) stripped before anything else sees it; the photo is not kept
 * unless STORE_RAW_PHOTOS=true. Rate limited per phone and per IP. No voice
 * roast, no badge: the phone renders and posts its card itself.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const started = Date.now();
  const cfg = mobileScanConfig();
  const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > cfg.maxUploadBytes + 64 * 1024) {
    return json(request, { error: "PHOTO TOO BIG. 5 MB MAX.", code: "too_large" }, 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(request, { error: "UPLOAD BROKE. TRY AGAIN.", code: "bad_request" }, 400);
  }
  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) return json(request, { error: "NO PHOTO RECEIVED.", code: "bad_request" }, 400);
  if (file.size > cfg.maxUploadBytes) return json(request, { error: "PHOTO TOO BIG. 5 MB MAX.", code: "too_large" }, 413);
  const raw = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(raw);
  if (!kind) return json(request, { error: "THAT'S NOT A PHOTO. JPEG, PNG OR WEBP ONLY.", code: "not_image" }, 415);

  const ip = clientIp(request);
  const device = deviceIdFrom(request.headers.get("x-device-id") ?? String(form.get("device") ?? ""));
  const verdict = scanLimiter().take(
    [
      { key: `device:${device ?? `ip:${ip}`}`, limit: cfg.perDevice },
      { key: `ip:${ip}`, limit: cfg.perIp },
    ],
    cfg.windowMs,
  );
  if (!verdict.ok) {
    const mins = Math.max(1, Math.ceil(verdict.retryAfterSec / 60));
    return json(
      request,
      { error: `EASY. THAT'S ${cfg.perDevice} SCANS IN ${Math.round(cfg.windowMs / 60_000)} MIN. TRY AGAIN IN ${mins} MIN.`, code: "rate_limited", retryAfterSec: verdict.retryAfterSec },
      429,
      { "Retry-After": String(verdict.retryAfterSec) },
    );
  }

  const image = stripMetadata(raw, kind);
  const mimeType = IMAGE_MIME[kind];
  try {
    const { scan, rank, cached, mock, classifier } = await processScan(image, mimeType, { singleJudge: true, source: "mobile", sourceCap: cfg.dailyCap });
    if (cfg.storeRawPhotos && !cached) await getScanStore().saveRawPhoto(scan.id, image, mimeType).catch((err) => console.warn("[aura] raw photo save failed", err));
    const ms = Date.now() - started;
    console.info(`[aura] mobile scan ${scan.id} aura=${scan.aura} ${ms}ms classifier=${classifier ?? "n/a"}${cached ? " (cached)" : ""}`);
    const body: QuickScanResponse = { scan: { id: scan.id, analysis: scan.analysis, aura: scan.aura, breakdown: scan.breakdown, rank, cached, mock }, classifier, ms };
    return json(request, body);
  } catch (err) {
    console.error("[aura] mobile scan failed", err);
    const { status, body } = errorResponse(err);
    return json(request, body, status);
  }
}
