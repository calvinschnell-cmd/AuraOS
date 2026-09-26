import { NextResponse } from "next/server";
import { feedSince } from "@/lib/feed/types";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?before=ISO&limit=N: the public feed (saved cards from the last 30 minutes), newest first. */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") ?? "", 10) || 20));
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : null;
  try {
    const entries = await getScanStore().feed(limit, before, feedSince());
    return NextResponse.json({ entries, next: entries.length === limit ? entries[entries.length - 1].createdAt : null });
  } catch (err) {
    console.error("[aura] feed failed", err);
    return NextResponse.json({ error: "FEED UNAVAILABLE." }, { status: 503 });
  }
}
