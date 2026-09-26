"use client";

import { useRef, type RefObject } from "react";
import type { CameraRotation, FeedFit } from "@/lib/kiosk/types";
import { useLiveGlow } from "@/lib/kiosk/useLiveGlow";

/** Cyan person-mask glow painted over the live digital feed. */
export function LiveGlow({
  video,
  enabled,
  flipped,
  rotation,
  fit = "contain",
}: {
  video: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  flipped: boolean;
  rotation: CameraRotation;
  fit?: FeedFit;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useLiveGlow(video, canvasRef, enabled);
  if (!enabled) return null;
  const sideways = rotation === 90 || rotation === 270;
  const transform = `translate(-50%, -50%) scale(1.03)${flipped ? " scaleX(-1)" : ""} rotate(${rotation}deg)`;
  return <canvas ref={canvasRef} className={`live-glow ${sideways ? "camera-feed--sideways" : ""} ${fit === "contain" ? "camera-feed--contain" : ""}`} style={{ transform }} aria-hidden />;
}
