"use client";

import { useEffect, useRef, useState } from "react";
import type { LeaderboardEntry, LeaderboardSnapshot } from "./types";

export interface LeaderboardState {
  snapshot: LeaderboardSnapshot | null;
  /** The entry that just became #1 (bumps `kingTick`). */
  king: LeaderboardEntry | null;
  kingTick: number;
  error: boolean;
}

/** Live leaderboard: polls /api/leaderboard (Tiger Data or in-memory behind it). */
export function useLeaderboard(pollMs = 5000, enabled = true): LeaderboardState {
  const [state, setState] = useState<LeaderboardState>({ snapshot: null, king: null, kingTick: 0, error: false });
  const prevTop = useRef<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const snapshot = (await res.json()) as LeaderboardSnapshot;
        if (cancelled) return;
        const top = snapshot.top[0] ?? null;
        const topId = top?.id ?? null;
        const newKing = seeded.current && topId !== null && prevTop.current !== null && topId !== prevTop.current;
        prevTop.current = topId;
        seeded.current = true;
        setState((s) => ({ snapshot, error: false, king: newKing ? top : s.king, kingTick: newKing ? s.kingTick + 1 : s.kingTick }));
      } catch {
        if (!cancelled) setState((s) => ({ ...s, error: true }));
      }
    };
    void load();
    const interval = window.setInterval(load, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pollMs, enabled]);

  return state;
}
