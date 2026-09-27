import { NextResponse } from "next/server";
import { isLeaderboardBoard, type LeaderboardSnapshot } from "@/lib/kiosk/types";
import { buildNarrative } from "@/lib/leaderboard/narrative";
import { deviceIdFrom } from "@/lib/server/rateLimit";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Top 50, the recent ticker, today's time series, and the narrative rows (rivalry, squad champion, streaks).
 * Phones add X-Device-Id (and ?handle= their AURA ID): `you` is their best entry and rank, even outside the top.
 * ?board=solo|duo|squad|mobile ranks `top` and `you` on that board only (scores are not comparable
 * across boards); without it every entry ranks together (the TV, the mirror, admin).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const store = getScanStore();
  const device = deviceIdFrom(request.headers.get("x-device-id"));
  const params = new URL(request.url).searchParams;
  const handle = params.get("handle")?.trim().slice(0, 40) || null;
  const boardParam = params.get("board");
  const board = isLeaderboardBoard(boardParam) ? boardParam : undefined;
  try {
    const [top, recent, totalToday, timeline, hottestHour, judgeSplit, battles, you] = await Promise.all([
      store.leaderboard(50, board),
      store.recentEntries(12),
      store.countToday(),
      store.timeline(),
      store.hottestHour(),
      store.judgeSplitToday(),
      store.recentBattles(500),
      device || handle ? store.viewerBest(device, handle, board).catch(() => null) : Promise.resolve(null),
    ]);
    // Narrative rows are plain queries over the same history (no LLM): rivalries and streaks from
    // claimed battle slots, "most improved" from each ranked player's previous scan.
    const handles = [...new Set(top.map((e) => e.handle).filter((h): h is string => h !== null))];
    const entries = await store.entriesForHandles(handles);
    const narrative = buildNarrative(battles, entries);
    // Each row links to its card (phone standings, operator dashboard).
    const scanIds = [...new Set([...top, ...recent, ...(you ? [you.entry] : [])].map((e) => e.scanId))];
    const cards = await store.cardIdsForScans(scanIds).catch(() => ({}) as Record<string, string>);
    const withCard = (e: (typeof top)[number]) => ({ ...e, cardId: cards[e.scanId] ?? null });
    const body: LeaderboardSnapshot = {
      top: top.map(withCard),
      recent: recent.map(withCard),
      totalToday,
      store: store.kind,
      timeline,
      hottestHour,
      judgeSplit,
      narrative,
      at: Date.now(),
      you: you ? { entry: withCard(you.entry), rank: you.rank } : null,
      ...(board ? { board } : {}),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[aura] leaderboard failed", err);
    return NextResponse.json({ error: "LEADERBOARD UNAVAILABLE." }, { status: 503 });
  }
}
