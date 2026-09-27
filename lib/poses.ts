/**
 * Pose presets and keyframed animations for the mannequin.
 *
 * Conventions (all joints use Euler order ZYX, degrees):
 * - x: forward/back lift (negative = forward), applied first to the hanging bone
 * - y: swing around vertical (splay for a lifted limb, twist for a hanging one)
 * - z: sideways abduction (positive = toward +X, which is the figure's LEFT and
 *      the viewer's screen RIGHT)
 * - root: whole-body position offset in meters; yaw: whole-body turn in degrees
 * - hands: peace (index+middle extended), open (all fingers), thumb (thumb out)
 */

export const JOINT_NAMES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "elbowL",
  "wristL",
  "shoulderR",
  "elbowR",
  "wristR",
  "hipL",
  "kneeL",
  "ankleL",
  "hipR",
  "kneeR",
  "ankleR",
] as const;
export type JointName = (typeof JOINT_NAMES)[number];

export type Vec3 = [number, number, number];

export interface HandPose {
  peace: number;
  open: number;
  thumb: number;
}

export interface Pose {
  joints: Partial<Record<JointName, Vec3>>;
  root?: Vec3;
  yaw?: number;
  hands?: { L?: Partial<HandPose>; R?: Partial<HandPose> };
}

export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "easeOutBack" | "bounce";

export interface Keyframe {
  pose: Pose;
  durationMs: number;
  easing?: Easing;
}

export interface Animation {
  name: string;
  keyframes: Keyframe[];
  loop?: boolean;
}

export type Side = "L" | "R";

const MIRROR: Record<JointName, JointName> = {
  hips: "hips",
  spine: "spine",
  chest: "chest",
  neck: "neck",
  head: "head",
  shoulderL: "shoulderR",
  elbowL: "elbowR",
  wristL: "wristR",
  shoulderR: "shoulderL",
  elbowR: "elbowL",
  wristR: "wristL",
  hipL: "hipR",
  kneeL: "kneeR",
  ankleL: "ankleR",
  hipR: "hipL",
  kneeR: "kneeL",
  ankleR: "ankleL",
};

/** Mirror a pose left <-> right. */
export function mirrorPose(pose: Pose): Pose {
  const joints: Pose["joints"] = {};
  for (const [name, rot] of Object.entries(pose.joints) as [JointName, Vec3][]) {
    joints[MIRROR[name]] = [rot[0], -rot[1], -rot[2]];
  }
  return {
    joints,
    root: pose.root ? [-pose.root[0], pose.root[1], pose.root[2]] : undefined,
    yaw: pose.yaw === undefined ? undefined : -pose.yaw,
    hands: pose.hands ? { L: pose.hands.R, R: pose.hands.L } : undefined,
  };
}

export function mirrorAnimation(anim: Animation, name = `${anim.name}_R`): Animation {
  return { ...anim, name, keyframes: anim.keyframes.map((k) => ({ ...k, pose: mirrorPose(k.pose) })) };
}

/** Merge poses: later entries override earlier ones per joint. */
export function mergePoses(...poses: Partial<Pose>[]): Pose {
  const out: Pose = { joints: {}, hands: {} };
  for (const p of poses) {
    if (p.joints) Object.assign(out.joints, p.joints);
    if (p.root) out.root = p.root;
    if (p.yaw !== undefined) out.yaw = p.yaw;
    if (p.hands?.L) out.hands!.L = { ...out.hands!.L, ...p.hands.L };
    if (p.hands?.R) out.hands!.R = { ...out.hands!.R, ...p.hands.R };
  }
  return out;
}

const RELAXED = { peace: 0, open: 0.3, thumb: 0 };
const PEACE = { peace: 1, open: 0, thumb: 0 };
const OPEN = { peace: 0, open: 1, thumb: 1 };
const FIST = { peace: 0, open: 0, thumb: 0 };

// ---------------------------------------------------------------- presets

/** Every joint at zero: the base that fully-specified poses are built on. */
const NEUTRAL_JOINTS = Object.fromEntries(JOINT_NAMES.map((n) => [n, [0, 0, 0] as Vec3])) as Record<JointName, Vec3>;

