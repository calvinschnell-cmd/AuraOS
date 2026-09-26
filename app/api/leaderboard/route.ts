import { NextResponse } from "next/server";
import type { LeaderboardSnapshot } from "@/lib/kiosk/types";
import { buildNarrative } from "@/lib/leaderboard/narrative";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Top 50, the recent ticker, today's time series, and the narrative rows (rivalry, squad champion, streaks). */
export async function GET(): Promise<NextResponse> {
  const store = getScanStore();
  try {
    const [top, recent, totalToday, timeline, hottestHour, judgeSplit, battles] = await Promise.all([
      store.leaderboard(50),
      store.recentEntries(12),
      store.countToday(),
      store.timeline(),
      store.hottestHour(),
      store.judgeSplitToday(),
      store.recentBattles(500),
    ]);
    // Narrative rows are plain queries over the same history (no LLM): rivalries and streaks from
    // claimed battle slots, "most improved" from each ranked player's previous scan.
    const handles = [...new Set(top.map((e) => e.handle).filter((h): h is string => h !== null))];
    const entries = await store.entriesForHandles(handles);
    const narrative = buildNarrative(battles, entries);
    // Each row links to its card (phone standings, operator dashboard).
    const cards = await store.cardIdsForScans([...new Set([...top, ...recent].map((e) => e.scanId))]).catch(() => ({}) as Record<string, string>);
    const withCard = (e: (typeof top)[number]) => ({ ...e, cardId: cards[e.scanId] ?? null });
    const body: LeaderboardSnapshot = { top: top.map(withCard), recent: recent.map(withCard), totalToday, store: store.kind, timeline, hottestHour, judgeSplit, narrative, at: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[aura] leaderboard failed", err);
    return NextResponse.json({ error: "LEADERBOARD UNAVAILABLE." }, { status: 503 });
  }
}
