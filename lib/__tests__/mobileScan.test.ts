import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { classifierConfig, mobileScanConfig } from "@/lib/config";
import { sniffImage, stripMetadata } from "@/lib/server/imageSafety";
import { RateLimiter, deviceIdFrom } from "@/lib/server/rateLimit";
import { classifyGarments } from "@/lib/server/segmenter";

/** A minimal JPEG: SOI, JFIF APP0, an EXIF APP1 with a GPS marker, a COM, a quant table, SOS + data, EOI. */
function jpegWithExif(): Buffer {
  const seg = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([(payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    seg(0xe1, Buffer.from("Exif\0\0GPSLatitude=33.7756;GPSLongitude=-84.3963", "latin1")),
    seg(0xfe, Buffer.from("shot on my phone", "latin1")),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from("PIXELDATA", "latin1"),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function pngWithText(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", Buffer.alloc(13)),
    chunk("tEXt", Buffer.from("Location\0Atlanta GA", "latin1")),
    chunk("eXIf", Buffer.from("MM\0*GPS", "latin1")),
    chunk("IDAT", Buffer.from("PIXELS", "latin1")),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("image hygiene", () => {
  it("tells images from their bytes, not their name", () => {
    expect(sniffImage(jpegWithExif())).toBe("jpeg");
    expect(sniffImage(pngWithText())).toBe("png");
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"))).toBe("webp");
    expect(sniffImage(Buffer.from("<html>not a photo</html>"))).toBeNull();
    expect(sniffImage(Buffer.from("%PDF-1.7"))).toBeNull();
  });

  it("strips EXIF (GPS) and comments from JPEG, keeping the image data", () => {
    const out = stripMetadata(jpegWithExif(), "jpeg");
    const text = out.toString("latin1");
    expect(text).not.toContain("Exif");
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("shot on my phone");
    expect(text).toContain("JFIF");
    expect(text).toContain("PIXELDATA");
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
  });

  it("strips text and EXIF chunks from PNG", () => {
    const text = stripMetadata(pngWithText(), "png").toString("latin1");
    expect(text).not.toContain("Atlanta");
    expect(text).not.toContain("eXIf");
    expect(text).toContain("IDAT");
    expect(text).toContain("IEND");
  });

  it("strips EXIF and XMP chunks from WebP and fixes the RIFF size", () => {
    const chunk = (type: string, data: string) => {
      const b = Buffer.from(data, "latin1");
      const len = Buffer.alloc(4);
      len.writeUInt32LE(b.length);
      return Buffer.concat([Buffer.from(type, "latin1"), len, b, b.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
    };
    const body = Buffer.concat([chunk("VP8X", "\x0c\0\0\0\0\0\0\0\0\0"), chunk("VP8 ", "FRAME!"), chunk("EXIF", "GPS 33.7"), chunk("XMP ", "<x:xmpmeta/>")]);
    const head = Buffer.alloc(12);
    head.write("RIFF", 0, "latin1");
    head.writeUInt32LE(body.length + 4, 4);
    head.write("WEBP", 8, "latin1");
    const out = stripMetadata(Buffer.concat([head, body]), "webp");
    const text = out.toString("latin1");
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("xmpmeta");
    expect(text).toContain("FRAME!");
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out[20] & 0x0c).toBe(0); // VP8X EXIF + XMP flags cleared
  });
});

describe("scan rate limit", () => {
  const window = 10 * 60_000;
  it("allows 5 scans per phone per window, then blocks with a retry time", () => {
    const rl = new RateLimiter();
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rl.take([{ key: "device:a", limit: 5 }, { key: "ip:1", limit: 30 }], window, t + i).ok).toBe(true);
    const blocked = rl.take([{ key: "device:a", limit: 5 }, { key: "ip:1", limit: 30 }], window, t + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(590);
    // Another phone on the same venue wifi still gets in.
    expect(rl.take([{ key: "device:b", limit: 5 }, { key: "ip:1", limit: 30 }], window, t + 11).ok).toBe(true);
    // The window slides: the first scan expires after 10 minutes.
    expect(rl.take([{ key: "device:a", limit: 5 }, { key: "ip:1", limit: 30 }], window, t + window + 1).ok).toBe(true);
  });

  it("caps a whole IP too, and a blocked attempt does not count", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 3; i++) expect(rl.take([{ key: `device:${i}`, limit: 5 }, { key: "ip:x", limit: 3 }], window, i).ok).toBe(true);
    expect(rl.take([{ key: "device:9", limit: 5 }, { key: "ip:x", limit: 3 }], window, 5).ok).toBe(false);
    // device:9 was not charged for the refused attempt.
    expect(rl.take([{ key: "device:9", limit: 1 }], window, 6).ok).toBe(true);
  });

  it("only accepts sane device ids", () => {
    expect(deviceIdFrom("0b6b1f3e-6d2c-4c61-9a4b-3c7c2c1d9e10")).toBe("0b6b1f3e-6d2c-4c61-9a4b-3c7c2c1d9e10");
    expect(deviceIdFrom("short")).toBeNull();
    expect(deviceIdFrom("'; DROP TABLE cards;--")).toBeNull();
    expect(deviceIdFrom(null)).toBeNull();
  });

  it("reads limits from env with the documented defaults", () => {
    expect(mobileScanConfig({})).toMatchObject({ maxUploadBytes: 5 * 1024 * 1024, perDevice: 5, perIp: 30, windowMs: 600_000, dailyCap: 400, storeRawPhotos: false });
    expect(mobileScanConfig({ SCAN_RATE_LIMIT: "2", STORE_RAW_PHOTOS: "true" })).toMatchObject({ perDevice: 2, storeRawPhotos: true });
  });
});

describe("classifier fallback (CLASSIFIER_MODE)", () => {
  let hang: Server;
  let hangUrl = "";
  beforeAll(async () => {
    // A classifier that accepts the request and never answers.
    hang = createServer(() => {});
    await new Promise<void>((r) => hang.listen(0, "127.0.0.1", r));
    hangUrl = `http://127.0.0.1:${(hang.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    hang.closeAllConnections();
    hang.close();
  });
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("maps modes to urls", () => {
    expect(classifierConfig({})).toMatchObject({ mode: "local", url: "http://127.0.0.1:8001" });
    expect(classifierConfig({ CLASSIFIER_MODE: "skip" })).toMatchObject({ mode: "skip", url: null });
    expect(classifierConfig({ CLASSIFIER_MODE: "remote", CLASSIFIER_URL: "https://gpu.example/" })).toMatchObject({ mode: "remote", url: "https://gpu.example" });
    expect(classifierConfig({ ML_SERVICE_URL: "off" })).toMatchObject({ mode: "local", url: null });
  });

  it("skip mode never calls it and logs the skip", async () => {
    const out = await classifyGarments(Buffer.from([1]), "image/jpeg", { mode: "skip", url: null, timeoutMs: 1000 });
    expect(out).toEqual({ seg: null, status: "skipped" });
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("classifier skipped"));
  });

  it("an unreachable classifier is skipped, not an error", async () => {
    const out = await classifyGarments(Buffer.from([1]), "image/jpeg", { mode: "remote", url: "http://127.0.0.1:1", timeoutMs: 1000 });
    expect(out).toEqual({ seg: null, status: "unavailable" });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("skipped"), expect.anything());
  });

  it("a classifier that times out is skipped within the timeout", async () => {
    const t0 = Date.now();
    const out = await classifyGarments(Buffer.from([1]), "image/jpeg", { mode: "local", url: hangUrl, timeoutMs: 300 });
    expect(out.status).toBe("unavailable");
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("POST /api/scan/quick", () => {
  beforeAll(() => {
    // MOCK MODE, in-memory store, small limits.
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("TIGER_DATABASE_URL", "");
    vi.stubEnv("SCAN_RATE_LIMIT", "2");
    vi.stubEnv("SCAN_MAX_UPLOAD_BYTES", String(64 * 1024));
  });
  afterAll(() => vi.unstubAllEnvs());

  const post = async (body: Blob, device: string, ip = "10.0.0.1") => {
    const { POST } = await import("@/app/api/scan/quick/route");
    const form = new FormData();
    form.append("image", body, "photo.jpg");
    const res = await POST(new Request("http://localhost/api/scan/quick", { method: "POST", body: form, headers: { "x-device-id": device, "x-forwarded-for": ip } }));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it("rejects uploads over the size limit", async () => {
    const big = new Blob([new Uint8Array(jpegWithExif()), new Uint8Array(80 * 1024)], { type: "image/jpeg" });
    const res = await post(big, "device-oversize-01", "10.0.0.2");
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("too_large");
  });

  it("rejects non-images even when they claim to be one", async () => {
    const res = await post(new Blob(["<?php echo 1; ?>"], { type: "image/jpeg" }), "device-notimage-01", "10.0.0.3");
    expect(res.status).toBe(415);
    expect(res.body.code).toBe("not_image");
  });

  it("scores a phone photo, tagged mobile, and rate limits the third one", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const photo = (n: number) => new Blob([new Uint8Array(jpegWithExif()), `unique-${n}`], { type: "image/jpeg" });
    const first = await post(photo(1), "device-ratelimit-01");
    expect(first.status).toBe(200);
    const scan = first.body.scan as { id: string; aura: number };
    expect(typeof scan.aura).toBe("number");
    const { getScanStore } = await import("@/lib/server/store");
    expect((await getScanStore().getById(scan.id))?.source).toBe("mobile");
    expect((await post(photo(2), "device-ratelimit-01")).status).toBe(200);
    const third = await post(photo(3), "device-ratelimit-01");
    expect(third.status).toBe(429);
    expect(third.body.code).toBe("rate_limited");
    expect(String(third.body.error)).toMatch(/TRY AGAIN IN \d+ MIN/);
  });
});
