"use client";

import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

/** Normalize a KeyboardEvent to the keys used in a HotkeyMap ("Space", "W", "Escape"). */
export function hotkeyName(event: KeyboardEvent): string {
  if (event.key === " ") return "Space";
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable;
}

/** Operator hotkeys. Ignored while typing in form controls. */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const name = hotkeyName(event);
      const handler = mapRef.current[name];
      if (!handler) return;
      if (isTypingTarget(event.target) && name !== "Escape") return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
