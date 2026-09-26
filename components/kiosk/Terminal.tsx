"use client";

import { useEffect, useState } from "react";
import type { TerminalEntry } from "@/lib/kiosk/types";

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

  useEffect(() => {
    if (effectiveIndex >= entries.length) return;
    const entry = entries[effectiveIndex];
    const done = progress.chars >= entry.text.length;
    const id = window.setTimeout(
      () => {
        if (done) {
          setProgress({ index: effectiveIndex + 1, chars: 0 });
          setBaseId(firstId);
        } else {
          setProgress((p) => ({ index: p.index, chars: p.chars + 1 }));
        }
      },
      done ? lineGapMs : charMs,
    );
    return () => window.clearTimeout(id);
  }, [entries, effectiveIndex, progress.chars, charMs, lineGapMs, firstId]);

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
