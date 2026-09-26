/**
 * Where the kiosk background track loops, in seconds of the track: it plays
 * from 0:00, then repeats [start, end) forever (start > 0 = an intro that plays
 * once). Set and saved in /music-lab, stored on the kiosk laptop's server
 * (/api/music-loop), picked up by the mirror without a reload.
 */
export interface MusicLoop {
  start: number;
  end: number;
}

/** The first 1:22 of the track (the rest is its ending). */
export const DEFAULT_LOOP: MusicLoop = { start: 0, end: 82 };

/** Shortest loop allowed (anything shorter stutters). */
export const MIN_LOOP_S = 1;
/** Loop points are kept to the millisecond. */
const round = (s: number) => Math.round(s * 1000) / 1000;

/** A usable loop from untrusted input, or null. `trackLength` (when known) caps the end. */
export function parseLoop(input: unknown, trackLength?: number): MusicLoop | null {
  const o = input as Partial<MusicLoop> | null;
  if (!o || typeof o.start !== "number" || typeof o.end !== "number" || !Number.isFinite(o.start) || !Number.isFinite(o.end)) return null;
  const max = trackLength ?? 60 * 60;
  const start = round(o.start);
  const end = round(o.end);
  if (start < 0 || end > max + 0.001 || end - start < MIN_LOOP_S) return null;
  return { start, end: Math.min(end, max) };
}

/** m:ss.s for the UI. */
export function formatLoopTime(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}
