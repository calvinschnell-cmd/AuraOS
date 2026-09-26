import { LM, type PoseSnapshot } from "./landmarks";

/**
 * Pose -> feature vector. Shared verbatim by training (scripts/pose-train.ts)
 * and battle time (lib/pose/score.ts), so the classifier always sees features
 * computed by the same code.
 *
 * Invariant to where the person stands and how close they are: points are
 * centered on the mid-hip and scaled by torso length. Angles (joint angles,
 * limb directions) carry most of the signal because they survive different
 * framing and camera distance where raw coordinates fall apart.
 */

type P = { x: number; y: number };

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: P) => Math.hypot(v.x, v.y);
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Interior angle at b (a-b-c), radians 0..pi. */
export function jointAngle(a: P, b: P, c: P): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const d = len(u) * len(v);
  if (d < 1e-9) return Math.PI;
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / d)));
}

/** Points in real proportions (x scaled by the frame aspect), y down. */
function points(s: PoseSnapshot): P[] {
  return s.landmarks.map(([x, y]) => ({ x: x * s.aspect, y }));
}

export interface PoseGeometry {
  /** Torso length (mid-shoulder to mid-hip) in frame units. */
  torso: number;
  hip: P;
  shoulder: P;
  /** Landmarks centered on the mid-hip, in torso lengths. */
  norm: P[];
}

export function poseGeometry(s: PoseSnapshot): PoseGeometry {
  const p = points(s);
  const hip = mid(p[LM.hipL], p[LM.hipR]);
  const shoulder = mid(p[LM.shoulderL], p[LM.shoulderR]);
  const torso = Math.max(1e-3, len(sub(shoulder, hip)));
  return { torso, hip, shoulder, norm: p.map((q) => ({ x: (q.x - hip.x) / torso, y: (q.y - hip.y) / torso })) };
}

const LIMBS: [string, number, number][] = [
  ["upperArmL", LM.shoulderL, LM.elbowL],
  ["upperArmR", LM.shoulderR, LM.elbowR],
  ["forearmL", LM.elbowL, LM.wristL],
  ["forearmR", LM.elbowR, LM.wristR],
  ["thighL", LM.hipL, LM.kneeL],
  ["thighR", LM.hipR, LM.kneeR],
  ["shinL", LM.kneeL, LM.ankleL],
  ["shinR", LM.kneeR, LM.ankleR],
];

const JOINTS: [string, number, number, number][] = [
  ["elbowL", LM.shoulderL, LM.elbowL, LM.wristL],
  ["elbowR", LM.shoulderR, LM.elbowR, LM.wristR],
  ["shoulderL", LM.hipL, LM.shoulderL, LM.elbowL],
  ["shoulderR", LM.hipR, LM.shoulderR, LM.elbowR],
  ["hipL", LM.shoulderL, LM.hipL, LM.kneeL],
  ["hipR", LM.shoulderR, LM.hipR, LM.kneeR],
  ["kneeL", LM.hipL, LM.kneeL, LM.ankleL],
  ["kneeR", LM.hipR, LM.kneeR, LM.ankleR],
];

const POSITIONS: [string, number][] = [
  ["nose", LM.nose],
  ["elbowL", LM.elbowL],
  ["elbowR", LM.elbowR],
  ["wristL", LM.wristL],
  ["wristR", LM.wristR],
  ["kneeL", LM.kneeL],
  ["kneeR", LM.kneeR],
  ["ankleL", LM.ankleL],
  ["ankleR", LM.ankleR],
];

/** Normalized coordinates are clipped so one wild landmark cannot dominate. */
const CLIP = 4;
const clip = (v: number) => Math.max(-CLIP, Math.min(CLIP, v));

export const FEATURE_NAMES: readonly string[] = [
  ...JOINTS.map(([n]) => `angle.${n}`),
  ...LIMBS.flatMap(([n]) => [`dir.${n}.sin`, `dir.${n}.cos`]),
  "torso.tilt.sin",
  "torso.tilt.cos",
  ...POSITIONS.flatMap(([n]) => [`pos.${n}.x`, `pos.${n}.y`]),
  "span.ankles",
  "span.wrists",
  "span.shoulders",
  "span.hips",
  "sym.elbow",
  "sym.shoulder",
  "sym.hip",
  "sym.knee",
];

/**
 * The feature vector. Limb directions are measured against the torso axis, so
 * a person leaning over still reads as "arm raised" relative to their body.
 */