/**
 * IDLE lists every joint (and yaw) on purpose: the player inherits anything a
 * keyframe leaves out from the previous pose, so returning to idle from a pose
 * that bends knees or turns the figure around must reset all of it.
 */
export const IDLE_POSE: Pose = {
  joints: {
    ...NEUTRAL_JOINTS,
    shoulderL: [0, 0, 5],
    shoulderR: [0, 0, -5],
    elbowL: [-8, 0, 0],
    elbowR: [-8, 0, 0],
    hipL: [0, 0, 2],
    hipR: [0, 0, -2],
  },
  root: [0, 0, 0],
  yaw: 0,
  hands: { L: RELAXED, R: RELAXED },
};

export const ANTICIPATION_POSE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    hipL: [-22, 0, 3],
    hipR: [-22, 0, -3],
    kneeL: [30, 0, 0],
    kneeR: [30, 0, 0],
    spine: [-10, 0, 0],
    chest: [-4, 0, 0],
    head: [8, 0, 0],
    shoulderL: [-15, 0, 22],
    shoulderR: [-15, 0, -22],
    elbowL: [-25, 0, 0],
    elbowR: [-25, 0, 0],
  },
  root: [0, -0.09, 0],
  hands: { L: { open: 0.7 }, R: { open: 0.7 } },
});

/** Arms forward, open hands: "you, strike a pose". */
export const STRIKE_POSE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    shoulderL: [-72, 0, 24],
    shoulderR: [-72, 0, -24],
    elbowL: [-18, 0, 0],
    elbowR: [-18, 0, 0],
    head: [-6, 0, 0],
    spine: [-4, 0, 0],
    hipL: [-3, 0, 4],
    hipR: [-3, 0, -4],
  },
  root: [0, 0, 0],
  hands: { L: OPEN, R: OPEN },
});

export const THINKING_POSE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    shoulderR: [-42, 0, -12],
    elbowR: [-118, 0, 0],
    wristR: [0, 0, 0],
    shoulderL: [0, 0, 6],
    elbowL: [-10, 0, 0],
    head: [12, -14, 6],
    spine: [4, 0, 0],
    hipL: [0, 0, 3],
    hipR: [0, 0, -3],
  },
  root: [0, 0, 0],
  hands: { L: RELAXED, R: { peace: 0, open: 0.25, thumb: 0 } },
});

export const THUMBS_UP_POSE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    shoulderR: [-38, 0, -14],
    elbowR: [-72, 0, 0],
    wristR: [0, 0, 0],
    shoulderL: [0, 0, 6],
    elbowL: [-8, 0, 0],
    head: [0, 0, -6],
    spine: [0, 0, 3],
    hipL: [0, 0, 2],
    hipR: [0, 0, -2],
  },
  root: [0, 0, 0],
  hands: { L: RELAXED, R: { ...FIST, thumb: 1 } },
});

export const ARMS_UP_POSE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    shoulderL: [-10, 0, 160],
    shoulderR: [-10, 0, -160],
    elbowL: [0, 0, 18],
    elbowR: [0, 0, -18],
    head: [-10, 0, 0],
    spine: [-4, 0, 0],
    hipL: [0, 0, 4],
    hipR: [0, 0, -4],
  },
  root: [0, 0, 0],
  hands: { L: OPEN, R: OPEN },
});

export const SLUMP_POSE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    hipL: [-88, 0, 4],
    hipR: [-88, 0, -4],
    kneeL: [112, 0, 0],
    kneeR: [112, 0, 0],
    spine: [32, 0, 0],
    chest: [10, 0, 0],
    head: [42, 0, 0],
    shoulderL: [-25, 0, 8],
    shoulderR: [-25, 0, -8],
    elbowL: [-10, 0, 0],
    elbowR: [-10, 0, 0],
  },
  root: [0, -0.46, 0.05],
  hands: { L: RELAXED, R: RELAXED },
});

