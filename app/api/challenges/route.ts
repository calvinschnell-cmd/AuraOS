import { NextResponse } from "next/server";
import { checkPlayerName } from "@/lib/profanity";
import { adminKeyFrom, isAdmin } from "@/lib/server/admin";
import { getScanStore, lastCalled, liveChallenges, pushChallenge } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET: the challenger queue (the kiosk shows "UP NEXT" on its mode select and
 * the operator dashboard lists it), plus the last person the operator called
 * up (the mirror announces them once).
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    challenges: liveChallenges().map(({ id, name, target, cardId, at }) => ({ id, name, target, cardId, at })),
    called: lastCalled(),
  });
}

/**
 * POST { name, cardId }: "BEAT THIS SCORE" from a friend's shared card. The
 * kiosk is one physical screen, so instead of a remote scan they join the
 * queue and the mirror calls them up (entries expire on their own, so nobody
 * can clear someone else's spot).
 * POST { name } with x-admin-key: the operator signs up a walk-in.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { name?: unknown; cardId?: unknown } | null;
  const check = checkPlayerName(typeof body?.name === "string" ? body.name : "");
  if (!check.ok || !check.name) return NextResponse.json({ error: check.ok ? "NAME REQUIRED." : check.error }, { status: 422 });
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  if (!cardId) {
    if (!isAdmin(adminKeyFrom(request))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { position } = pushChallenge({ name: check.name, target: 0, cardId: "" });
    return NextResponse.json({ position });
  }
  const entry = await getScanStore().feedEntry(cardId).catch(() => null);
  if (!entry) return NextResponse.json({ error: "UNKNOWN CARD." }, { status: 404 });
  const { position } = pushChallenge({ name: check.name, target: entry.target, cardId });
  return NextResponse.json({ position });
}
