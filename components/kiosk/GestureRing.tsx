"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { EngineGesture, Progress } from "@/lib/kiosk/gestureEngine";
import { GESTURE_LEGEND } from "@/lib/kiosk/machine";

const LABELS: Record<EngineGesture, { emoji: string; label: string }> = {
  ...GESTURE_LEGEND,
  battle: { emoji: "✌️✌️ x2", label: "AURA BATTLE" },
  solo_battle: { emoji: "✊✊", label: "AURA BATTLE" },
};

/**
 * Filling progress ring for the gesture currently being held. Always mounted
 * and absolutely positioned (see .gesture-ring): it fades in and out instead
 * of popping into the layout, so tracking flicker never shifts the UI.
 */
export function GestureRing({ progressRef }: { progressRef: RefObject<Progress> }) {
  const [shown, setShown] = useState<Progress>({ gesture: null, value: 0 });
  const last = useRef(shown);
  /** Last held gesture, so the label stays readable while the ring fades out. */
  const [labelFor, setLabelFor] = useState<EngineGesture | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = progressRef.current;
      if (p.gesture !== last.current.gesture || Math.abs(p.value - last.current.value) > 0.01) {
        last.current = p;
        setShown(p);
        if (p.gesture) setLabelFor(p.gesture);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progressRef]);

  const active = shown.gesture !== null && shown.value > 0.02;
  const r = 44;
  const circ = 2 * Math.PI * r;
  const info = labelFor ? LABELS[labelFor] : null;
  return (
    <div className={`gesture-ring ${active ? "gesture-ring--active" : ""}`} aria-live="polite" aria-hidden={!active}>
      <svg viewBox="0 0 100 100" className="gesture-ring__svg" aria-hidden>
        <circle cx="50" cy="50" r={r} className="gesture-ring__track" />
        <circle cx="50" cy="50" r={r} className="gesture-ring__fill" strokeDasharray={circ} strokeDashoffset={circ * (1 - shown.value)} />
      </svg>
      <span className="gesture-ring__emoji" aria-hidden>
        {info?.emoji}
      </span>
      <span className="gesture-ring__label">{info ? `HOLD · ${info.label}` : ""}</span>
    </div>
  );
}
