import { NextResponse } from "next/server";
import { commentaryStream } from "@/lib/server/battles";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST: the battle's head-to-head (or squad) commentary as a plain-text
 * stream. The kiosk renders tokens as they arrive; the finished text is saved
 * on the battle, so a second request (the card, the feed) gets it instantly.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const battle = await getScanStore()
    .getBattle(id)
    .catch(() => null);
  if (!battle) return NextResponse.json({ error: "UNKNOWN BATTLE." }, { status: 404 });
  const stream = await commentaryStream(battle);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
