"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { clientId } from "@/lib/companion/identity";
import { LEADERBOARD_BOARDS, type LeaderboardBoard, type LeaderboardSnapshot } from "@/lib/kiosk/types";
import { formatAura } from "@/lib/scoring";
import { AppShell } from "./AppShell";
import { useIdentity } from "./Identity";
import { Standings } from "./Standings";

/** Same cadence as the mirror's own board (lib/kiosk/useLeaderboard). */
const POLL_MS = 5_000;

/** Tab label, what the board ranks (scores only compare within one), and its empty state. */
const BOARDS: Record<LeaderboardBoard, { tab: string; sub: string; you: string; empty: string }> = {
  solo: { tab: "SOLOS", sub: "🪞 MIRROR SOLO SCANS · FIT ONLY", you: "YOUR BEST SOLO", empty: "NO MIRROR SOLO SCANS YET. DOUBLE PEACE AT THE MIRROR." },
  duo: { tab: "DUOS", sub: "⚔️ 1V1 BATTLES · FIT + POSE", you: "YOUR BEST 1V1", empty: "NO 1V1 BATTLES YET. TWO FISTS AT THE MIRROR." },
  squad: { tab: "GROUPS", sub: "👥 SQUAD BATTLES · FIT + POSE", you: "YOUR BEST SQUAD", empty: "NO SQUAD BATTLES YET. THUMBS UP AT THE MIRROR." },
  mobile: { tab: "MOBILE", sub: "📱 PHONE UPLOADS · FIT ONLY", you: "YOUR BEST UPLOAD", empty: "NO PHONE UPLOADS YET. SCAN YOUR FIT FROM YOUR PHONE." },
};

/**
 * /leaderboard on a phone (or the Devpost link on a desktop): four boards,
 * because the scores are not comparable (battles add the pose to the fit,
 * solo and phone scans do not). Each tab has its own top 25 and your own best
 * entry on that board (matched by this phone or your AURA ID), pinned under
 * the list when it is outside the top. Every row opens its card. The tab lives
 * in the URL (?board=).
 */
export function BoardScreen({ initialBoard = "solo" }: { initialBoard?: LeaderboardBoard }) {
  const [player] = useIdentity();
  const [board, setBoard] = useState<LeaderboardBoard>(initialBoard);
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const handle = player?.handle ?? null;

  const choose = (b: LeaderboardBoard) => {
    if (b === board) return;
    setBoard(b);
    setSnapshot(null);
    const url = new URL(window.location.href);
    url.searchParams.set("board", b);
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const q = new URLSearchParams({ board });
        if (handle) q.set("handle", handle);
        const res = await fetch(`/api/leaderboard?${q}`, { cache: "no-store", headers: { "X-Device-Id": clientId() } });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as LeaderboardSnapshot;
        // A slow reply for the tab we just left must not overwrite the new one.
        if (!cancelled && (body.board ?? board) === board) {
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
  }, [handle, board]);

  const meta = BOARDS[board];
  const you = snapshot?.you ?? null;
  const index = LEADERBOARD_BOARDS.indexOf(board);
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
          LIVE · {meta.sub}
          {snapshot ? ` · ${snapshot.totalToday} SCANS TODAY` : ""}
        </p>
      </div>
      <div className="feed-tabs feed-tabs--4" role="tablist" aria-label="Leaderboards">
        <span className="feed-tabs__slider" style={{ transform: `translateX(${index * 100}%)` } as CSSProperties} aria-hidden />
        {LEADERBOARD_BOARDS.map((b) => (
          <button key={b} type="button" role="tab" aria-selected={b === board} className={`feed-tabs__tab font-heading ${b === board ? "feed-tabs__tab--on" : ""}`} onClick={() => choose(b)}>
            {BOARDS[b].tab}
          </button>
        ))}
      </div>
      {you ? (
        <div className="board-you font-heading">
          <span>
            {meta.you}: #{you.rank}
          </span>
          <span className="font-number">{formatAura(you.entry.aura, true)}</span>
        </div>
      ) : (
        <Link href="/scan" className="board-you board-you--cta font-heading">
          <span>NOT ON THIS BOARD YET</span>
          <span>SCAN YOUR FIT →</span>
        </Link>
      )}
      {offline && <p className="companion__note">RECONNECTING...</p>}
      <Standings key={board} snapshot={snapshot} limit={25} emptyNote={meta.empty} />
    </AppShell>
  );
}