/** Sitting cross-legged with the back turned. */
export const SIT_CROSS_POSE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    hipL: [-85, 50, 0],
    hipR: [-85, -50, 0],
    kneeL: [0, 0, -112],
    kneeR: [0, 0, 112],
    spine: [8, 0, 0],
    chest: [4, 0, 0],
    head: [14, 0, 0],
    shoulderL: [-62, 0, 18],
    shoulderR: [-62, 0, -18],
    elbowL: [-28, 0, 104],
    elbowR: [-28, 0, -104],
  },
  root: [0, -0.73, 0],
  yaw: 180,
  hands: { L: FIST, R: FIST },
});

// ---------------------------------------------------------------- idol poses

/** Double-peace idol poses, in spec order. */
const IDOL_RAW: Pose[] = [
  // peace signs framing the face, head tilted, lean forward
  {
    joints: {
      shoulderL: [-38, 0, 58],
      shoulderR: [-38, 0, -58],
      elbowL: [-22, 0, 122],
      elbowR: [-22, 0, -122],
      head: [4, 0, 14],
      spine: [-10, 0, 0],
      chest: [-4, 0, 0],
      hipL: [0, 0, 3],
      hipR: [0, 0, -3],
    },
    root: [0, 0, 0],
    hands: { L: PEACE, R: PEACE },
  },
  // peace signs at cheeks, head tilted, one knee bent inward
  {
    joints: {
      shoulderL: [-28, 0, 36],
      shoulderR: [-28, 0, -36],
      elbowL: [-32, 0, 138],
      elbowR: [-32, 0, -138],
      head: [2, 0, -15],
      spine: [-3, 0, 4],
      hipR: [-6, 18, -4],
      kneeR: [26, 0, 0],
      hipL: [0, 0, 2],
    },
    root: [0, -0.02, 0],
    hands: { L: PEACE, R: PEACE },
  },
  // peace signs at chest height, shoulders raised, knees together, shy lean
  {
    joints: {
      shoulderL: [-58, 0, 22],
      shoulderR: [-58, 0, -22],
      elbowL: [-42, 0, 108],
      elbowR: [-42, 0, -108],
      chest: [-2, 0, 0],
      spine: [-6, 0, 6],
      head: [10, 0, 10],
      hipL: [0, 0, -4],
      hipR: [0, 0, 4],
      kneeL: [8, 0, 0],
      kneeR: [8, 0, 0],
    },
    root: [0, -0.01, 0],
    hands: { L: PEACE, R: PEACE },
  },
  // peace signs beside the head, one leg kicked up behind, slight hop
  {
    joints: {
      shoulderL: [-22, 0, 116],
      shoulderR: [-22, 0, -116],
      elbowL: [0, 0, 62],
      elbowR: [0, 0, -62],
      hipL: [42, 0, 6],
      kneeL: [96, 0, 0],
      hipR: [0, 0, -3],
      spine: [4, 0, -4],
      head: [-4, 0, 6],
    },
    root: [0, 0.05, 0],
    hands: { L: PEACE, R: PEACE },
  },
  // arms forward with peace signs, one hip popped out
  {
    joints: {
      shoulderL: [-86, 0, 12],
      shoulderR: [-86, 0, -12],
      elbowL: [-12, 0, 0],
      elbowR: [-12, 0, 0],
      hips: [0, 0, 8],
      spine: [0, 0, -8],
      head: [0, 0, 5],
      hipL: [0, 0, 6],
      hipR: [0, 0, -2],
      kneeR: [10, 0, 0],
    },
    root: [0, 0, 0],
    hands: { L: PEACE, R: PEACE },
  },
];

/** Fully specified (see IDLE_POSE): a costume's bent wrists must not leak into the peace signs. */
export const IDOL_POSES: Pose[] = IDOL_RAW.map((p) => mergePoses(IDLE_POSE, p));

// ---------------------------------------------------------------- animations

export const IDLE_ANIM: Animation = {
  name: "idle",
  keyframes: [{ pose: IDLE_POSE, durationMs: 400, easing: "easeInOut" }],
};

