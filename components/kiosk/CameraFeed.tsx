import type { Ref } from "react";
import type { CameraRotation, FeedFit } from "@/lib/kiosk/types";

/**
 * Live camera <video>. In digital mode it fills the screen, mirrored by default
 * and rotated to match how the camera is physically mounted (a sideways camera
 * on a portrait monitor uses 90 or 270). In mirror mode it stays mounted but
 * invisible so frames can still be captured.
 */
export function CameraFeed({
  videoRef,
  flipped,
  rotation,
  hidden,
  fit = "contain",
}: {
  videoRef: Ref<HTMLVideoElement>;
  flipped: boolean;
  rotation: CameraRotation;
  hidden: boolean;
  /** Whole frame (letterboxed) or fill-and-crop. */
  fit?: FeedFit;
}) {
  const sideways = rotation === 90 || rotation === 270;
  // CSS applies the last function first: rotate the camera frame upright, then
  // mirror in screen space. (Mirroring before the rotation flips a sideways
  // camera vertically instead, and detection then sees an upside-down frame.)
  const transform = `translate(-50%, -50%)${flipped ? " scaleX(-1)" : ""} rotate(${rotation}deg)`;
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={`camera-feed ${sideways ? "camera-feed--sideways" : ""} ${hidden ? "camera-feed--hidden" : ""} ${fit === "contain" ? "camera-feed--contain" : ""}`}
      style={{ transform }}
    />
  );
}
