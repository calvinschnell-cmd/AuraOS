import { JOINT_NAMES, type Animation, type Easing, type HandPose, type JointName, type Pose, type Vec3 } from "@/lib/poses";

export const EASINGS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/** A pose with every joint, root, yaw and both hands present. */
export interface ResolvedPose {
  joints: Record<JointName, Vec3>;
  root: Vec3;
  yaw: number;
  hands: { L: HandPose; R: HandPose };
}

const DEFAULT_HAND: HandPose = { peace: 0, open: 0.3, thumb: 0 };

export function resolvePose(pose: Pose, base?: ResolvedPose): ResolvedPose {
  const joints = {} as Record<JointName, Vec3>;
  for (const name of JOINT_NAMES) {
    const j = pose.joints[name] ?? base?.joints[name] ?? [0, 0, 0];
    joints[name] = [j[0], j[1], j[2]];
  }
  return {
    joints,
    root: pose.root ? [...pose.root] : base ? [...base.root] : [0, 0, 0],
    yaw: pose.yaw ?? base?.yaw ?? 0,
    hands: {
      L: { ...DEFAULT_HAND, ...base?.hands.L, ...pose.hands?.L },
      R: { ...DEFAULT_HAND, ...base?.hands.R, ...pose.hands?.R },
    },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path angle lerp in degrees (so 350 -> 10 does not spin around). */
function lerpAngle(a: number, b: number, t: number): number {
  let d = ((b - a) % 360) + 0;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return a + d * t;
}

export function lerpResolved(a: ResolvedPose, b: ResolvedPose, t: number): ResolvedPose {
  const joints = {} as Record<JointName, Vec3>;
  for (const name of JOINT_NAMES) {
    const ja = a.joints[name];
    const jb = b.joints[name];
    joints[name] = [lerpAngle(ja[0], jb[0], t), lerpAngle(ja[1], jb[1], t), lerpAngle(ja[2], jb[2], t)];
  }
  const hand = (x: HandPose, y: HandPose): HandPose => ({
    peace: lerp(x.peace, y.peace, t),
    open: lerp(x.open, y.open, t),
    thumb: lerp(x.thumb, y.thumb, t),
  });
  return {
    joints,
    root: [lerp(a.root[0], b.root[0], t), lerp(a.root[1], b.root[1], t), lerp(a.root[2], b.root[2], t)],
    yaw: lerpAngle(a.yaw, b.yaw, t),
    hands: { L: hand(a.hands.L, b.hands.L), R: hand(a.hands.R, b.hands.R) },
  };
}

export function cloneResolved(p: ResolvedPose): ResolvedPose {
  return lerpResolved(p, p, 0);
}

/**
 * Plays keyframed animations and can blend into any animation from any
 * current pose within ~200ms. `update` returns the pose for this frame.
 */
export class AnimationPlayer {
  private current: ResolvedPose;
  private from: ResolvedPose;
  private target: ResolvedPose;
  private anim: Animation | null = null;
  private keyIndex = -1;
  private elapsed = 0;
  private duration = 1;
  private easing: (t: number) => number = EASINGS.easeInOut;
  private finished = true;
  /** Playback rate multiplier (pose editor uses 0.25x). */
  rate = 1;

  constructor(initial: Pose) {
    this.current = resolvePose(initial);
    this.from = cloneResolved(this.current);
    this.target = cloneResolved(this.current);
  }

  get pose(): ResolvedPose {
    return this.current;
  }

  get animationName(): string | null {
    return this.anim?.name ?? null;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /**
   * Nominal time into the current animation (ms), using keyframe durations
   * rather than the shortened initial blend, so effects can sync to the loop.
   */
  get loopTimeMs(): number {
    if (!this.anim || this.keyIndex < 0) return 0;
    let t = 0;
    for (let i = 0; i < this.keyIndex; i++) t += this.anim.keyframes[i].durationMs;
    const key = this.anim.keyframes[this.keyIndex];
    const frac = Math.min(1, this.elapsed / this.duration);
    return t + frac * key.durationMs;
  }

  /** Total duration of an animation, not counting the initial blend. */
  static durationOf(anim: Animation): number {
    return anim.keyframes.reduce((s, k) => s + k.durationMs, 0);
  }

  play(anim: Animation, blendMs = 200): void {
    if (anim.keyframes.length === 0) return;
    this.anim = anim;
    this.keyIndex = 0;
    this.from = cloneResolved(this.current);
    this.target = resolvePose(anim.keyframes[0].pose, this.current);
    this.duration = Math.max(1, blendMs > 0 ? Math.min(blendMs, anim.keyframes[0].durationMs) : anim.keyframes[0].durationMs);
    this.easing = EASINGS[anim.keyframes[0].easing ?? "easeInOut"];
    this.elapsed = 0;
    this.finished = false;
  }

  /** Jump straight to a pose (pose editor scrubbing). */
  setPose(pose: Pose): void {
    this.current = resolvePose(pose, this.current);
    this.from = cloneResolved(this.current);
    this.target = cloneResolved(this.current);
    this.anim = null;
    this.finished = true;
  }

  /** Evaluate an animation at an absolute time (ms) without playing it. */
  static sample(anim: Animation, timeMs: number, start?: Pose): ResolvedPose {
    let prev = resolvePose(start ?? anim.keyframes[0].pose);
    let t = timeMs;
    for (const key of anim.keyframes) {
      const next = resolvePose(key.pose, prev);
      if (t <= key.durationMs) {
        const e = EASINGS[key.easing ?? "easeInOut"](Math.max(0, Math.min(1, t / key.durationMs)));
        return lerpResolved(prev, next, e);
      }
      t -= key.durationMs;
      prev = next;
    }
    return prev;
  }

  update(dtMs: number): ResolvedPose {
    if (this.finished || !this.anim) return this.current;
    this.elapsed += dtMs * this.rate;
    const t = Math.min(1, this.elapsed / this.duration);
    this.current = lerpResolved(this.from, this.target, this.easing(t));
    if (t >= 1) this.advance();
    return this.current;
  }

  private advance(): void {
    if (!this.anim) return;
    const next = this.keyIndex + 1;
    if (next >= this.anim.keyframes.length) {
      if (this.anim.loop) {
        this.keyIndex = -1;
        this.advance();
        return;
      }
      this.finished = true;
      return;
    }
    const key = this.anim.keyframes[next];
    this.keyIndex = next;
    this.from = cloneResolved(this.current);
    this.target = resolvePose(key.pose, this.current);
    this.duration = Math.max(1, key.durationMs);
    this.easing = EASINGS[key.easing ?? "easeInOut"];
    this.elapsed = 0;
  }
}
