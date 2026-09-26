import { NextResponse } from "next/server";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves card PNGs from the store (Tiger Data or memory). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const png = await getScanStore().getCardImage(id);
  if (!png) return NextResponse.json({ error: "NOT FOUND" }, { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
}
