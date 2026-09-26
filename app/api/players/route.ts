import { NextResponse } from "next/server";
import type { PlayerInfo } from "@/lib/kiosk/types";
import { parseHandle } from "@/lib/players";
import { checkPlayerName } from "@/lib/profanity";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { name } -> a new player with a fresh NAME#CODE handle.
 * POST { handle } -> the existing player (404 if the AURA ID is unknown).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { name?: unknown; handle?: unknown } | null;
  const store = getScanStore();
  try {
    if (typeof body?.handle === "string") {
      const parsed = parseHandle(body.handle);
      if (!parsed) return NextResponse.json({ error: "THAT IS NOT AN AURA ID (NAME#CODE)." }, { status: 400 });
      const player = await store.getPlayer(parsed.handle);
      if (!player) return NextResponse.json({ error: "AURA ID NOT FOUND." }, { status: 404 });
      return NextResponse.json(player satisfies PlayerInfo);
    }
    const check = checkPlayerName(typeof body?.name === "string" ? body.name : "");
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 422 });
    if (!check.name) return NextResponse.json({ error: "NAME REQUIRED." }, { status: 400 });
    return NextResponse.json((await store.createPlayer(check.name)) satisfies PlayerInfo);
  } catch (err) {
    console.error("[aura] player registration failed", err);
    return NextResponse.json({ error: "PLAYER REGISTRY OFFLINE." }, { status: 503 });
  }
}
