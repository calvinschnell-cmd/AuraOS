"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clientId } from "@/lib/companion/identity";
import type { LeaderboardSnapshot } from "@/lib/kiosk/types";
import { formatAura } from "@/lib/scoring";
import { AppShell } from "./AppShell";
import { useIdentity } from "./Identity";
import { Standings } from "./Standings";

/** Same cadence as the mirror's own board (lib/kiosk/useLeaderboard). */
const POLL_MS = 5_000;

/**
 * /leaderboard on a phone (or the Devpost link on a desktop): the live top
 * 25 from the mirror and phones, your own best entry highlighted (matched by
 * this phone or your AURA ID) and pinned under the list when it is outside
 * the top. Every row opens its card.
 */
export function BoardScreen() {
  const [player] = useIdentity();
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const handle = player?.handle ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/leaderboard${handle ? `?handle=${encodeURIComponent(handle)}` : ""}`, { cache: "no-store", headers: { "X-Device-Id": clientId() } });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as LeaderboardSnapshot;
        if (!cancelled) {
          setSnapshot(body);
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [handle]);

  const you = snapshot?.you ?? null;
  return (
    <AppShell
      title="LEADERBOARD"
      tab="board"
      action={
        <Link href="/tv" className="font-heading">
          BIG SCREEN ↗
        </Link>
      }
    >
      <div className="wordmark">
        <h1 className="wordmark__title font-heading uppercase">LEADERBOARD</h1>
        <p className="wordmark__sub wordmark__sub--caret font-mono uppercase">
          LIVE · 🪞 MIRROR + 📱 PHONE SCANS{snapshot ? ` · ${snapshot.totalToday} TODAY` : ""}
        </p>
      </div>
      {you ? (
        <div className="board-you font-heading">
          <span>YOUR BEST: #{you.rank}</span>
          <span className="font-number">{formatAura(you.entry.aura, true)}</span>
        </div>
      ) : (
        <Link href="/scan" className="board-you board-you--cta font-heading">
          <span>NOT ON THE BOARD YET</span>
          <span>SCAN YOUR FIT →</span>
        </Link>
      )}
      {offline && <p className="companion__note">RECONNECTING...</p>}
      <Standings snapshot={snapshot} limit={25} />
    </AppShell>
  );
}
