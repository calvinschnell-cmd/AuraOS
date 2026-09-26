import { NextResponse } from "next/server";
import { isReaction } from "@/lib/feed/types";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;

/** POST { emoji, clientId }: one reaction per device per emoji (tapping again changes nothing). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { emoji?: unknown; clientId?: unknown } | null;
  if (!body || !isReaction(body.emoji) || typeof body.clientId !== "string" || !CLIENT_ID.test(body.clientId)) {
    return NextResponse.json({ error: "BAD REACTION." }, { status: 400 });
  }
  const store = getScanStore();
  try {
    if (!(await store.feedEntry(id))) return NextResponse.json({ error: "NOT FOUND." }, { status: 404 });
    const reactions = await store.react(id, body.emoji, body.clientId);
    return NextResponse.json({ reactions });
  } catch (err) {
    console.error("[aura] reaction failed", err);
    return NextResponse.json({ error: "REACTIONS UNAVAILABLE." }, { status: 503 });
  }
}
