import { CAMERA_ROTATIONS, REMOTE_SETTING_KEYS, type KioskSettings, type RemoteSettings } from "./types";

const MAX_ID_LENGTH = 512;

const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const inRange = (min: number, max: number) => (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const optionalText = (v: unknown): v is string | null => v === null || (typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH);

/** What each remotely settable value may be. */
const VALID: { [K in keyof RemoteSettings]: (v: unknown) => v is RemoteSettings[K] } = {
  cameraDeviceId: optionalText,
  cameraRotation: (v): v is RemoteSettings["cameraRotation"] => CAMERA_ROTATIONS.includes(v as RemoteSettings["cameraRotation"]),
  flipFeed: isBool,
  feedFit: (v): v is RemoteSettings["feedFit"] => v === "contain" || v === "cover",
  muted: isBool,
  musicMuted: isBool,
  voiceMuted: isBool,
  volume: inRange(0, 1),
  musicVolume: inRange(0, 1),
  voiceVolume: inRange(0, 1),
  effectsVolume: inRange(0, 1),
  voiceName: optionalText,
  voiceRate: inRange(0.5, 2),
  voicePitch: inRange(0, 2),
};

/**
 * A settings change posted from /admin: only the known camera and sound
 * keys, each with a valid value. Null when it is empty or anything is off
 * (unknown keys are rejected too, so a typo never silently does nothing).
 */
export function parseSettingsPatch(v: unknown): Partial<RemoteSettings> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return null;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    const valid = VALID[key as keyof RemoteSettings];
    if (!valid || !valid(value)) return null;
    patch[key] = value;
  }
  return patch as Partial<RemoteSettings>;
}

/** The remotely settable part of the kiosk settings (reported to /admin). */
export function pickRemoteSettings(settings: KioskSettings): RemoteSettings {
  return Object.fromEntries(REMOTE_SETTING_KEYS.map((k) => [k, settings[k]])) as RemoteSettings;
}
