import { isMockMode } from "@/lib/env";
import { isPoseSnapshot, type PoseSnapshot } from "@/lib/pose/landmarks";
import { POSE_MODEL } from "@/lib/pose/model";
import { scorePose, type PoseResult } from "@/lib/pose/score";
import { mockPoseFor } from "@/lib/pose/synthetic";

/**
 * Pose sub-score for one capture. Live MediaPipe landmarks when the kiosk saw
 * the person; in MOCK MODE without landmarks (no camera) a deterministic
 * synthetic pose keeps the demo meaningful; otherwise a neutral score, so a
 * detector miss never costs anyone the battle.
 */
export function poseForCapture(snapshot: unknown, imageHash: string): PoseResult {
  const live: PoseSnapshot | null = isPoseSnapshot(snapshot) ? snapshot : null;
  if (live) return scorePose(POSE_MODEL, live, "live");
  if (isMockMode()) return scorePose(POSE_MODEL, mockPoseFor(imageHash), "mock");
  return scorePose(POSE_MODEL, null);
}

/** Parse the optional `pose` form field (JSON landmarks). */
export function parsePoseField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.length === 0 || value.length > 20_000) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
