import { NextResponse } from "next/server";
import { deviceIdFrom } from "@/lib/server/rateLimit";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { handle, slot? }: "this was me". Attaches the player's AURA ID to
 * their battle slot (rivalries and streaks are keyed on it) or to a solo
 * scan's leaderboard entry. Only unclaimed spots can be claimed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { handle?: unknown; slot?: unknown } | null;
  const handle = typeof body?.handle === "string" ? body.handle.trim() : "";
  const store = getScanStore();
  try {
    const player = handle ? await store.getPlayer(handle) : null;
    if (!player) return NextResponse.json({ error: "UNKNOWN AURA ID." }, { status: 404 });
    const entry = await store.feedEntry(id);
    if (!entry) return NextResponse.json({ error: "NOT FOUND." }, { status: 404 });
    let ok = false;
    if (entry.battleId) {
      const slot = typeof body?.slot === "number" ? body.slot : entry.slot;
      if (slot === null || slot === undefined || !Number.isInteger(slot)) return NextResponse.json({ error: "PICK YOUR PLAYER SLOT." }, { status: 400 });
      ok = await store.claimBattleSlot(entry.battleId, slot, player.handle);
      // Their leaderboard row (added when the battle card was saved) carries the name too.
      if (ok) {
        const scanId = (await store.getBattle(entry.battleId))?.players.find((p) => p.slot === slot)?.scanId;
        if (scanId) await store.setEntryHandle(scanId, player.handle).catch(() => false);
      }
    } else if (entry.scanId) {
      ok = await store.setEntryHandle(entry.scanId, player.handle);
    }
    if (!ok) return NextResponse.json({ error: "ALREADY CLAIMED." }, { status: 409 });
    // A solo card claimed from a phone is that phone's: it can start a challenge from it.
    const device = deviceIdFrom(request.headers.get("x-device-id"));
    if (device && !entry.battleId) await store.setCardDevice(entry.id, device).catch(() => false);
    return NextResponse.json({ ok: true, handle: player.handle });
  } catch (err) {
    console.error("[aura] claim failed", err);
    return NextResponse.json({ error: "CLAIMS UNAVAILABLE." }, { status: 503 });
  }
}
