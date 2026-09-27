import { NextResponse } from "next/server";
import { publicBaseUrl } from "@/lib/server/baseUrl";
import { createDuel, DuelError } from "@/lib/server/duels";
import { deviceIdFrom } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { cardId } with X-Device-Id: "Challenge a friend" from your own card.
 * Returns the challenge link (/c/[id]); the same card always gets the same link.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const device = deviceIdFrom(request.headers.get("x-device-id"));
  if (!device) return NextResponse.json({ error: "OPEN THIS ON THE PHONE THAT MADE THE CARD." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { cardId?: unknown } | null;
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  try {
    const duel = await createDuel(cardId, device);
    return NextResponse.json({ id: duel.id, url: `${publicBaseUrl(request)}/c/${duel.id}` });
  } catch (err) {
    if (err instanceof DuelError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[aura] challenge create failed", err);
    return NextResponse.json({ error: "CHALLENGES ARE DOWN. TRY AGAIN." }, { status: 503 });
  }
}