function holdAnim(name: string, pose: Pose, blendMs = 320): Animation {
  return { name, keyframes: [{ pose, durationMs: blendMs, easing: "easeOut" }] };
}

export const ANTICIPATION_ANIM = holdAnim("anticipation", ANTICIPATION_POSE);
export const STRIKE_POSE_ANIM = holdAnim("strikePose", STRIKE_POSE);

/**
 * Battle scan: turned toward the opponent (main figure stands on the right,
 * so it faces -x), fists up, light bounce. The opponent plays the mirror.
 */
export const FIGHT_STANCE_POSE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    shoulderL: [-62, 0, 24],
    shoulderR: [-62, 0, -24],
    elbowL: [-118, 0, 10],
    elbowR: [-118, 0, -10],
    wristL: [-25, 0, 0],
    wristR: [-25, 0, 0],
    hipL: [-10, 0, 10],
    hipR: [-10, 0, -10],
    kneeL: [16, 0, 0],
    kneeR: [16, 0, 0],
    spine: [-8, 0, 0],
    chest: [-4, 0, 0],
    head: [6, 0, 0],
  },
  root: [0, -0.03, 0],
  // Turned toward screen right (positive yaw), i.e. toward an opponent standing to its right;
  // figures on the right half play the mirrored stance and turn left.
  yaw: 65,
  hands: { L: FIST, R: FIST },
});

export const FIGHT_STANCE_ANIM: Animation = {
  name: "fightStance",
  loop: true,
  keyframes: [
    { pose: FIGHT_STANCE_POSE, durationMs: 280, easing: "easeOut" },
    { pose: mergePoses(FIGHT_STANCE_POSE, { root: [0, 0, 0], joints: { elbowL: [-110, 0, 10], spine: [-10, 0, 3] } }), durationMs: 300, easing: "easeInOut" },
    { pose: FIGHT_STANCE_POSE, durationMs: 300, easing: "easeInOut" },
    { pose: mergePoses(FIGHT_STANCE_POSE, { root: [0, 0, 0], joints: { elbowR: [-110, 0, -10], spine: [-10, 0, -3] } }), durationMs: 300, easing: "easeInOut" },
  ],
};
/** The same stance squared up to the crowd: the middle figure of an odd-sized squad. */
export const FIGHT_STANCE_FRONT_ANIM: Animation = {
  ...FIGHT_STANCE_ANIM,
  name: "fightStanceFront",
  keyframes: FIGHT_STANCE_ANIM.keyframes.map((k) => ({ ...k, pose: { ...k.pose, yaw: 0 } })),
};
export const THINKING_ANIM = holdAnim("thinking", THINKING_POSE, 500);
export const THUMBS_UP_ANIM: Animation = {
  name: "thumbsUp",
  keyframes: [
    { pose: mergePoses(THUMBS_UP_POSE, { joints: { elbowR: [-95, 0, 0] } }), durationMs: 260, easing: "easeOut" },
    { pose: THUMBS_UP_POSE, durationMs: 180, easing: "easeOutBack" },
  ],
};
export const SIT_CROSS_ANIM: Animation = {
  name: "sitCross",
  keyframes: [
    { pose: mergePoses(IDLE_POSE, { yaw: 180 }), durationMs: 600, easing: "easeInOut" },
    { pose: SIT_CROSS_POSE, durationMs: 700, easing: "easeIn" },
  ],
};

/**
 * Wave with the LEFT arm (figure's left = viewer's screen right).
 * Upper arm near horizontal, elbow ~100 degrees, open hand, forearm oscillates
 * +/- 25 degrees three times over ~1.8s with a wrist flick, head tilt, lean,
 * knee bounce.
 */
