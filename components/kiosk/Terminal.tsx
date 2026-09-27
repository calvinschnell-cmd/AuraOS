"use client";

import { useEffect, useRef, useState } from "react";
import type { TerminalEntry } from "@/lib/kiosk/types";

/** A long line never takes longer than this to type (before the catch-up speed-up). */
const MAX_LINE_MS = 900;

interface Progress {
  index: number;
  chars: number;
}

/**
 * Types entries out character by character with a blinking block cursor.
 * Entries must only ever be appended (ids increasing); remount to reset.
 */
export function Terminal({
  entries,
  charMs = 16,
  lineGapMs = 140,
  maxLines = 6,
  className = "",
}: {
  entries: TerminalEntry[];
  charMs?: number;
  lineGapMs?: number;
  maxLines?: number;
  className?: string;
}) {
  // Lines that already exist on mount count as typed: only new lines type out
  // (the terminal is remounted when the result panel takes its place).
  const [progress, setProgress] = useState<Progress>(() => ({ index: entries.length, chars: 0 }));
  const firstId = entries[0]?.id ?? 0;
  const [baseId, setBaseId] = useState(firstId);

  // Entries are capped, so the array can slide: convert ids into indexes.
  const offset = baseId - firstId;
  const effectiveIndex = progress.index + offset;

  // Typing runs on the clock, not one character per timer tick: the kiosk's
  // main thread is busy (mannequin, trackers) and re-renders often, which used
  // to delay or restart every tick. Each line remembers when it started.
  const lineClock = useRef<{ id: number; start: number } | null>(null);
  useEffect(() => {
    if (effectiveIndex >= entries.length) return;
    const entry = entries[effectiveIndex];
    if (lineClock.current?.id !== entry.id) lineClock.current = { id: entry.id, start: performance.now() };
    const start = lineClock.current.start;
    // Lines queued behind this one: type faster so the terminal keeps up with the kiosk.
    const speed = entries.length - effectiveIndex;
    const typeMs = Math.min(entry.text.length * charMs, MAX_LINE_MS) / speed;
    const gapMs = lineGapMs / speed;
    let timer = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= typeMs + gapMs) {
        setProgress({ index: effectiveIndex + 1, chars: 0 });
        setBaseId(firstId);
        return;
      }
      const chars = typeMs <= 0 ? entry.text.length : Math.min(entry.text.length, Math.ceil((elapsed / typeMs) * entry.text.length));
      setProgress((p) => (p.chars === chars ? p : { index: p.index, chars }));
      timer = window.setTimeout(tick, charMs);
    };
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, [entries, effectiveIndex, charMs, lineGapMs, firstId]);

  const typed = entries.slice(0, effectiveIndex);
  const current = entries[effectiveIndex];
  const lines = [...typed.map((e) => e.text), current ? current.text.slice(0, progress.chars) : null].filter(
    (l): l is string => l !== null,
  );
  const visible = lines.slice(-maxLines);

  return (
    <div className={`terminal ${className}`} aria-live="polite">
      {visible.map((line, i) => (
        <div key={`${effectiveIndex}-${i}`} className="terminal__line">
          {line}
          {i === visible.length - 1 && <span className="terminal__cursor" aria-hidden />}
        </div>
      ))}
      {visible.length === 0 && (
        <div className="terminal__line">
          <span className="terminal__cursor" aria-hidden />
        </div>
      )}
    </div>
  );
}
