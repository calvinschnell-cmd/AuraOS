import type { FeedDetail } from "@/lib/feed/types";
import { getScanStore } from "./store";

/** Everything the single-result page (/r/[id]) shows for one card. */
export async function feedDetail(cardId: string): Promise<FeedDetail | null> {
  const store = getScanStore();
  const entry = await store.feedEntry(cardId);
  if (!entry) return null;
  const [battle, scan, children, leaderboard] = await Promise.all([
    entry.battleId ? store.getBattle(entry.battleId) : Promise.resolve(null),
    entry.scanId && !entry.battleId ? store.getById(entry.scanId) : Promise.resolve(null),
    entry.kind === "squad" ? store.childCards(entry.id) : Promise.resolve([]),
    entry.scanId && !entry.battleId ? store.entryForScan(entry.scanId) : Promise.resolve(null),
  ]);
  return {
    entry,
    battle,
    scan: scan
      ? {
          nickname: leaderboard?.nickname ?? scan.analysis.nickname,
          aura: scan.aura,
          verdict: scan.analysis.verdict,
          styles: scan.analysis.style_mix.map((m) => `${m.style} ${Math.round(m.percent)}%`).join(", "),
          handle: leaderboard?.handle ?? null,
        }
      : null,
    children,
  };
}
