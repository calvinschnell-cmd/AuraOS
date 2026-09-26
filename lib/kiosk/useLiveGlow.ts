"use client";

import { useEffect, type RefObject } from "react";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { maskToCanvas, personMask } from "./segment";
import { createImageSegmenter } from "./vision";

const GLOW_FPS = 12;

/**
 * Live aura glow: segments the camera feed at ~12fps and paints the person
 * mask (cyan, alpha = confidence) into `canvas`. The canvas is laid over the
 * feed with the same mirror/rotation transform and a CSS blur. Disabled in
 * performance mode and when MediaPipe cannot load.
 */
export function useLiveGlow(video: RefObject<HTMLVideoElement | null>, canvas: RefObject<HTMLCanvasElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer = 0;
    let segmenter: ImageSegmenter | null = null;
    let lastTimestamp = 0;
    const canvasAtStart = canvas.current;

    const loop = () => {
      if (cancelled) return;
      timer = window.setTimeout(loop, 1000 / GLOW_FPS);
      const v = video.current;
      const c = canvas.current;
      if (!segmenter || !v || !c || v.readyState < 2 || v.videoWidth === 0) return;
      const timestamp = Math.max(performance.now(), lastTimestamp + 1);
      lastTimestamp = timestamp;
      try {
        segmenter.segmentForVideo(v, timestamp, (result) => {
          const mask = personMask(result.confidenceMasks);
          if (mask) maskToCanvas(mask, "#9ee7ff", c);
        });
      } catch (err) {
        console.warn("[aura] live glow failed", err);
      }
    };

    (async () => {
      segmenter = await createImageSegmenter("VIDEO");
      if (cancelled || !segmenter) return;
      loop();
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      segmenter?.close();
      canvasAtStart?.getContext("2d")?.clearRect(0, 0, canvasAtStart.width, canvasAtStart.height);
    };
  }, [video, canvas, enabled]);
}
