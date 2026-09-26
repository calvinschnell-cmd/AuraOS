/**
 * MediaPipe Pose landmark plumbing shared by the kiosk (live landmarks at
 * capture time), the training script (landmarks extracted offline from the
 * dataset) and the server (pose scoring). Pure: no MediaPipe import.
 */

/** One landmark: normalized image x/y (0-1, y down), relative depth z, visibility 0-1. */
export type Landmark = [x: number, y: number, z: number, visibility: number];

/**
 * A person's 33 landmarks plus the frame aspect (width / height) they are
 * normalized to, so angles are measured in real proportions.
 */
export interface PoseSnapshot {
  landmarks: Landmark[];
  aspect: number;
}

export const LANDMARK_COUNT = 33;

/** Landmark indexes (MediaPipe Pose). "L"/"R" are the person's own left/right. */
export const LM = {
  nose: 0,
  shoulderL: 11,
  shoulderR: 12,
  elbowL: 13,
  elbowR: 14,
  wristL: 15,
  wristR: 16,
  hipL: 23,
  hipR: 24,
  kneeL: 25,
  kneeR: 26,
  ankleL: 27,
  ankleR: 28,
} as const;

/** Left/right partner of every landmark (for mirroring). */
const MIRROR_INDEX: number[] = (() => {
  const pairs: [number, number][] = [
    [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22],
    [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
  ];
  const map = Array.from({ length: LANDMARK_COUNT }, (_, i) => i);
  for (const [a, b] of pairs) {
    map[a] = b;
    map[b] = a;
  }
  return map;
})();

/**
 * The same pose seen in a mirror: x flips and left/right swap, so the
 * mirrored person is again anatomically consistent.
 */
export function mirrorSnapshot(s: PoseSnapshot): PoseSnapshot {
  return {
    aspect: s.aspect,
    landmarks: s.landmarks.map((_, i) => {
      const [x, y, z, v] = s.landmarks[MIRROR_INDEX[i]];
      return [1 - x, y, z, v];
    }),
  };
}

/** Structural check for untrusted input (API bodies). */
export function isPoseSnapshot(value: unknown): value is PoseSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PoseSnapshot>;
  if (typeof v.aspect !== "number" || !Number.isFinite(v.aspect) || v.aspect <= 0 || v.aspect > 10) return false;
  if (!Array.isArray(v.landmarks) || v.landmarks.length !== LANDMARK_COUNT) return false;
  return v.landmarks.every((p) => Array.isArray(p) && p.length === 4 && p.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 100));
}

/** Round for transport / storage (4 decimals is far below landmark noise). */
export function compactSnapshot(s: PoseSnapshot): PoseSnapshot {
  const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
  return { aspect: r(s.aspect, 4), landmarks: s.landmarks.map(([x, y, z, v]) => [r(x, 4), r(y, 4), r(z, 4), r(v, 3)]) };
}

/** From MediaPipe's { x, y, z, visibility } objects. */
export function snapshotFromMediapipe(points: readonly { x: number; y: number; z?: number; visibility?: number }[], aspect: number): PoseSnapshot | null {
  if (points.length !== LANDMARK_COUNT) return null;
  return { aspect, landmarks: points.map((p) => [p.x, p.y, p.z ?? 0, p.visibility ?? 1]) };
}

/** Normalized bounding-box area of a landmark set (used to pick the main person). */
export function snapshotArea(s: PoseSnapshot): number {
  let xmin = 1, ymin = 1, xmax = 0, ymax = 0;
  for (const [x, y] of s.landmarks) {
    xmin = Math.min(xmin, x);
    ymin = Math.min(ymin, y);
    xmax = Math.max(xmax, x);
    ymax = Math.max(ymax, y);
  }
  return Math.max(0, xmax - xmin) * Math.max(0, ymax - ymin);
}
