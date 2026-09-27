import { NextResponse } from "next/server";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Open pages drop cards an admin hid within this window (they poll every few seconds). */
const REMOVED_WINDOW_MS = 60 * 60 * 1000;

/**
 * GET ?before=ISO&limit=N: the public feed (every saved card, mirror and
 * phone), newest first, paged by created_at. `removed`: cards hidden by an
 * admin in the last hour, so open pages can drop them without a refresh.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") ?? "", 10) || 20));
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : null;
  const store = getScanStore();
  try {
    const [entries, removed] = await Promise.all([
      store.feed(limit, before, null),
      before ? Promise.resolve([]) : store.hiddenCardIds(new Date(Date.now() - REMOVED_WINDOW_MS).toISOString()).catch(() => []),
    ]);
    return NextResponse.json({ entries, next: entries.length === limit ? entries[entries.length - 1].createdAt : null, removed }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[aura] feed failed", err);
    return NextResponse.json({ error: "FEED UNAVAILABLE." }, { status: 503 });
  }
}
