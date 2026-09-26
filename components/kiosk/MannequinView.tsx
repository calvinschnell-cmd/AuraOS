"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { GenerateOptions } from "@/lib/clothing/generator";
import type { KioskMode, KioskState, SessionState } from "@/lib/kiosk/types";
import { MannequinScene } from "@/lib/mannequin/scene";
import { useMannequinDirector } from "@/lib/mannequin/useMannequinDirector";

export interface MannequinViewProps {
  mode: KioskMode;
  state: KioskState;
  session: SessionState;
  performanceMode: boolean;
  onFps?: (fps: number) => void;
  className?: string;
  generateOptions?: GenerateOptions;
  /** Slot-machine tick as each clothing slot locks (sound). */
  onSlotLock?: (index: number) => void;
  /** Battle overlay drawn under each line-up figure (xs: screen x 0-1 per figure). */
  crewOverlay?: (xs: number[]) => ReactNode;
}

/**
 * Hosts the Three.js mannequin. Presentation only: the director hook decides
 * what the figure does from kiosk state, so both layouts behave identically.
 */
const NO_OPTIONS: GenerateOptions = {};

/** Mirror panel: frame the guy by height (see MannequinScene.setWidthFraming). */
const MIRROR_WIDTH_FRAMING = 0.55;

export function MannequinView({ mode, state, session, performanceMode, onFps, className = "", generateOptions = NO_OPTIONS, onSlotLock, crewOverlay }: MannequinViewProps) {
  const sceneRef = useRef<MannequinScene | null>(null);
  const [ready, setReady] = useState(false);
  const [flashTick, setFlashTick] = useState(0);
  const [slotTick, setSlotTick] = useState(0);
  const onFpsRef = useRef(onFps);
  const onSlotLockRef = useRef(onSlotLock);
  useEffect(() => {
    onFpsRef.current = onFps;
    onSlotLockRef.current = onSlotLock;
  }, [onFps, onSlotLock]);

  // Both layouts show the full shaded model: an outline alone does not read as an outfit
  // through the glass. "edges" stays for the certificate line art.
  const renderMode = "solid" as const;

  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas) {
        sceneRef.current = new MannequinScene(canvas, {
          mode: renderMode,
          performanceMode,
          onFps: (fps) => onFpsRef.current?.(fps),
        });
        setReady(true);
      } else {
        sceneRef.current?.dispose();
        sceneRef.current = null;
        setReady(false);
      }
    },
    // The scene is created once; mode and performance changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    sceneRef.current?.setMode(renderMode);
  }, [renderMode, ready]);

  useEffect(() => {
    sceneRef.current?.setPerformanceMode(performanceMode);
  }, [performanceMode, ready]);

  useEffect(() => {
    sceneRef.current?.setWidthFraming(mode === "mirror" ? MIRROR_WIDTH_FRAMING : 1);
  }, [mode, ready]);

  useMannequinDirector(
    sceneRef,
    ready,
    state,
    session,
    {
      onFlash: () => setFlashTick((t) => t + 1),
      onSlotLock: (i) => {
        setSlotTick((t) => t + 1);
        onSlotLockRef.current?.(i);
      },
    },
    generateOptions,
  );

  // Where each battle figure stands on screen (for the stat rows under them).
  const [crewXs, setCrewXs] = useState<number[]>([]);
  const wantsCrew = Boolean(crewOverlay);
  useEffect(() => {
    if (!wantsCrew || !ready) return;
    const read = () => {
      const xs = sceneRef.current?.crewScreenX() ?? [];
      setCrewXs((prev) => (prev.length === xs.length && prev.every((x, i) => Math.abs(x - xs[i]) < 0.002) ? prev : xs));
    };
    read();
    const id = window.setInterval(read, 300);
    return () => window.clearInterval(id);
  }, [wantsCrew, ready]);

  return (
    <div className={`mannequin-view ${className}`} data-slot-tick={slotTick}>
      <canvas ref={canvasRef} className="mannequin-view__canvas" />
      {flashTick > 0 && <div key={flashTick} className="mannequin-view__flash" aria-hidden />}
      {crewOverlay && crewXs.length > 0 && crewOverlay(crewXs)}
    </div>
  );
}
