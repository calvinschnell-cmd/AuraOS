import { NextResponse } from "next/server";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET a player's scan history (aura over the event). */
export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }): Promise<NextResponse> {
  const { handle } = await params;
  try {
    const history = await getScanStore().playerHistory(decodeURIComponent(handle).toUpperCase());
    if (!history) return NextResponse.json({ error: "AURA ID NOT FOUND." }, { status: 404 });
    return NextResponse.json(history);
  } catch (err) {
    console.error("[aura] player history failed", err);
    return NextResponse.json({ error: "HISTORY UNAVAILABLE." }, { status: 503 });
  }
}
