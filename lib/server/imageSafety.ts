/**
 * Upload hygiene for phone scans: tell the real image type from its bytes
 * (never the declared type), and strip metadata (EXIF, GPS, XMP, comments)
 * before the image goes anywhere. Pure byte surgery, no image library: the
 * pixels are never re-encoded.
 */

export type ImageKind = "jpeg" | "png" | "webp";

export const IMAGE_MIME: Record<ImageKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function sniffImage(data: Uint8Array): ImageKind | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpeg";
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return "png";
  if (data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return "webp";
  return null;
}

function ascii(data: Uint8Array, at: number, len: number): string {
  return String.fromCharCode(...data.subarray(at, at + len));
}

/**
 * JPEG: drop APP1..APP15 (EXIF/GPS, XMP, IPTC, maker notes) and COM segments.
 * APP0 (JFIF) and everything from the first SOS on is kept as is.
 */
function stripJpeg(data: Buffer): Buffer {
  const out: Buffer[] = [data.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= data.length) {
    if (data[i] !== 0xff) break; // malformed: keep the rest untouched
    const marker = data[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xda) break; // start of scan: image data follows
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(data.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = data.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (len < 2 || end > data.length) break;
    const isMeta = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMeta) out.push(data.subarray(i, end));
    i = end;
  }
  out.push(data.subarray(i));
  return Buffer.concat(out);
}

const PNG_META = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

/** PNG: drop eXIf and text chunks (CRCs of kept chunks are untouched). */
function stripPng(data: Buffer): Buffer {
  const out: Buffer[] = [data.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= data.length) {
    const len = data.readUInt32BE(i);
    const type = data.toString("latin1", i + 4, i + 8);
    const end = i + 12 + len;
    if (end > data.length) break;
    if (!PNG_META.has(type)) out.push(data.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  if (i < data.length && out.length === 1) return data;
  return Buffer.concat(out);
}

/** WebP: drop EXIF and XMP chunks and clear their VP8X flags. */
function stripWebp(data: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= data.length) {
    const type = data.toString("latin1", i, i + 4);
    const len = data.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (end > data.length) {
      chunks.push(data.subarray(i));
      break;
    }
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = Buffer.from(data.subarray(i, end));
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04); // EXIF, XMP flags
      chunks.push(chunk);
    }
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

/** Strip metadata from a sniffed image. */
export function stripMetadata(data: Buffer, kind: ImageKind): Buffer {
  if (kind === "jpeg") return stripJpeg(data);
  if (kind === "png") return stripPng(data);
  return stripWebp(data);
}
