import { NextResponse } from "next/server";
import { feedDetail } from "@/lib/server/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: one feed entry with its battle / scan details and squad member cards. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const detail = await feedDetail(id).catch(() => null);
  if (!detail) return NextResponse.json({ error: "NOT FOUND." }, { status: 404 });
  return NextResponse.json(detail);
}
