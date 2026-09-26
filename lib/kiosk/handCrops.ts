/**
 * Hand crops (pure geometry). At full-body distance a hand is a few dozen
 * pixels in the detection frame and the hand detector misses it or cannot
 * read the fingers. The pose landmarker still finds the wrists at that
 * distance, so the gesture recognizer gets a second pass on a tight crop
 * around each wrist, and its landmarks are mapped back to frame coordinates.
 */

export interface Point {
  x: number;
  y: number;
}

export interface HandAnchor {
  /** Normalized to the upright frame (0-1). */
  wrist: Point;
  /** Index finger landmark of the pose (points along the hand). */
  index: Point;
  visibility: number;
}

/** Square crop in source pixels. */
export interface CropRect {
  sx: number;
  sy: number;
  size: number;
}

const POSE_LEFT_WRIST = 15;
const POSE_RIGHT_WRIST = 16;
const POSE_LEFT_INDEX = 19;
const POSE_RIGHT_INDEX = 20;

/** Crop side as a multiple of the wrist-to-index distance (a raised peace sign fits). */
const HAND_SCALE = 3.2;
/** Never crop smaller than this fraction of the frame's long side. */
const MIN_FRACTION = 0.12;
/** Never crop larger than this fraction of the frame's short side. */
const MAX_FRACTION = 0.6;
/** How far the crop center moves from the wrist toward the fingers. */
const TOWARD_FINGERS = 0.6;

export function poseHandAnchors(lm: { x: number; y: number; visibility?: number }[]): HandAnchor[] {
  const out: HandAnchor[] = [];
  for (const [w, i] of [
    [POSE_LEFT_WRIST, POSE_LEFT_INDEX],
    [POSE_RIGHT_WRIST, POSE_RIGHT_INDEX],
  ]) {
    const wrist = lm[w];
    const index = lm[i] ?? wrist;
    if (!wrist) continue;
    out.push({ wrist: { x: wrist.x, y: wrist.y }, index: { x: index.x, y: index.y }, visibility: wrist.visibility ?? 1 });
  }
  return out;
}

/** Square crop around a hand, clamped inside a W x H source. */
export function handCropRect(a: HandAnchor, W: number, H: number): CropRect {
  const wx = a.wrist.x * W;
  const wy = a.wrist.y * H;
  const ix = a.index.x * W;
  const iy = a.index.y * H;
  const hand = Math.hypot(ix - wx, iy - wy);
  const longSide = Math.max(W, H);
  const shortSide = Math.min(W, H);
  const size = Math.round(Math.min(shortSide * MAX_FRACTION, Math.max(longSide * MIN_FRACTION, hand * HAND_SCALE)));
  const cx = wx + (ix - wx) * TOWARD_FINGERS;
  const cy = wy + (iy - wy) * TOWARD_FINGERS;
  const sx = Math.round(Math.min(Math.max(0, cx - size / 2), Math.max(0, W - size)));
  const sy = Math.round(Math.min(Math.max(0, cy - size / 2), Math.max(0, H - size)));
  return { sx, sy, size: Math.min(size, W, H) };
}

/** A landmark normalized to the crop, back to the full frame (normalized). */
export function mapCropPoint<P extends Point>(p: P, r: CropRect, W: number, H: number): P {
  return { ...p, x: (r.sx + p.x * r.size) / W, y: (r.sy + p.y * r.size) / H };
}

/** Normalized distance between two frame points, corrected for aspect so it is in "long side" units. */
export function frameDistance(a: Point, b: Point, W: number, H: number): number {
  const s = Math.max(W, H);
  return Math.hypot(((a.x - b.x) * W) / s, ((a.y - b.y) * H) / s);
}
