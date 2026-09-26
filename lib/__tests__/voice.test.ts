import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/voice/route";

const req = (text: unknown) => new Request("http://kiosk/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });

describe("ElevenLabs voice route", () => {
  beforeEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ELEVENLABS_API_KEY;
  });

  it("is off without a key (the kiosk falls back to the browser voice)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req("hello"));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("voices a line with the flash model and caches it", async () => {
    process.env.ELEVENLABS_API_KEY = "xi-test";
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    const text = `That fit goes hard ${Date.now()}`;
    const first = await POST(req(text));
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("api.elevenlabs.io/v1/text-to-speech/");
    expect(JSON.parse(String(init.body))).toMatchObject({ text, model_id: "eleven_flash_v2_5" });
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi-test");
    // Same line again: served from cache.
    expect((await POST(req(text))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects bad input and reports upstream failures without throwing", async () => {
    process.env.ELEVENLABS_API_KEY = "xi-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 401 })));
    expect((await POST(req(""))).status).toBe(400);
    expect((await POST(req("x".repeat(401)))).status).toBe(400);
    expect((await POST(req(`fails ${Date.now()}`))).status).toBe(502);
  });
});
