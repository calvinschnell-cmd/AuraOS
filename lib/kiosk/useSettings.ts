"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type KioskSettings } from "./types";

// v2: new defaults (sideways camera, aura glow off) must win over stale saved settings.
const STORAGE_KEY = "aura-os.settings.v2";

function load(): KioskSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<KioskSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): [KioskSettings, (patch: Partial<KioskSettings>) => void] {
  const [settings, setSettings] = useState<KioskSettings>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private mode or blocked storage: settings just do not persist.
    }
  }, [settings]);

  const update = useCallback((patch: Partial<KioskSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return [settings, update];
}
