import { NextResponse } from "next/server";
import type { BattleCreateResponse } from "@/lib/kiosk/types";
import { BattleInputError, createBattle, parseBattleRequest } from "@/lib/server/battles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST JSON { mode: "duel" | "squad", players: [{ slot, scanId, pose }] }.
 * Every capture was already analyzed by /api/battle/scan, so this is pure
 * arithmetic (fit + pose totals, places, winner, gap, squad synergy) and
 * returns instantly. The commentary streams separately
 * (/api/battle/[id]/commentary) while the result reveal plays.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "EXPECTED JSON." }, { status: 400 });
  }
  try {
    const { mode, players } = parseBattleRequest(raw);
    const battle = await createBattle(mode, players);
    const body: BattleCreateResponse = { battle };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof BattleInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[aura] battle failed", err);
    return NextResponse.json({ error: "AURA SENSORS OVERHEATED. TRY AGAIN IN A MINUTE." }, { status: 503 });
  }
}