function buildWave(opts: {
  amplitude: number;
  cycles: number;
  halfCycleMs: number;
  shoulderZ: number;
  elbowZ: number;
  /** Knee bounce and head bob, 1 = full, 0 = none. */
  bounce?: number;
  /** Bored posture, 0 = none, 1 = slouched, head drooping and turned away. */
  slouch?: number;
  settleMs?: number;
}): Animation {
  const { amplitude, cycles, halfCycleMs, shoulderZ, elbowZ, bounce = 1, slouch = 0, settleMs = 380 } = opts;
  const head = (roll: number): Vec3 => [slouch * 20, -slouch * 12, roll];
  const rootY = -0.015 - slouch * 0.015;
  const base: Pose = {
    joints: {
      shoulderL: [-12, 0, shoulderZ],
      elbowL: [0, 0, elbowZ],
      wristL: [0, 0, 0],
      shoulderR: [0, 0, -6],
      elbowR: [-8, 0, 0],
      head: head(12),
      spine: [slouch * 14, 0, 4],
      hipL: [0, 0, 2],
      hipR: [0, 0, -2],
      kneeL: [6, 0, 0],
      kneeR: [6, 0, 0],
    },
    root: [0, rootY, 0],
    hands: { L: OPEN, R: RELAXED },
  };
  const keyframes: Keyframe[] = [{ pose: base, durationMs: 240, easing: "easeOut" }];
  for (let i = 0; i < cycles * 2; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const knee = dir > 0 ? 4 + 8 * bounce : 4;
    keyframes.push({
      pose: mergePoses(base, {
        joints: {
          elbowL: [0, 0, elbowZ + dir * amplitude],
          wristL: [0, 0, -dir * amplitude * 0.45],
          head: head(12 + dir * 2 * bounce),
          kneeL: [knee, 0, 0],
          kneeR: [knee, 0, 0],
        },
        root: [0, rootY + (dir > 0 ? -0.015 : 0.01) * bounce, 0],
      }),
      durationMs: halfCycleMs,
      easing: "easeInOut",
    });
  }
  keyframes.push({ pose: IDLE_POSE, durationMs: settleMs, easing: "easeInOut" });
  return { name: "wave", keyframes };
}

export const WAVE_ANIM_L = buildWave({ amplitude: 25, cycles: 3, halfCycleMs: 270, shoulderZ: 84, elbowZ: 96 });
export const WAVE_ANIM_R = mirrorAnimation(WAVE_ANIM_L, "wave_R");

export const WAVE_SMALL_ANIM_L: Animation = {
  ...buildWave({ amplitude: 14, cycles: 2, halfCycleMs: 200, shoulderZ: 62, elbowZ: 92 }),
  name: "waveSmall",
};
export const WAVE_SMALL_ANIM_R = mirrorAnimation(WAVE_SMALL_ANIM_L, "waveSmall_R");

export const CELEBRATE_ANIM: Animation = {
  name: "celebrate",
  keyframes: [
    { pose: ANTICIPATION_POSE, durationMs: 260, easing: "easeIn" },
    {
      pose: mergePoses(ARMS_UP_POSE, {
        joints: { kneeL: [38, 0, 0], kneeR: [38, 0, 0], hipL: [-20, 0, 6], hipR: [-20, 0, -6] },
        root: [0, 0.36, 0],
      }),
      durationMs: 300,
      easing: "easeOut",
    },
    {
      pose: mergePoses(ARMS_UP_POSE, {
        joints: { kneeL: [30, 0, 0], kneeR: [30, 0, 0], hipL: [-16, 0, 6], hipR: [-16, 0, -6] },
        root: [0, 0.3, 0],
      }),
      durationMs: 140,
      easing: "linear",
    },
    { pose: mergePoses(ANTICIPATION_POSE, { joints: { shoulderL: [-10, 0, 150], shoulderR: [-10, 0, -150] } }), durationMs: 260, easing: "easeIn" },
    { pose: ARMS_UP_POSE, durationMs: 320, easing: "easeOutBack" },
  ],
};

export const SLUMP_ANIM: Animation = {
  name: "slump",
  keyframes: [
    {
      pose: mergePoses(IDLE_POSE, { joints: { head: [30, 0, 0], spine: [18, 0, 0], shoulderL: [0, 0, 2], shoulderR: [0, 0, -2] } }),
      durationMs: 420,
      easing: "easeInOut",
    },
    { pose: SLUMP_POSE, durationMs: 650, easing: "easeIn" },
    { pose: mergePoses(SLUMP_POSE, { joints: { head: [48, 0, 0] } }), durationMs: 500, easing: "easeInOut" },
  ],
};

