"use client";

/**
 * Phone-side photo prep for /scan: decode (EXIF orientation applied by the
 * browser), shrink to ~1024 px on the long edge and re-encode as JPEG, which
 * also drops every bit of metadata (GPS included) before upload.
 */

export const PHONE_LONG_SIDE = 1024;
export const PHONE_JPEG_QUALITY = 0.8;

export interface PreparedPhoto {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // HEIC on some browsers, or no options support: fall back to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality));
}

export async function preparePhoto(file: Blob, longSide = PHONE_LONG_SIDE, quality = PHONE_JPEG_QUALITY): Promise<PreparedPhoto> {
  const img = await decode(file);
  try {
    const scale = Math.min(1, longSide / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.source, 0, 0, width, height);
    const blob = await toBlob(canvas, quality);
    return { blob, dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
  } finally {
    img.close();
  }
}

/** A v4 uuid that also works on plain-http dev hosts (randomUUID needs a secure context). */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // insecure context
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface UploadResult<T> {
  status: number;
  body: T | null;
}

/**
 * POST a form with upload progress (fetch has none). Status 0 = network
 * failure or timeout (venue wifi), which the page offers to retry.
 */
export function postWithProgress<T>(url: string, form: FormData, headers: Record<string, string>, onProgress: (fraction: number) => void, onSent: () => void, timeoutMs = 90_000): Promise<UploadResult<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = timeoutMs;
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => onSent();
    xhr.onload = () => {
      let body: T | null = null;
      try {
        body = JSON.parse(xhr.responseText) as T;
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ status: 0, body: null });
    xhr.ontimeout = () => resolve({ status: 0, body: null });
    xhr.send(form);
  });
}
