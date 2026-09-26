import { CAPTURE_JPEG_QUALITY, CAPTURE_MAX_LONG_SIDE } from "@/lib/config";
import type { CameraRotation, CapturedImage } from "./types";

export interface CaptureOptions {
  /** Mirror horizontally (applied before rotation, same as the live feed CSS). */
  flip: boolean;
  rotation: CameraRotation;
  maxLongSide?: number;
  quality?: number;
}

export interface CapturedFrame extends CapturedImage {
  blob: Blob;
}

/** SHA-256 hex of a blob, computed client-side. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function videoReady(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
}

/**
 * Placeholder frame when no camera is available (mock/dev): a dark portrait
 * with a simple figure so bounding boxes have something to land on.
 */
function drawPlaceholder(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#1c2228");
  grad.addColorStop(1, "#0b0e11");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // grid
  ctx.strokeStyle = "rgba(158,231,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // figure
  const cx = w / 2;
  ctx.fillStyle = "#cfd3d6";
  ctx.beginPath();
  ctx.arc(cx, h * 0.17, w * 0.085, 0, Math.PI * 2);
  ctx.fill();
  const rr = (x: number, y: number, rw: number, rh: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, rw, rh, r);
    ctx.fill();
  };
  ctx.fillStyle = "#8f98a3";
  rr(cx - w * 0.2, h * 0.27, w * 0.4, h * 0.3, 28); // torso
  ctx.fillStyle = "#5c6672";
  rr(cx - w * 0.17, h * 0.56, w * 0.15, h * 0.34, 18); // legs
  rr(cx + w * 0.02, h * 0.56, w * 0.15, h * 0.34, 18);
  ctx.fillStyle = "#8f98a3";
  rr(cx - w * 0.3, h * 0.29, w * 0.09, h * 0.26, 18); // arms
  rr(cx + w * 0.21, h * 0.29, w * 0.09, h * 0.26, 18);
  ctx.fillStyle = "#e8e8e4";
  rr(cx - w * 0.19, h * 0.89, w * 0.17, h * 0.04, 8); // shoes
  rr(cx + w * 0.02, h * 0.89, w * 0.17, h * 0.04, 8);
  ctx.fillStyle = "rgba(158,231,255,0.85)";
  ctx.font = `bold ${Math.round(w * 0.05)}px monospace`;
  ctx.textAlign = "center";
  // A serial per capture: every placeholder frame hashes differently, so each
  // mock capture (e.g. both players of a battle) gets its own sample fit.
  const serial = Math.random().toString(36).slice(2, 6).toUpperCase();
  ctx.fillText(`NO CAMERA SIGNAL · FRAME ${serial}`, cx, h * 0.96);
  return canvas;
}

/**
 * Grab a frame, apply mirror + rotation exactly as the live feed shows it,
 * resize to the max long side, and encode as JPEG (which strips EXIF).
 */
export async function captureFrame(video: HTMLVideoElement | null, opts: CaptureOptions): Promise<CapturedFrame> {
  const maxLong = opts.maxLongSide ?? CAPTURE_MAX_LONG_SIDE;
  const quality = opts.quality ?? CAPTURE_JPEG_QUALITY;
  const placeholder = !videoReady(video);
  const source: CanvasImageSource = placeholder ? drawPlaceholder(720, 960) : video;
  const srcW = placeholder ? 720 : video.videoWidth;
  const srcH = placeholder ? 960 : video.videoHeight;
  const rotation = placeholder ? 0 : opts.rotation;
  const flip = placeholder ? false : opts.flip;

  const sideways = rotation === 90 || rotation === 270;
  const outW = sideways ? srcH : srcW;
  const outH = sideways ? srcW : srcH;
  const scale = Math.min(1, maxLong / Math.max(outW, outH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(outW * scale);
  canvas.height = Math.round(outH * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  // Later transforms apply to the image first: rotate upright, then mirror on screen.
  if (flip) ctx.scale(-1, 1);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, (-srcW * scale) / 2, (-srcH * scale) / 2, srcW * scale, srcH * scale);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("CAPTURE FAILED"))), "image/jpeg", quality);
  });
  const hash = await sha256Hex(blob);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { blob, dataUrl, width: canvas.width, height: canvas.height, hash, placeholder };
}
