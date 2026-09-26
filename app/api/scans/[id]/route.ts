import { NextResponse } from "next/server";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public read of one scan's result (no image was ever stored). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params;
  const store = getScanStore();
  try {
    const scan = await store.getById(id);
    if (!scan) return NextResponse.json({ error: "NOT FOUND" }, { status: 404 });
    const rank = await store.rankToday(scan.aura).catch(() => ({ position: 1, total: 1 }));
    return NextResponse.json({ id: scan.id, analysis: scan.analysis, breakdown: scan.breakdown, aura: scan.aura, rank, createdAt: scan.createdAt });
  } catch (err) {
    console.error("[aura] scan lookup failed", err);
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}
