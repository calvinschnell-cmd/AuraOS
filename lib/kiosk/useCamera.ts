"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CameraStatus } from "./types";

export interface CameraHandle {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Callback ref for the <video>: re-attaches the stream whenever the element (re)mounts. */
  attachVideo: (el: HTMLVideoElement | null) => void;
  status: CameraStatus;
  error: string | null;
  devices: MediaDeviceInfo[];
}

/**
 * Opens the selected camera (or the default user-facing one) and attaches it
 * to a <video>. Stops the stream on unmount or when the device changes.
 */
export function useCamera(deviceId: string | null, enabled = true): CameraHandle {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  // The layouts swap (digital <-> mirror) and remount on reboot, so the video
  // element can change while the stream lives on: attach on every mount.
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    const stream = streamRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      setStatus("requesting");
      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          await video.play().catch(() => undefined);
        }
        setStatus("live");
        setError(null);
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(list.filter((d) => d.kind === "videoinput"));
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [deviceId, enabled]);

  return { videoRef, attachVideo, status, error, devices };
}
