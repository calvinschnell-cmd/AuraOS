"use client";

import type { ImageSegmenter, MPMask } from "@mediapipe/tasks-vision";
import { createImageSegmenter } from "./vision";

/**
 * Person segmentation for the aura glow. Loads MediaPipe lazily from the CDN;
 * if anything fails (offline, no WebGL) the glow is simply skipped.
 */

let imageSegmenterPromise: Promise<ImageSegmenter | null> | null = null;

export function getImageSegmenter(): Promise<ImageSegmenter | null> {
  imageSegmenterPromise ??= createImageSegmenter("IMAGE");
  return imageSegmenterPromise;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

/** Tint a confidence mask into an RGBA canvas (alpha = confidence). */
export function maskToCanvas(mask: MPMask, color: string, target?: HTMLCanvasElement): HTMLCanvasElement {
  const values = mask.getAsFloat32Array();
  const w = mask.width;
  const h = mask.height;
  const canvas = target ?? document.createElement("canvas");
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(w, h);
  const n = Number.parseInt(color.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const data = imageData.data;
  for (let i = 0; i < w * h; i++) {
    const a = values[i];
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a <= 0 ? 0 : a >= 1 ? 255 : (a * 255) | 0;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Multi-class models list background first; the person mask is the last one. */
export function personMask(masks: MPMask[] | undefined): MPMask | null {
  if (!masks || masks.length === 0) return null;
  return masks[masks.length - 1];
}

/**
 * Returns a PNG data URL of the person mask tinted `color` (alpha = confidence),
 * at the image's size, or null when segmentation is unavailable.
 */
export async function personMaskDataUrl(imageDataUrl: string, color = "#9ee7ff"): Promise<string | null> {
  const segmenter = await getImageSegmenter();
  if (!segmenter) return null;
  try {
    const img = await loadImage(imageDataUrl);
    const result = segmenter.segment(img);
    const mask = personMask(result.confidenceMasks);
    if (!mask) return null;
    const canvas = maskToCanvas(mask, color);
    result.close();
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[aura] segmentation failed", err);
    return null;
  }
}
