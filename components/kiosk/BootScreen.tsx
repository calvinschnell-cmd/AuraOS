"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bootSequence, type BootLine } from "@/lib/kiosk/boot";
import type { CameraStatus, KioskMode } from "@/lib/kiosk/types";

interface Progress {
  /** Line being typed. */
  index: number;
  /** Characters of that line typed so far. */
  chars: number;
  /** Status stamp shown for the current line. */
  status: boolean;
}

const CHAR_MS = 18;
const LINE_GAP_MS = 140;
const DONE_MS = 650;
/** Time multiplier for the session-end reboot. */
const QUICK_SPEED = 0.25;

/** When each boot line starts typing, finishes, gets its status stamp and ends (ms from mount). */
function bootTimeline(lines: BootLine[], speed: number): { start: number; typed: number; stamped: number; end: number }[] {
  const out: { start: number; typed: number; stamped: number; end: number }[] = [];
  let t = 0;
  for (const line of lines) {
    const start = t;
    // Uneven key timing reads more like typing than a fixed cadence.
    for (let c = 0; c < line.text.length; c++) t += CHAR_MS * (0.6 + ((c * 7919) % 10) / 10) * speed;
    const typed = t;
    if (line.status) t += line.delay * speed;
    const stamped = t;
    t += (line.status ? LINE_GAP_MS : line.delay) * speed;
    out.push({ start, typed, stamped, end: t });
  }
  return out;
}

/** Boot sequence typed out character by character with a blinking cursor. */
export function BootScreen({
  mode,
  databaseConfigured,
  mockMode,
  cameraStatus,
  quick = false,
  onDone,
}: {
  mode: KioskMode;
  databaseConfigured: boolean;
  mockMode: boolean;
  cameraStatus: CameraStatus;
  /** Session-end reboot: same sequence at 4x speed. */
  quick?: boolean;
  onDone: () => void;
}) {
  const lines = useMemo(
    () => bootSequence({ mode, databaseConfigured, mockMode, cameraStatus, quick }),
    [mode, databaseConfigured, mockMode, cameraStatus, quick],
  );
  const speed = quick ? QUICK_SPEED : 1;
  // Kept in a ref so a parent re-render (camera status, gesture debug pushes)
  // never restarts the sequence.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // The whole sequence as a timeline: when each line starts typing, finishes,
  // gets its status stamp and ends. What is on screen comes from the time since
  // mount, so a busy main thread (the mannequin rebuilding on a reboot, the
  // trackers) can delay frames but never stretch the boot out.
  const timeline = useMemo(() => bootTimeline(lines, speed), [lines, speed]);
  const total = (timeline.at(-1)?.end ?? 0) + DONE_MS * speed;

  const startedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt.current === null) startedAt.current = performance.now();
    const start = startedAt.current;
    let timer = 0;
    const tick = () => {
      const e = performance.now() - start;
      setElapsed(e);
      if (e >= total) {
        onDoneRef.current();
        return;
      }
      timer = window.setTimeout(tick, CHAR_MS);
    };
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, [total]);

  const at = timeline.findIndex((tl) => elapsed < tl.end);
  const index = at === -1 ? lines.length : at;
  const current = timeline[index];
  const p: Progress = current
    ? {
        index,
        chars: Math.min(lines[index].text.length, Math.max(0, Math.ceil(((elapsed - current.start) / Math.max(1, current.typed - current.start)) * lines[index].text.length))),
        status: elapsed >= current.stamped,
      }
    : { index, chars: 0, status: false };

  return (
    <div className="boot-screen">
      <div className="boot-screen__box">
        {lines.slice(0, Math.min(p.index + 1, lines.length)).map((line, i) => {
          const current = i === p.index;
          const text = current ? line.text.slice(0, p.chars) : line.text;
          const showStatus = line.status && (!current || p.status);
          return (
            <div key={i} className="boot-screen__line">
              <span className="opacity-60">&gt;</span> {text}
              {showStatus && <span className={`boot-screen__status ${line.status === "OK" ? "" : "boot-screen__status--warn"}`}> {line.status}</span>}
              {current && <span className="terminal__cursor" aria-hidden />}
            </div>
          );
        })}
        {p.index >= lines.length && (
          <div className="boot-screen__line">
            <span className="terminal__cursor" aria-hidden />
          </div>
        )}
      </div>
    </div>
  );
}
