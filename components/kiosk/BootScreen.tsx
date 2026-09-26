"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bootSequence } from "@/lib/kiosk/boot";
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
  const [p, setP] = useState<Progress>({ index: 0, chars: 0, status: false });
  // Kept in a ref so a parent re-render (camera status, gesture debug pushes)
  // never clears and restarts the pending typing timer: under load that would
  // keep the sequence stuck on its first line.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (p.index >= lines.length) {
      const id = window.setTimeout(() => onDoneRef.current(), DONE_MS * speed);
      return () => window.clearTimeout(id);
    }
    const line = lines[p.index];
    let ms: number;
    let next: Progress;
    if (p.chars < line.text.length) {
      // Uneven key timing reads more like typing than a fixed cadence.
      ms = CHAR_MS * (0.6 + ((p.chars * 7919) % 10) / 10);
      next = { ...p, chars: p.chars + 1 };
    } else if (line.status && !p.status) {
      ms = line.delay;
      next = { ...p, status: true };
    } else {
      ms = line.status ? LINE_GAP_MS : line.delay;
      next = { index: p.index + 1, chars: 0, status: false };
    }
    const id = window.setTimeout(() => setP(next), ms * speed);
    return () => window.clearTimeout(id);
  }, [p, lines, speed]);

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
