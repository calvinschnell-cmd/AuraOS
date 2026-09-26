import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/env";
import { isAdmin } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { key } -> { ok }. Also reports whether an ADMIN_KEY is configured at all. */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { key?: string };
  if (!getAdminKey()) return NextResponse.json({ ok: false, configured: false, error: "ADMIN_KEY IS NOT SET ON THE SERVER." }, { status: 503 });
  return NextResponse.json({ ok: isAdmin(body.key), configured: true }, { status: isAdmin(body.key) ? 200 : 401 });
}
