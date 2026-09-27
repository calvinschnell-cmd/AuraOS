import { NextResponse } from "next/server";
import { isDuelId } from "@/lib/duels/types";
import { acceptDuel, DuelError } from "@/lib/server/duels";
import { deviceIdFrom } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { cardId } with X-Device-Id: accept a challenge with the card this
 * phone just made on /scan (the scan itself went through /api/scan/quick, so
 * its rate limit applies). Battles the two stored scans and writes the
 * commentary before answering.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  if (!isDuelId(id)) return NextResponse.json({ error: "THIS CHALLENGE DOESN'T EXIST." }, { status: 404 });
  const device = deviceIdFrom(request.headers.get("x-device-id"));
  if (!device) return NextResponse.json({ error: "SCAN ON YOUR PHONE TO ACCEPT." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { cardId?: unknown } | null;
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  try {
    const accept = await acceptDuel(id, cardId, device);
    return NextResponse.json({ acceptId: accept.id, battleId: accept.battleId, feedCardId: accept.feedCardId });
  } catch (err) {
    if (err instanceof DuelError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[aura] challenge accept failed", err);
    return NextResponse.json({ error: "THE BATTLE TRIPPED. TRY AGAIN." }, { status: 503 });
  }
}