export function poseFeatures(s: PoseSnapshot): number[] {
  const g = poseGeometry(s);
  const n = g.norm;
  // Torso axis: hip -> shoulder, pointing up.
  const axis = sub(g.shoulder, g.hip);
  const axisAngle = Math.atan2(axis.x, -axis.y); // 0 when upright
  const angles = JOINTS.map(([, a, b, c]) => jointAngle(n[a], n[b], n[c]) / Math.PI);
  const dirs = LIMBS.flatMap(([, a, b]) => {
    const v = sub(n[b], n[a]);
    // Angle of the limb from "straight down along the body", rotated into the torso frame.
    const t = Math.atan2(v.x, v.y) + axisAngle;
    return [Math.sin(t), Math.cos(t)];
  });
  const pos = POSITIONS.flatMap(([, i]) => [clip(n[i].x), clip(n[i].y)]);
  const dist = (i: number, j: number) => clip(Math.hypot(n[i].x - n[j].x, n[i].y - n[j].y));
  const [eL, eR, sL, sR, hL, hR, kL, kR] = angles;
  return [
    ...angles,
    ...dirs,
    Math.sin(axisAngle),
    Math.cos(axisAngle),
    ...pos,
    dist(LM.ankleL, LM.ankleR),
    dist(LM.wristL, LM.wristR),
    dist(LM.shoulderL, LM.shoulderR),
    dist(LM.hipL, LM.hipR),
    Math.abs(eL - eR),
    Math.abs(sL - sR),
    Math.abs(hL - hR),
    Math.abs(kL - kR),
  ];
}

/**
 * Hand-readable dynamism signals (0-1 each) for the pose score and the
 * commentary: how much the body is doing, independent of any archetype.
 */
export interface DynamismSignals {
  /** Hands above the shoulders (highest wrist). */
  armRaise: number;
  /** Hands spread wide / reaching out. */
  armSpread: number;
  /** Feet apart (stance width vs shoulder width). */
  stance: number;
  /** Left and right doing different things. */
  asymmetry: number;
  /** Torso leaning out of vertical. */
  lean: number;
  /** Knees bent (lunge, crouch, jump). */
  kneeBend: number;
}

const unit = (v: number) => Math.max(0, Math.min(1, v));

export function dynamismSignals(s: PoseSnapshot): DynamismSignals {
  const g = poseGeometry(s);
  const n = g.norm;
  const shoulderY = (n[LM.shoulderL].y + n[LM.shoulderR].y) / 2;
  const highestWrist = Math.min(n[LM.wristL].y, n[LM.wristR].y);
  const shoulderW = Math.max(0.2, Math.hypot(n[LM.shoulderL].x - n[LM.shoulderR].x, n[LM.shoulderL].y - n[LM.shoulderR].y));
  // Horizontal extension beyond the shoulders (hanging arms ~0; arms straight out ~1.2 torso lengths).
  const centerX = (n[LM.shoulderL].x + n[LM.shoulderR].x) / 2;
  const beyond = (i: number) => Math.abs(n[i].x - centerX) - shoulderW / 2;
  const wristExt = Math.max(beyond(LM.wristL), beyond(LM.wristR));
  // Elbows out wide (hands on hips, flexing) count too.
  const elbowExt = Math.max(beyond(LM.elbowL), beyond(LM.elbowR));
  const ankleSpan = Math.abs(n[LM.ankleL].x - n[LM.ankleR].x);
  const axis = sub(g.shoulder, g.hip);
  const tiltDeg = Math.abs((Math.atan2(axis.x, -axis.y) * 180) / Math.PI);
  const deg = (a: number, b: number, c: number) => (jointAngle(n[a], n[b], n[c]) * 180) / Math.PI;
  const elbowL = deg(LM.shoulderL, LM.elbowL, LM.wristL);
  const elbowR = deg(LM.shoulderR, LM.elbowR, LM.wristR);
  const shL = deg(LM.hipL, LM.shoulderL, LM.elbowL);
  const shR = deg(LM.hipR, LM.shoulderR, LM.elbowR);
  const kneeL = deg(LM.hipL, LM.kneeL, LM.ankleL);
  const kneeR = deg(LM.hipR, LM.kneeR, LM.ankleR);
  return {
    // Wrist at the shoulders = 0.3, a full torso length above them = 1.
    armRaise: unit(0.3 + (shoulderY - highestWrist) * 0.7),
    armSpread: unit(Math.max((wristExt - 0.1) / 0.8, ((elbowExt - 0.1) / 0.4) * 0.6)),
    stance: unit((ankleSpan / shoulderW - 0.9) / 1.6),
    asymmetry: unit((Math.abs(elbowL - elbowR) + Math.abs(shL - shR) + Math.abs(kneeL - kneeR)) / 150),
    lean: unit((tiltDeg - 4) / 22),
    kneeBend: unit((175 - Math.min(kneeL, kneeR)) / 70),
  };
}
