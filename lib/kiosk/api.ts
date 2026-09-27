import { OVERHEATED_MESSAGE } from "@/lib/analyze";
import { captureFrame } from "./capture";
import type { AnalyzeResponse, BadgeStatus, CameraRotation, ScanResult, UsageStats } from "./types";

export interface AnalyzeContext {
  video: HTMLVideoElement | null;
  flip: boolean;
  rotation: CameraRotation;
  /** Receives the server's usage snapshot for the debug overlay. */
  onUsage?: (usage: UsageStats) => void;
}

export type AnalyzeFn = () => Promise<ScanResult>;

/**
 * Capture the current frame (mirrored + rotated like the live feed), hash it,
 * and POST it to /api/analyze. The server serves fixtures in mock mode.
 */
export async function analyzeFrame(ctx: AnalyzeContext): Promise<ScanResult> {
  const frame = await captureFrame(ctx.video, { flip: ctx.flip, rotation: ctx.rotation });
  const form = new FormData();
  form.append("image", frame.blob, "frame.jpg");
  form.append("hash", frame.hash);

  let res: Response;
  try {
    res = await fetch("/api/analyze", { method: "POST", body: form });
  } catch (err) {
    throw new Error(OVERHEATED_MESSAGE, { cause: err });
  }
  const body = (await res.json().catch(() => null)) as (AnalyzeResponse & { error?: string }) | null;
  if (!res.ok || !body || typeof body.error === "string") {
    throw new Error(body?.error ?? OVERHEATED_MESSAGE);
  }
  ctx.onUsage?.(body.usage);
  return {
    id: body.id,
    analysis: body.analysis,
    aura: body.aura,
    breakdown: body.breakdown,
    rank: body.rank,
    capturedAt: Date.now(),
    image: { dataUrl: frame.dataUrl, width: frame.width, height: frame.height, hash: frame.hash, placeholder: frame.placeholder },
    cached: body.cached,
    mock: body.mock,
  };
}

/** Data URL -> Blob (for re-sending the captured frame). */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Thumbs down: one extra roast for this scan. */
export async function fetchRoast(scan: ScanResult): Promise<string> {
  const form = new FormData();
  form.append("image", dataUrlToBlob(scan.image.dataUrl), "frame.jpg");
  form.append("scanId", scan.id);
  const res = await fetch("/api/roast", { method: "POST", body: form });
  const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!res.ok || !body?.text) throw new Error(body?.error ?? OVERHEATED_MESSAGE);
  return body.text;
}

export async function fetchUsageStats(): Promise<UsageStats | null> {
  try {
    const res = await fetch("/api/stats", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as UsageStats;
  } catch {
    return null;
  }
}

export { registerPlayer } from "@/lib/companion/register";

/**
 * Mint the Solana badge for a saved card. null when badges are off (404);
 * "failed" on any error or timeout. Never throws: the card is already done.
 */
export async function mintBadge(cardId: string, timeoutMs = 45_000): Promise<BadgeStatus | null> {
  try {
    const res = await fetch("/api/nft/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) return null;
    if (!res.ok) return { status: "failed" };
    const body = (await res.json()) as { signature: string; explorerUrl: string };
    return { status: "minted", signature: body.signature, explorerUrl: body.explorerUrl };
  } catch {
    return { status: "failed" };
  }
}
