"use client";

import { toJpeg, toPng } from "html-to-image";
import type { Box2D } from "@/lib/schema";

export const CARD_W = 1080;
export const CARD_H = 1350;
/** The card's desktop background (--aura-bg). */
const CARD_BG = "#161616";

/**
 * A tileable film-grain texture (PNG data URL): subtle light/dark specks so
 * the card reads as a designed graphic rather than an app screenshot.
 */
export function grainDataUrl(size = 160, strength = 0.07): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const light = Math.random() < 0.5;
    const v = light ? 255 : 0;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.round(Math.random() * strength * 255);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * Blur the face region of a captured photo (box_2d, normalized 0-1000).
 * Returns a JPEG data URL. Without a face box the photo is returned as is.
 */
export async function blurFace(dataUrl: string, faceBox: Box2D | null, strength = 22): Promise<string> {
  if (!faceBox) return dataUrl;
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const [ymin, xmin, ymax, xmax] = faceBox;
  const pad = 0.25;
  const w = ((xmax - xmin) / 1000) * img.width;
  const h = ((ymax - ymin) / 1000) * img.height;
  const x = Math.max(0, (xmin / 1000) * img.width - w * pad);
  const y = Math.max(0, (ymin / 1000) * img.height - h * pad);
  const bw = Math.min(img.width - x, w * (1 + pad * 2));
  const bh = Math.min(img.height - y, h * (1 + pad * 2));
  if (bw <= 0 || bh <= 0) return dataUrl;
  // Blur passes over the face rect, clipped to an ellipse so it looks intentional.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x + bw / 2, y + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.filter = `blur(${strength}px)`;
  for (let i = 0; i < 3; i++) ctx.drawImage(canvas, x, y, bw, bh, x, y, bw, bh);
  ctx.restore();
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Wait for fonts and every <img> inside a node to be ready. */
async function settle(node: HTMLElement): Promise<void> {
  await document.fonts?.ready;
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
}

/**
 * Phone cards: the same render as a JPEG (a fraction of the PNG's size on
 * venue wifi). iOS Safari often paints <img>s inside the SVG snapshot only
 * from the second pass, so the first pass is a throwaway warm-up there.
 */
export async function renderCardJpeg(node: HTMLElement, quality = 0.88): Promise<Blob> {
  await settle(node);
  const opts = { width: CARD_W, height: CARD_H, pixelRatio: 1, quality, backgroundColor: CARD_BG };
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
  let dataUrl: string;
  try {
    if (ios) await toJpeg(node, opts).catch(() => null);
    dataUrl = await toJpeg(node, opts);
  } catch {
    dataUrl = await toJpeg(node, { ...opts, skipFonts: true });
  }
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Render a mounted card node to a 1080x1350 PNG blob. */
export async function renderCardNode(node: HTMLElement): Promise<Blob> {
  await settle(node);
  let dataUrl: string;
  try {
    // backgroundColor is applied to the card element itself: it must match .share-card (--aura-bg).
    dataUrl = await toPng(node, { width: CARD_W, height: CARD_H, pixelRatio: 1, cacheBust: false, backgroundColor: CARD_BG });
  } catch {
    dataUrl = await toPng(node, { width: CARD_W, height: CARD_H, pixelRatio: 1, skipFonts: true, backgroundColor: CARD_BG });
  }
  const res = await fetch(dataUrl);
  return res.blob();
}
