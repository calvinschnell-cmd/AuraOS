"use client";

import { useEffect, useRef, useState } from "react";

export interface QueuedChallenger {
  id: number;
  name: string;
  target: number;
  cardId: string;
}

/**
 * The challenger queue ("BEAT THIS SCORE" tapped on a shared card): polled
 * while the kiosk is at its mode select, so the mirror can call people up.
 * `joinedTick` bumps when someone new joins (the announcer greets them).
 */
export function useChallenges(active: boolean, intervalMs = 5000): { queue: QueuedChallenger[]; newest: QueuedChallenger | null; joinedTick: number } {
  const [queue, setQueue] = useState<QueuedChallenger[]>([]);
  const [joinedTick, setJoinedTick] = useState(0);
  const [newest, setNewest] = useState<QueuedChallenger | null>(null);
  const lastId = useRef(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/challenges", { cache: "no-store" });
        const body = (await res.json()) as { challenges?: QueuedChallenger[] };
        if (cancelled || !body.challenges) return;
        setQueue(body.challenges);
        const latest = body.challenges[body.challenges.length - 1];
        if (latest && latest.id > lastId.current) {
          // The first load only remembers where we are (no greeting for old entries).
          if (lastId.current > 0) {
            setNewest(latest);
            setJoinedTick((t) => t + 1);
          }
          lastId.current = latest.id;
        } else if (lastId.current === 0) {
          lastId.current = -1;
        }
      } catch {
        // offline: keep the last queue
      }
    };
    void load();
    const id = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, intervalMs]);
  return { queue, newest, joinedTick };
}
