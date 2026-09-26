import { createRng } from "@/lib/prng";
import { LANDMARK_COUNT, LM, type Landmark, type PoseSnapshot } from "./landmarks";

/**
 * Synthetic MediaPipe-format poses from a tiny 2D skeleton. Used ONLY where no
 * real landmarks exist: MOCK MODE / no camera (so pose scoring still demos
 * offline) and unit tests. The classifier itself is trained on real photos.
 *
 * Angles are degrees measured from "hanging straight down", positive away
 * from the body's midline on that side (90 = straight out, 180 = straight up,
 * negative = across the body).
 */

interface SideAngles {
  upperArm: number;
  forearm: number;
  thigh: number;
  shin: number;
}

export interface SkeletonPose {
  left: SideAngles;
  right: SideAngles;
  /** Upper body tilt around the hips, degrees (positive toward image right). */
  tilt: number;
}

/** Hand-made templates for mock mode only (never training data). */
export const MOCK_POSES: Record<string, SkeletonPose> = {
  standing: { left: { upperArm: 8, forearm: 6, thigh: 3, shin: 1 }, right: { upperArm: 8, forearm: 6, thigh: 3, shin: 1 }, tilt: 0 },
  hero: { left: { upperArm: 55, forearm: -65, thigh: 18, shin: 12 }, right: { upperArm: 55, forearm: -65, thigh: 18, shin: 12 }, tilt: 0 },
  action: { left: { upperArm: 92, forearm: 90, thigh: 38, shin: 12 }, right: { upperArm: 40, forearm: 160, thigh: -6, shin: 30 }, tilt: -8 },
  dance: { left: { upperArm: 150, forearm: 170, thigh: 70, shin: -5 }, right: { upperArm: 115, forearm: 60, thigh: 4, shin: 2 }, tilt: 10 },
  runway: { left: { upperArm: 22, forearm: -45, thigh: -8, shin: -4 }, right: { upperArm: 10, forearm: 8, thigh: 5, shin: 6 }, tilt: 4 },
  fighter: { left: { upperArm: 25, forearm: 165, thigh: 26, shin: 4 }, right: { upperArm: 30, forearm: 160, thigh: 26, shin: 4 }, tilt: 0 },
};

const BODY = { shoulderHalf: 0.42, hipHalf: 0.2, upperArm: 0.62, forearm: 0.55, thigh: 0.9, shin: 0.85, neck: 0.42, hand: 0.14, foot: 0.18 };

type Pt = { x: number; y: number };

function dir(side: 1 | -1, deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  return { x: side * Math.sin(r), y: Math.cos(r) };
}

const add = (a: Pt, d: Pt, k: number): Pt => ({ x: a.x + d.x * k, y: a.y + d.y * k });

/**
 * Landmarks (unmirrored camera image, person facing the camera: their left is
 * image right) in a frame of the given aspect.
 */
