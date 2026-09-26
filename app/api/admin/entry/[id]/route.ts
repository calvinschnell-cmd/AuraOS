import { NextResponse } from "next/server";
import { adminKeyFrom, isAdmin } from "@/lib/server/admin";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE a leaderboard entry. Requires the x-admin-key header. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isAdmin(adminKeyFrom(request))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await context.params;
  try {
    const deleted = await getScanStore().deleteEntry(id);
    return NextResponse.json({ ok: deleted }, { status: deleted ? 200 : 404 });
  } catch (err) {
    console.error("[aura] delete entry failed", err);
    return NextResponse.json({ error: "DELETE FAILED" }, { status: 503 });
  }
}
