"use client";

import { useEffect, useState } from "react";

const CURTAIN_MS = 900;

/**
 * Plays once when the boot sequence finishes: the boot screen is cut across
 * the middle and the two halves slide open (top up, bottom down), with a
 * cyan seam flash. Mount it keyed by boot count so every boot replays it.
 */
export function BootCurtain() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setDone(true), CURTAIN_MS);
    return () => window.clearTimeout(id);
  }, []);
  if (done) return null;
  return (
    <div className="boot-curtain" aria-hidden>
      <div className="boot-curtain__half boot-curtain__half--top" />
      <div className="boot-curtain__half boot-curtain__half--bottom" />
      <div className="boot-curtain__seam" />
    </div>
  );
}