export function skeletonSnapshot(pose: SkeletonPose, opts: { aspect?: number; center?: Pt; torso?: number; scale?: (k: keyof typeof BODY) => number } = {}): PoseSnapshot {
  const aspect = opts.aspect ?? 9 / 16;
  const torso = opts.torso ?? 0.2;
  const center = opts.center ?? { x: 0.5, y: 0.55 };
  const L = (k: keyof typeof BODY) => BODY[k] * (opts.scale?.(k) ?? 1);
  // Body space: torso lengths, hip center at origin, y down.
  const t = (pose.tilt * Math.PI) / 180;
  const rotUpper = (p: Pt): Pt => ({ x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) });
  const midShoulder = rotUpper({ x: 0, y: -1 });
  const pts = new Map<number, Pt>();
  const sides: [1 | -1, SideAngles, "L" | "R"][] = [
    [1, pose.left, "L"],
    [-1, pose.right, "R"],
  ];
  for (const [s, a, name] of sides) {
    const shoulder = add(midShoulder, rotUpper({ x: s, y: 0 }), L("shoulderHalf"));
    const elbow = add(shoulder, rotUpper(dir(s, a.upperArm)), L("upperArm"));
    const forearmDir = rotUpper(dir(s, a.forearm));
    const wrist = add(elbow, forearmDir, L("forearm"));
    const hip = { x: s * L("hipHalf"), y: 0 };
    const knee = add(hip, dir(s, a.thigh), L("thigh"));
    const ankle = add(knee, dir(s, a.shin), L("shin"));
    const idx = (l: string) => LM[`${l}${name}` as keyof typeof LM];
    pts.set(idx("shoulder"), shoulder);
    pts.set(idx("elbow"), elbow);
    pts.set(idx("wrist"), wrist);
    pts.set(idx("hip"), hip);
    pts.set(idx("knee"), knee);
    pts.set(idx("ankle"), ankle);
    // Hands (pinky, index, thumb) and feet (heel, toe) hang off the wrists and ankles.
    const handTip = add(wrist, forearmDir, L("hand"));
    const [pinky, index, thumb, heel, toe] = s === 1 ? [17, 19, 21, 29, 31] : [18, 20, 22, 30, 32];
    pts.set(pinky, add(handTip, { x: s, y: 0 }, 0.03));
    pts.set(index, add(handTip, { x: -s, y: 0 }, 0.03));
    pts.set(thumb, add(wrist, { x: -s, y: 0 }, 0.06));
    pts.set(heel, add(ankle, { x: 0, y: 1 }, 0.06));
    pts.set(toe, add(ankle, { x: s * 0.4, y: 1 }, L("foot") * 0.6));
  }
  const nose = add(midShoulder, rotUpper({ x: 0, y: -1 }), L("neck"));
  pts.set(LM.nose, nose);
  // Eyes (1-6), ears (7, 8), mouth (9, 10) around the nose.
  const face: [number, number, number][] = [
    [1, 0.04, -0.06], [2, 0.07, -0.06], [3, 0.1, -0.06], [4, -0.04, -0.06], [5, -0.07, -0.06], [6, -0.1, -0.06],
    [7, 0.16, -0.02], [8, -0.16, -0.02], [9, 0.05, 0.08], [10, -0.05, 0.08],
  ];
  for (const [i, dx, dy] of face) pts.set(i, add(nose, rotUpper({ x: dx, y: dy }), 1));

  const landmarks: Landmark[] = Array.from({ length: LANDMARK_COUNT }, (_, i) => {
    const p = pts.get(i) ?? nose;
    const x = (center.x * aspect + p.x * torso) / aspect;
    const y = center.y + p.y * torso;
    return [x, y, 0, 0.95];
  });
  return { aspect, landmarks };
}

/** A randomized variant of a template: angles, proportions, framing and landmark noise all jitter. */
export function jitteredSnapshot(pose: SkeletonPose, seed: string, amount = 1): PoseSnapshot {
  const rng = createRng(seed);
  const j = (v: number, spread: number) => v + rng.float(-spread, spread) * amount;
  const side = (a: SideAngles): SideAngles => ({ upperArm: j(a.upperArm, 12), forearm: j(a.forearm, 14), thigh: j(a.thigh, 7), shin: j(a.shin, 7) });
  const varied: SkeletonPose = { left: side(pose.left), right: side(pose.right), tilt: j(pose.tilt, 4) };
  const snap = skeletonSnapshot(varied, {
    center: { x: j(0.5, 0.08), y: j(0.55, 0.04) },
    torso: j(0.2, 0.03),
    scale: () => 1 + rng.float(-0.05, 0.05) * amount,
  });
  return { ...snap, landmarks: snap.landmarks.map(([x, y, z, v]) => [x + rng.float(-0.004, 0.004), y + rng.float(-0.004, 0.004), z, v]) };
}

/** MOCK MODE: a deterministic pose for a capture (seeded by its image hash). */
export function mockPoseFor(hash: string): PoseSnapshot {
  const rng = createRng(`pose:${hash}`);
  const names = Object.keys(MOCK_POSES);
  const name = names[rng.int(0, names.length - 1)];
  return jitteredSnapshot(MOCK_POSES[name], `pose:${hash}:jitter`);
}
