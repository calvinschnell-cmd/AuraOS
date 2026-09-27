import { NextResponse } from "next/server";
import { adminKeyFrom, isAdmin } from "@/lib/server/admin";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { cardId } with the ADMIN_KEY (x-admin-key header, or Authorization:
 * Bearer): hides a card from the feed, its /r/ page and image, and its solo
 * scan from the leaderboard (squad member cards go with a squad card). Open
 * feeds drop it on their next poll; the board and result pages too. Nothing
 * is deleted, so a mistake can be undone in the database.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!isAdmin(adminKeyFrom(request) ?? bearer)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { cardId?: unknown } | null;
  const cardId = typeof body?.cardId === "string" ? body.cardId.trim() : "";
  if (!cardId) return NextResponse.json({ error: "cardId REQUIRED." }, { status: 400 });
  try {
    const hidden = await getScanStore().hideCard(cardId);
    if (!hidden) return NextResponse.json({ error: "NO SUCH CARD." }, { status: 404 });
    console.info(`[aura] admin removed card ${cardId}`);
    return NextResponse.json({ ok: true, cardId });
  } catch (err) {
    console.error("[aura] remove failed", err);
    return NextResponse.json({ error: "REMOVE FAILED." }, { status: 503 });
  }
}
