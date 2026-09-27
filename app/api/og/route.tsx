import { ImageResponse } from "next/og";

export const runtime = "nodejs";

/**
 * The fallback link preview (1200x630) for pages without a card of their own:
 * /scan, /feed, /leaderboard, and a challenge before the friend has scanned.
 * Optional ?t= headline (short, uppercased).
 */
export async function GET(request: Request): Promise<Response> {
  const t = (new URL(request.url).searchParams.get("t") ?? "SCAN YOUR FIT. GET YOUR AURA.").slice(0, 60).toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#161616", color: "#9ee7ff", padding: 56, border: "6px solid #9ee7ff", fontFamily: "monospace" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, letterSpacing: 4 }}>
          <span>AURA OS // AURA BATTLES</span>
          <span>HACKGT 13</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 132, fontWeight: 700, lineHeight: 1, color: "#c9f4ff" }}>AURA OS</div>
          <div style={{ fontSize: 48, marginTop: 24 }}>{t}</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, opacity: 0.8 }}>OUTFIT BATTLES JUDGED ON FIT + POSE · SCAN FROM YOUR PHONE OR THE MIRROR</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