/** Proud presenting pose used while printing a certificate. */
export const PRESENT_ANIM = holdAnim(
  "present",
  {
    joints: {
      shoulderL: [-60, 0, 70],
      elbowL: [-10, 0, 20],
      shoulderR: [0, 0, -6],
      elbowR: [-8, 0, 0],
      head: [-4, 12, 4],
      spine: [-4, 0, -3],
      chest: [-4, 0, 0],
      hipL: [0, 0, 3],
      hipR: [0, 0, -3],
    },
    root: [0, 0, 0],
    hands: { L: OPEN, R: RELAXED },
  },
  400,
);

/**
 * Holding a laptop on the left forearm and typing with the right hand.
 * The laptop prop itself is attached by the scene while this plays.
 */
const TYPING_BASE: Pose = {
  joints: {
    shoulderL: [-14, 0, 2],
    elbowL: [-76, 0, 0],
    wristL: [0, 90, 0],
    shoulderR: [-34, 0, 44],
    elbowR: [-64, 0, 0],
    wristR: [22, 90, 0],
    head: [40, 4, 0],
    spine: [-6, 0, 0],
    chest: [-4, 0, 0],
    hipL: [0, 0, 3],
    hipR: [0, 0, -3],
  },
  root: [0, 0, 0],
  hands: { L: { peace: 0, open: 0.4, thumb: 0.6 }, R: { peace: 0, open: 0.4, thumb: 0 } },
};

export const TYPING_ANIM: Animation = {
  name: "typing",
  loop: true,
  keyframes: [
    { pose: TYPING_BASE, durationMs: 320, easing: "easeOut" },
    { pose: mergePoses(TYPING_BASE, { joints: { wristR: [8, 90, 0], elbowR: [-58, 0, 0], shoulderR: [-32, 0, 38] } }), durationMs: 110 },
    { pose: mergePoses(TYPING_BASE, { joints: { wristR: [26, 90, 0], elbowR: [-64, 0, 0], shoulderR: [-32, 0, 30] } }), durationMs: 120 },
    { pose: mergePoses(TYPING_BASE, { joints: { wristR: [10, 90, 0], elbowR: [-60, 0, 0], shoulderR: [-32, 0, 36] } }), durationMs: 100 },
    { pose: mergePoses(TYPING_BASE, { joints: { wristR: [24, 90, 0], elbowR: [-66, 0, 0], shoulderR: [-32, 0, 28] } }), durationMs: 130 },
    { pose: mergePoses(TYPING_BASE, { joints: { wristR: [8, 90, 0], elbowR: [-58, 0, 0], head: [38, 8, 0] } }), durationMs: 110 },
    { pose: mergePoses(TYPING_BASE, { joints: { wristR: [26, 90, 0], elbowR: [-64, 0, 0], head: [38, 0, 0] } }), durationMs: 120 },
    { pose: mergePoses(TYPING_BASE, { joints: { head: [30, 6, 3] } }), durationMs: 500, easing: "easeInOut" },
  ],
};

// ---------------------------------------------------------------- meltdown (Stage 12)

/** Arms crossed, foot tapping, unimpressed. */
const CROSS_ARMS_POSE: Pose = {
  joints: {
    shoulderL: [-60, 0, 16],
    shoulderR: [-60, 0, -16],
    elbowL: [-28, 0, 102],
    elbowR: [-28, 0, -102],
    wristL: [0, 0, -10],
    wristR: [0, 0, 10],
    head: [4, 0, -8],
    spine: [2, 0, 3],
    hipL: [0, 0, 3],
    hipR: [-8, 0, -4],
    kneeR: [12, 0, 0],
    ankleR: [-18, 0, 0],
  },
  root: [0, 0, 0],
  hands: { L: FIST, R: FIST },
};

