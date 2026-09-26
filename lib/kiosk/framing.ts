/**
 * Full-body framing check (pure). Decides from pose landmarks whether the
 * person's whole fit is in frame, so the kiosk can ask them to step back
 * before a scan instead of judging a head-and-shoulders crop.
 */

export type Framing = "none" | "full" | "step_back" | "step_closer";

export interface FramingPoint {
  x: number;
  y: number;
  visibility?: number;
}

const NOSE = 0;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;
/** A head this close to the top edge counts as cut off. */
const EDGE = 0.03;
/** Feet may sit almost on the bottom edge (a full-height person does exactly that). */
const FOOT_EDGE = 0.008;
const MIN_VISIBILITY = 0.4;
/** Body height (fraction of the frame) below which the fit is too small to read. */
const MIN_HEIGHT = 0.3;

function visible(p: FramingPoint | undefined): p is FramingPoint {
  return p !== undefined && (p.visibility ?? 1) >= MIN_VISIBILITY;
}

function inFrame(p: FramingPoint, bottomEdge = EDGE): boolean {
  return p.y > EDGE && p.y < 1 - bottomEdge && p.x > -0.05 && p.x < 1.05;
}

function extent(lm: FramingPoint[]): number {
  let min = 1;
  let max = 0;
  for (const p of lm) {
    if (p.y < min) min = p.y;
    if (p.y > max) max = p.y;
  }
  return Math.max(0, max - min);
}

/** Framing of one pose (33 MediaPipe landmarks, normalized to the upright frame). */
export function assessPose(lm: FramingPoint[]): Framing {
  if (lm.length <= RIGHT_ANKLE) return "none";
  const nose = lm[NOSE];
  const ankles = [lm[LEFT_ANKLE], lm[RIGHT_ANKLE]];
  const headOk = visible(nose) && inFrame(nose);
  const feetOk = ankles.every((a) => visible(a) && inFrame(a, FOOT_EDGE));
  if (!headOk || !feetOk) return "step_back";
  if (extent(lm) < MIN_HEIGHT) return "step_closer";
  return "full";
}

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
/** Nose visibility below this means the face is turned away. */
const FACE_VISIBILITY = 0.5;

/**
 * Whether a person faces the camera (33 MediaPipe landmarks, upright and
 * unmirrored). Facing the lens, the person's left shoulder appears on the
 * image's right (larger x) and the nose is visible; with their back turned the
 * shoulders swap sides and the nose drops out. Unknown visibility counts as
 * visible so partial data never blocks a player.
 */
export function isFacingCamera(lm: FramingPoint[]): boolean {
  const nose = lm[NOSE];
  const left = lm[LEFT_SHOULDER];
  const right = lm[RIGHT_SHOULDER];
  if (!nose || !left || !right) return false;
  if ((nose.visibility ?? 1) < FACE_VISIBILITY) return false;
  return left.x > right.x;
}

/** Framing of the main (tallest) person in the frame; bystanders at the edge are ignored. */
export function assessFraming(poses: FramingPoint[][]): Framing {
  if (poses.length === 0) return "none";
  let main = poses[0];
  for (const p of poses) if (extent(p) > extent(main)) main = p;
  return assessPose(main);
}
