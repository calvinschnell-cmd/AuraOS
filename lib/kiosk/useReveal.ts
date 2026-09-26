"use client";

import { useEffect, useMemo, useState } from "react";
import { buildRevealTimeline, revealState, type RevealState, type RevealTimeline } from "./reveal";
import type { KioskState, ScanResult } from "./types";

export interface Reveal {
  timeline: RevealTimeline;
  state: RevealState;
  elapsedMs: number;
}

/**
 * Drives the result reveal clock. Returns null outside RESULT/NAME_ENTRY/CLAIM.
 * Everything is shown at once after the first reveal (`alreadyShown`, e.g.
 * back from name entry), in NAME_ENTRY / CLAIM, and once the timeline ends.
 */
export function useReveal(scan: ScanResult | null, enteredAt: number, kioskState: KioskState, alreadyShown = false): Reveal | null {
  const active = scan !== null && (kioskState === "RESULT" || kioskState === "NAME_ENTRY" || kioskState === "CLAIM");
  const animate = kioskState === "RESULT" && !alreadyShown;
  const timeline = useMemo(() => (scan ? buildRevealTimeline(scan) : null), [scan]);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active || !animate || !timeline) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const e = Date.now() - enteredAt;
      // ~30fps is plenty for typed digits and staggered boxes.
      if (e - last >= 33) {
        last = e;
        setElapsed(e);
      }
      if (e < timeline.doneAt + 100) raf = requestAnimationFrame(tick);
      else setElapsed(timeline.doneAt + 100);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, animate, timeline, enteredAt]);

  if (!active || !timeline || !scan) return null;
  const elapsedMs = animate ? elapsed : timeline.doneAt + 100;
  return { timeline, state: revealState(timeline, elapsedMs), elapsedMs };
}
