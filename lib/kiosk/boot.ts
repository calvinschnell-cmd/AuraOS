import { APP_VERSION } from "@/lib/config";
import type { CameraStatus } from "./types";

export interface BootLine {
  /** Typed out character by character. */
  text: string;
  /** Stamped onto the line after `delay` ms once the text has finished typing. */
  status?: string;
  /** Pause before the status appears (ms); with no status, a pause before the next line. */
  delay: number;
}

/** Boot sequence shown on load before the kiosk enters SPINNING. */
export function bootSequence(opts: {
  databaseConfigured: boolean;
  mockMode: boolean;
  mode: string;
  cameraStatus?: CameraStatus;
  /** Session-end reboot: a different first line. */
  quick?: boolean;
}): BootLine[] {
  const camera = cameraStatusLabel(opts.cameraStatus ?? "live");
  return [
    opts.quick
      ? { text: "SESSION CLOSED. REBOOTING AURA OS...", delay: 350 }
      : { text: `AURA OS ${APP_VERSION}  (C) THE AURA DEPARTMENT`, delay: 350 },
    { text: "INITIALIZING DRIP SENSORS...", status: "OK", delay: 420 },
    { text: "LOADING AURA KERNEL...", status: "OK", delay: 260 },
    { text: "CALIBRATING MANNEQUIN RIG...", status: "OK", delay: 380 },
    { text: "MOUNTING CAMERA DEVICE...", status: camera, delay: 300 },
    { text: "LINKING ANALYSIS MODULE...", status: opts.mockMode ? "MOCK MODE" : "OK", delay: 340 },
    { text: "LOADING POSE CLASSIFIER...", status: "OK", delay: 260 },
    { text: "MOUNTING TIDE CHART...", status: opts.databaseConfigured ? "TIGER DATA" : "IN MEMORY", delay: 280 },
    { text: `DISPLAY MODE: ${opts.mode.toUpperCase()}`, delay: 200 },
    { text: "AURA BATTLES ARMED. AURA OS READY.", delay: 500 },
  ];
}

/** Status stamp for the camera boot line; anything but OK is a warning. */
export function cameraStatusLabel(status: CameraStatus): string {
  switch (status) {
    case "live":
      return "OK";
    case "error":
      return "FAILED (CHECK PERMISSION)";
    case "unsupported":
      return "UNAVAILABLE (USE LOCALHOST OR HTTPS)";
    case "requesting":
      return "WAITING FOR PERMISSION";
    default:
      return "NO SIGNAL";
  }
}
