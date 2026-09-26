/**
 * Geometric hand-shape classification (pure). MediaPipe's canned gesture
 * classifier gives up on small or slightly blurred hands; finger extension
 * measured on the landmarks is far more tolerant, so it backs the classifier
 * up whenever that reports None or a weak score.
 *
 * Landmark order (MediaPipe): 0 wrist; thumb 1-4; index 5-8; middle 9-12;
 * ring 13-16; pinky 17-20 (mcp, pip, dip, tip for each finger).
 */

export interface LandmarkPoint {
  x: number;
  y: number;
}

export type HandShape = "Victory" | "Open_Palm" | "Thumb_Up" | "Thumb_Down" | "Closed_Fist" | "None";

const WRIST = 0;
const THUMB_MCP = 2;
const THUMB_TIP = 4;
const FINGERS = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
] as const; // [mcp, pip, tip] for index, middle, ring, pinky
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;

/** Confidence reported for a geometric match (below a confident classifier, above its noise). */
export const SHAPE_CONFIDENCE = 0.75;

function scaled(points: LandmarkPoint[], aspect: number): LandmarkPoint[] {
  // Landmarks are normalized to the frame; undo the aspect so distances are isotropic.
  return points.map((p) => ({ x: p.x * aspect, y: p.y }));
}

function dist(a: LandmarkPoint, b: LandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function straightness(m: LandmarkPoint, p: LandmarkPoint, t: LandmarkPoint): number {
  const ax = p.x - m.x;
  const ay = p.y - m.y;
  const bx = t.x - p.x;
  const by = t.y - p.y;
  const la = Math.hypot(ax, ay) || 1e-6;
  const lb = Math.hypot(bx, by) || 1e-6;
  return (ax * bx + ay * by) / (la * lb);
}

type FingerState = "extended" | "curled" | "unsure";

function fingerState(pts: LandmarkPoint[], [mcp, pip, tip]: readonly [number, number, number]): FingerState {
  const wrist = pts[WRIST];
  const dTip = dist(pts[tip], wrist);
  const dPip = dist(pts[pip], wrist);
  const s = straightness(pts[mcp], pts[pip], pts[tip]);
  if (dTip > dPip * 1.12 && s > 0.45) return "extended";
  if (dTip < dPip * 1.02 || s < 0.1) return "curled";
  return "unsure";
}

function thumbExtended(pts: LandmarkPoint[]): boolean {
  const anchor = pts[PINKY_MCP];
  return dist(pts[THUMB_TIP], anchor) > dist(pts[THUMB_MCP], anchor) * 1.25;
}

/**
 * Classify one hand. `aspect` is frame width / height (landmarks are
 * normalized per axis). Returns "None" when the fingers do not clearly form
 * one of the kiosk's shapes.
 */
export function classifyHandShape(points: LandmarkPoint[], aspect = 1): HandShape {
  if (points.length < 21) return "None";
  const pts = scaled(points, aspect);
  const [index, middle, ring, pinky] = FINGERS.map((f) => fingerState(pts, f));
  const four = [index, middle, ring, pinky];

  if (index === "extended" && middle === "extended" && ring === "curled" && pinky === "curled") return "Victory";
  if (four.every((f) => f === "extended")) return "Open_Palm";
  if (four.every((f) => f === "curled")) {
    if (!thumbExtended(pts)) return "Closed_Fist";
    const size = dist(pts[MIDDLE_MCP], pts[WRIST]) || 1e-6;
    const dy = pts[THUMB_TIP].y - pts[WRIST].y; // y grows downward
    if (dy < -0.35 * size) return "Thumb_Up";
    if (dy > 0.35 * size) return "Thumb_Down";
  }
  return "None";
}

/** Longest side of the hand's bounding box, in long-side units of a W x H frame. */
export function handExtent(points: LandmarkPoint[], W: number, H: number): number {
  if (points.length === 0) return 0;
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const p of points) {
    if (p.x < xmin) xmin = p.x;
    if (p.x > xmax) xmax = p.x;
    if (p.y < ymin) ymin = p.y;
    if (p.y > ymax) ymax = p.y;
  }
  const s = Math.max(W, H);
  return Math.max(((xmax - xmin) * W) / s, ((ymax - ymin) * H) / s);
}