export const CROSS_ARMS_TAP_ANIM: Animation = {
  name: "crossArmsTap",
  loop: true,
  keyframes: [
    { pose: CROSS_ARMS_POSE, durationMs: 420, easing: "easeOut" },
    { pose: mergePoses(CROSS_ARMS_POSE, { joints: { ankleR: [6, 0, 0], kneeR: [4, 0, 0] } }), durationMs: 170, easing: "easeIn" },
    { pose: mergePoses(CROSS_ARMS_POSE, { joints: { ankleR: [-18, 0, 0], kneeR: [12, 0, 0] } }), durationMs: 170, easing: "easeOut" },
    { pose: mergePoses(CROSS_ARMS_POSE, { joints: { ankleR: [6, 0, 0], kneeR: [4, 0, 0] } }), durationMs: 170, easing: "easeIn" },
    { pose: mergePoses(CROSS_ARMS_POSE, { joints: { ankleR: [-18, 0, 0], kneeR: [12, 0, 0], head: [4, 14, -8] } }), durationMs: 260, easing: "easeInOut" },
    { pose: mergePoses(CROSS_ARMS_POSE, { joints: { ankleR: [6, 0, 0], kneeR: [4, 0, 0], head: [4, -14, -8] } }), durationMs: 260, easing: "easeInOut" },
    { pose: CROSS_ARMS_POSE, durationMs: 260, easing: "easeInOut" },
  ],
};

/** Flat palm toward the person: stop. */
const PALM_STOP_POSE: Pose = mergePoses(IDLE_POSE, {
  joints: { shoulderR: [-88, 0, -8], elbowR: [-4, 0, 0], wristR: [-16, 0, 0], head: [2, 18, 0], spine: [0, 6, 0] },
  hands: { R: OPEN, L: RELAXED },
});

/** Stop -> turn away -> sit cross-legged. */
export const SULK_ENTER_ANIM: Animation = {
  name: "sulkEnter",
  keyframes: [
    { pose: PALM_STOP_POSE, durationMs: 320, easing: "easeOutBack" },
    { pose: PALM_STOP_POSE, durationMs: 900 },
    { pose: mergePoses(IDLE_POSE, { yaw: 180 }), durationMs: 650, easing: "easeInOut" },
    { pose: SIT_CROSS_POSE, durationMs: 700, easing: "easeIn" },
  ],
};

/** Stand up, turn around, dust off. */
export const SULK_EXIT_ANIM: Animation = {
  name: "sulkExit",
  keyframes: [
    { pose: mergePoses(IDLE_POSE, { yaw: 180 }), durationMs: 600, easing: "easeInOut" },
    { pose: IDLE_POSE, durationMs: 500, easing: "easeInOut" },
    { pose: mergePoses(IDLE_POSE, { joints: { shoulderL: [-24, 0, 6], elbowL: [-38, 0, 0], shoulderR: [-24, 0, -6], elbowR: [-38, 0, 0], spine: [8, 0, 0], head: [16, 0, 0] }, hands: { L: OPEN, R: OPEN } }), durationMs: 260, easing: "easeInOut" },
    { pose: mergePoses(IDLE_POSE, { joints: { shoulderL: [-8, 0, 6], elbowL: [-30, 0, 0], shoulderR: [-8, 0, -6], elbowR: [-30, 0, 0], spine: [8, 0, 0], head: [16, 0, 0] }, hands: { L: OPEN, R: OPEN } }), durationMs: 180 },
    { pose: mergePoses(IDLE_POSE, { joints: { shoulderL: [-24, 0, 6], elbowL: [-38, 0, 0], shoulderR: [-24, 0, -6], elbowR: [-38, 0, 0], spine: [8, 0, 0], head: [16, 0, 0] }, hands: { L: OPEN, R: OPEN } }), durationMs: 180 },
    { pose: mergePoses(IDLE_POSE, { joints: { shoulderL: [-8, 0, 6], elbowL: [-30, 0, 0], shoulderR: [-8, 0, -6], elbowR: [-30, 0, 0], spine: [8, 0, 0], head: [16, 0, 0] }, hands: { L: OPEN, R: OPEN } }), durationMs: 180 },
    { pose: IDLE_POSE, durationMs: 400, easing: "easeInOut" },
  ],
};

