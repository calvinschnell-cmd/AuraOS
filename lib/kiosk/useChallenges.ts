"use client";

import { useEffect, useRef, useState } from "react";

export interface QueuedChallenger {
  id: number;
  name: string;
  /** The score they are chasing (0: a walk-in the operator signed up). */
  target: number;
  cardId: string;
  at?: number;
}

/** The operator called someone up from the dashboard (the mirror announces them). */
export interface CalledChallenger {
  seq: number;
  name: string;
  target: number;
  at: number;
}

/**
 * The challenger queue ("BEAT THIS SCORE" tapped on a shared card, or a
 * walk-in signed up at /operator): polled while the kiosk is at its mode
 * select, so the mirror can call people up. `joinedTick` bumps when someone
 * new joins from a card (the announcer greets them); `calledTick` when the
 * operator calls someone up.
 */
export function useChallenges(
  active: boolean,
  intervalMs = 5000,
): { queue: QueuedChallenger[]; newest: QueuedChallenger | null; joinedTick: number; called: CalledChallenger | null; calledTick: number } {
  const [queue, setQueue] = useState<QueuedChallenger[]>([]);
  const [joinedTick, setJoinedTick] = useState(0);
  const [newest, setNewest] = useState<QueuedChallenger | null>(null);
  const [called, setCalled] = useState<CalledChallenger | null>(null);
  const [calledTick, setCalledTick] = useState(0);
  const lastId = useRef(0);
  const lastCallSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/challenges", { cache: "no-store" });
        const body = (await res.json()) as { challenges?: QueuedChallenger[]; called?: CalledChallenger | null };
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
        // Same for call-ups: only ones made after the mirror started listening.
        const seq = body.called?.seq ?? 0;
        if (lastCallSeq.current === null) lastCallSeq.current = seq;
        else if (body.called && seq > lastCallSeq.current) {
          lastCallSeq.current = seq;
          setCalled(body.called);
          setCalledTick((t) => t + 1);
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
  return { queue, newest, joinedTick, called, calledTick };
}
