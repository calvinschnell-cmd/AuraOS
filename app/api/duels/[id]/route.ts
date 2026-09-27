import { NextResponse } from "next/server";
import { isDuelId } from "@/lib/duels/types";
import { duelView } from "@/lib/server/duels";
import { deviceIdFrom } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET with X-Device-Id: the challenge as this phone may see it (score hidden until it has scanned). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  if (!isDuelId(id)) return NextResponse.json({ error: "NOT FOUND." }, { status: 404 });
  try {
    const view = await duelView(id, deviceIdFrom(request.headers.get("x-device-id")));
    if (!view) return NextResponse.json({ error: "NOT FOUND." }, { status: 404 });
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[aura] challenge view failed", err);
    return NextResponse.json({ error: "UNAVAILABLE." }, { status: 503 });
  }
}
