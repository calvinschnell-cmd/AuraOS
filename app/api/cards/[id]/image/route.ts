import { NextResponse } from "next/server";
import { IMAGE_MIME, sniffImage } from "@/lib/server/imageSafety";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves card images from the store (Tiger Data or memory): PNG from the mirror, JPEG from phones. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const png = await getScanStore().getCardImage(id);
  if (!png) return NextResponse.json({ error: "NOT FOUND" }, { status: 404 });
  const kind = sniffImage(png);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": kind ? IMAGE_MIME[kind] : "image/png", "Cache-Control": "public, max-age=600" } });
}
