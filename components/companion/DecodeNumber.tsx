"use client";

import { useEffect, useState } from "react";
import { formatAura } from "@/lib/scoring";

const DURATION_MS = 650;

/**
 * An aura number that "decodes" into place like a terminal readout: digits
 * flicker, then settle left to right. Signs and commas never move, so the
 * width stays put. Plain text for reduced motion and before hydration.
 */
export function DecodeNumber({ value, signed = false, className = "" }: { value: number; signed?: boolean; className?: string }) {
  const text = formatAura(value, signed);
  // The frame being shown for `text` (null: show it as is).
  const [frame, setFrame] = useState<{ text: string; shown: string } | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      const settled = Math.floor(p * text.length);
      const shown = [...text].map((ch, i) => (i < settled || !/\d/.test(ch) ? ch : String(Math.floor(Math.random() * 10)))).join("");
      setFrame(p < 1 ? { text, shown } : null);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{frame?.text === text ? frame.shown : text}</span>
    </span>
  );
}
