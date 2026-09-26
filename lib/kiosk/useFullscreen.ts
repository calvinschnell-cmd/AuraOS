"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Browser full screen for the whole kiosk (F hotkey / top bar button).
 * Entering needs a user gesture (key press or click); Chrome --kiosk launches
 * are already full screen.
 */
export function useFullscreen(): { fullscreen: boolean; toggleFullscreen: () => void } {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const done = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: "hide" });
    done.catch((err: unknown) => console.warn("[aura] full screen unavailable", err));
  }, []);

  return { fullscreen, toggleFullscreen };
}
