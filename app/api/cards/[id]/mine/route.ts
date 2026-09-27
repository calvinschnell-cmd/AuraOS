import { NextResponse } from "next/server";
import { deviceIdFrom } from "@/lib/server/rateLimit";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET with X-Device-Id: is this card yours (scanned on this phone, or claimed
 * with THIS WAS ME from it)? Device ids never leave the server; the page only
 * learns yes / no, to show CHALLENGE A FRIEND instead of SCAN YOURS.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const device = deviceIdFrom(request.headers.get("x-device-id"));
  if (!device) return NextResponse.json({ mine: false });
  const card = await getScanStore()
    .getCard(id)
    .catch(() => null);
  return NextResponse.json({ mine: Boolean(card && !card.hidden && card.deviceId === device) }, { headers: { "Cache-Control": "no-store" } });
}