export function idolAnimation(index: number): Animation {
  const pose = IDOL_POSES[((index % IDOL_POSES.length) + IDOL_POSES.length) % IDOL_POSES.length];
  return {
    name: `idol${index}`,
    keyframes: [
      { pose: mergePoses(pose, { root: [0, (pose.root?.[1] ?? 0) - 0.04, 0] }), durationMs: 260, easing: "easeIn" },
      { pose, durationMs: 220, easing: "easeOutBack" },
    ],
  };
}

export function waveAnimation(side: Side, small = false): Animation {
  if (small) return side === "L" ? WAVE_SMALL_ANIM_L : WAVE_SMALL_ANIM_R;
  return side === "L" ? WAVE_ANIM_L : WAVE_ANIM_R;
}

/**
 * Waving back again and again before a scan: the same wave, more bored each
 * time. 0 = the full wave; 1 = one slow flap from a low arm, slouched, head
 * drooping and turned away, no bounce.
 */
export function boredWaveAnimation(side: Side, boredom: number): Animation {
  const b = Math.max(0, Math.min(1, boredom));
  const lerp = (from: number, to: number) => from + (to - from) * b;
  const wave: Animation = {
    ...buildWave({
      amplitude: lerp(25, 7),
      cycles: b < 0.35 ? 3 : b < 0.75 ? 2 : 1,
      halfCycleMs: Math.round(lerp(270, 560)),
      shoulderZ: lerp(84, 34),
      elbowZ: lerp(96, 84),
      bounce: 1 - b,
      slouch: b,
      settleMs: Math.round(lerp(380, 720)),
    }),
    name: `waveBored${Math.round(b * 10)}`,
  };
  return side === "L" ? wave : mirrorAnimation(wave, `${wave.name}_R`);
}

/** Boredom for the Nth wave since the last scan (2 = the first wave back after the greeting). */
export function waveBoredom(count: number): number {
  return Math.max(0, Math.min(1, (count - 2) / 5));
}

/** All named presets, for the pose editor. */
export const POSE_PRESETS: Record<string, Pose> = {
  idle: IDLE_POSE,
  anticipation: ANTICIPATION_POSE,
  strikePose: STRIKE_POSE,
  thinking: THINKING_POSE,
  thumbsUp: THUMBS_UP_POSE,
  armsUp: ARMS_UP_POSE,
  slump: SLUMP_POSE,
  sitCross: SIT_CROSS_POSE,
  idol1: IDOL_POSES[0],
  idol2: IDOL_POSES[1],
  idol3: IDOL_POSES[2],
  idol4: IDOL_POSES[3],
  idol5: IDOL_POSES[4],
  waveL: WAVE_ANIM_L.keyframes[1].pose,
  waveR: WAVE_ANIM_R.keyframes[1].pose,
};

export const ANIMATION_PRESETS: Record<string, Animation> = {
  idle: IDLE_ANIM,
  waveL: WAVE_ANIM_L,
  waveR: WAVE_ANIM_R,
  waveSmallL: WAVE_SMALL_ANIM_L,
  waveSmallR: WAVE_SMALL_ANIM_R,
  idol1: idolAnimation(0),
  idol2: idolAnimation(1),
  idol3: idolAnimation(2),
  idol4: idolAnimation(3),
  idol5: idolAnimation(4),
  anticipation: ANTICIPATION_ANIM,
  strikePose: STRIKE_POSE_ANIM,
  thinking: THINKING_ANIM,
  thumbsUp: THUMBS_UP_ANIM,
  celebrate: CELEBRATE_ANIM,
  slump: SLUMP_ANIM,
  sitCross: SIT_CROSS_ANIM,
  present: PRESENT_ANIM,
  typing: TYPING_ANIM,
  crossArmsTap: CROSS_ARMS_TAP_ANIM,
  sulkEnter: SULK_ENTER_ANIM,
  sulkExit: SULK_EXIT_ANIM,
  fightStance: FIGHT_STANCE_ANIM,
};
