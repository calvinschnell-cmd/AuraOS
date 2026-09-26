"use client";

import { useEffect, useState } from "react";
import type { KioskMode } from "@/lib/kiosk/types";

export function TopBar({
  scansToday,
  mode,
  live,
  onToggleMode,
  fullscreen,
  onToggleFullscreen,
}: {
  scansToday: number;
  mode: KioskMode;
  live: boolean;
  onToggleMode: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    update();
    const id = window.setInterval(update, 10_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="top-bar">
      <div className="flex items-center gap-3">
        <span className="font-heading text-[11px] uppercase tracking-[0.2em]">AURA OS</span>
        <span className="hidden font-mono text-[10px] uppercase opacity-60 sm:inline">{mode} mode</span>
        <button type="button" className="top-bar__button" onClick={onToggleMode} title="Switch display mode">
          [{mode === "mirror" ? "SWITCH TO SCREEN" : "SWITCH TO MIRROR"}]
        </button>
        <button type="button" className="top-bar__button" onClick={onToggleFullscreen} title="Full screen (F)">
          [{fullscreen ? "EXIT FULL SCREEN" : "FULL SCREEN"}]
        </button>
      </div>
      <div className="flex items-center gap-4 font-mono text-[10px] uppercase">
        <span>SCANS TODAY: {scansToday}</span>
        <span className="flex items-center gap-1.5">
          <span className={`live-dot ${live ? "live-dot--on" : ""}`} aria-hidden />
          {live ? "LIVE" : "OFFLINE"}
        </span>
        <span className="tabular-nums">{clock}</span>
      </div>
    </header>
  );
}
