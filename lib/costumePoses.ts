import { ARMS_UP_POSE, IDLE_POSE, mergePoses, mirrorPose, type Animation, type Pose } from "./poses";

/**
 * Looping signature animations for the rare costumes. Each one shows what the
 * costume is: the mannequin greets in character instead of waving.
 */

const OPEN = { peace: 0, open: 1, thumb: 1 };
const PAW = { peace: 0, open: 0.25, thumb: 0 };

// ---------------------------------------------------------------- cheetah: double cat wrists

const CAT_PAWS: Pose = mergePoses(IDLE_POSE, {
  joints: {
    shoulderL: [-48, 0, 20],
    shoulderR: [-48, 0, -20],
    elbowL: [-112, 0, 6],
    elbowR: [-112, 0, -6],
    wristL: [-72, 0, 0],
    wristR: [-72, 0, 0],
    head: [6, 0, 14],
    spine: [-4, 0, 3],
    kneeL: [6, 0, 0],
    kneeR: [6, 0, 0],
  },
  hands: { L: PAW, R: PAW },
});

export const CHEETAH_ANIM: Animation = {
  name: "cheetah",
  loop: true,
  keyframes: [
    { pose: CAT_PAWS, durationMs: 420, easing: "easeOutBack" },
    { pose: mergePoses(CAT_PAWS, { joints: { head: [6, 0, -14], spine: [-4, 0, -3] } }), durationMs: 520, easing: "easeInOut" },
    { pose: mergePoses(CAT_PAWS, { joints: { head: [6, 0, 14], spine: [-4, 0, 3] } }), durationMs: 520, easing: "easeInOut" },
    // paw pats
    { pose: mergePoses(CAT_PAWS, { joints: { wristL: [-40, 0, 0], elbowL: [-100, 0, 6] } }), durationMs: 140, easing: "easeOut" },
    { pose: CAT_PAWS, durationMs: 160, easing: "easeIn" },
    { pose: mergePoses(CAT_PAWS, { joints: { wristR: [-40, 0, 0], elbowR: [-100, 0, -6] } }), durationMs: 140, easing: "easeOut" },
    { pose: CAT_PAWS, durationMs: 160, easing: "easeIn" },
    { pose: mergePoses(CAT_PAWS, { joints: { wristL: [-40, 0, 0], elbowL: [-100, 0, 6] } }), durationMs: 140, easing: "easeOut" },
    { pose: CAT_PAWS, durationMs: 160, easing: "easeIn" },
    // stretch + crouch like a cat about to pounce
    {
      pose: {
        joints: {
          hipL: [-50, 0, 8],
          hipR: [-50, 0, -8],
          kneeL: [70, 0, 0],
          kneeR: [70, 0, 0],
          spine: [-26, 0, 0],
          chest: [-8, 0, 0],
          head: [18, 0, 0],
          shoulderL: [-60, 0, 30],
          shoulderR: [-60, 0, -30],
          elbowL: [-20, 0, 0],
          elbowR: [-20, 0, 0],
          wristL: [-30, 0, 0],
          wristR: [-30, 0, 0],
        },
        root: [0, -0.25, 0],
        hands: { L: PAW, R: PAW },
      },
      durationMs: 600,
      easing: "easeInOut",
    },
    { pose: CAT_PAWS, durationMs: 500, easing: "easeOutBack" },
    { pose: CAT_PAWS, durationMs: 700 },
  ],
};

// ---------------------------------------------------------------- T-rex: tiny arms, stomp, roar

const TREX_BASE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    shoulderL: [-72, 0, 10],
    shoulderR: [-72, 0, -10],
    elbowL: [-112, 0, 0],
    elbowR: [-112, 0, 0],
    wristL: [-30, 0, 0],
    wristR: [-30, 0, 0],
    spine: [-24, 0, 0],
    chest: [-6, 0, 0],
    head: [14, 0, 0],
    hipL: [-6, 0, 6],
    hipR: [-6, 0, -6],
    kneeL: [14, 0, 0],
    kneeR: [14, 0, 0],
  },
  root: [0, -0.04, 0],
  hands: { L: { peace: 0, open: 0.15, thumb: 0 }, R: { peace: 0, open: 0.15, thumb: 0 } },
});

const stomp = (side: "L" | "R"): Pose =>
  mergePoses(TREX_BASE, {
    joints: side === "L" ? { hipL: [-38, 0, 6], kneeL: [52, 0, 0], hips: [0, 0, -4] } : { hipR: [-38, 0, -6], kneeR: [52, 0, 0], hips: [0, 0, 4] },
    root: [0, 0.0, 0],
  });

export const TREX_ANIM: Animation = {
  name: "trex",
  loop: true,
  keyframes: [
    { pose: stomp("L"), durationMs: 380, easing: "easeInOut" },
    { pose: mergePoses(TREX_BASE, { root: [0, -0.07, 0], joints: { head: [18, 0, 0] } }), durationMs: 220, easing: "easeIn" },
    { pose: stomp("R"), durationMs: 380, easing: "easeInOut" },
    { pose: mergePoses(TREX_BASE, { root: [0, -0.07, 0], joints: { head: [18, 0, 0] } }), durationMs: 220, easing: "easeIn" },
    { pose: stomp("L"), durationMs: 380, easing: "easeInOut" },
    { pose: mergePoses(TREX_BASE, { root: [0, -0.07, 0], joints: { head: [18, 0, 0] } }), durationMs: 220, easing: "easeIn" },
    // roar: rear up, tiny arms wiggle
    {
      pose: mergePoses(TREX_BASE, { joints: { spine: [-6, 0, 0], head: [-28, 0, 0], elbowL: [-95, 0, 0], elbowR: [-125, 0, 0] }, root: [0, 0.02, 0] }),
      durationMs: 320,
      easing: "easeOut",
    },
    { pose: mergePoses(TREX_BASE, { joints: { spine: [-6, 0, 0], head: [-30, 0, 6], elbowL: [-125, 0, 0], elbowR: [-95, 0, 0] }, root: [0, 0.02, 0] }), durationMs: 180 },
    { pose: mergePoses(TREX_BASE, { joints: { spine: [-6, 0, 0], head: [-28, 0, -6], elbowL: [-95, 0, 0], elbowR: [-125, 0, 0] }, root: [0, 0.02, 0] }), durationMs: 180 },
    { pose: mergePoses(TREX_BASE, { joints: { spine: [-6, 0, 0], head: [-30, 0, 0], elbowL: [-125, 0, 0], elbowR: [-95, 0, 0] }, root: [0, 0.02, 0] }), durationMs: 180 },
    { pose: TREX_BASE, durationMs: 500, easing: "easeInOut" },
  ],
};

// ---------------------------------------------------------------- frog: crouch, tongue (effect), hop

// Frog squat: thighs forward and turned out so the knees point sideways,
// feet flat, hands low in front. (Checked in the pose editor from the front.)
const FROG_CROUCH: Pose = mergePoses(IDLE_POSE, {
  joints: {
    hipL: [-100, 50, 0],
    hipR: [-100, -50, 0],
    kneeL: [125, 0, 0],
    kneeR: [125, 0, 0],
    spine: [-16, 0, 0],
    chest: [-4, 0, 0],
    head: [12, 0, 0],
    shoulderL: [-50, 0, 20],
    shoulderR: [-50, 0, -20],
    elbowL: [-16, 0, 0],
    elbowR: [-16, 0, 0],
    wristL: [-28, 0, 0],
    wristR: [-28, 0, 0],
  },
  root: [0, -0.48, 0],
  hands: { L: OPEN, R: OPEN },
});

/** The tongue effect syncs to this: it fires at TONGUE_AT_MS into the loop. */
export const FROG_TONGUE_AT_MS = 1500;
export const FROG_LOOP_MS = 5500;

const FROG_JUMP: Pose = mergePoses(FROG_CROUCH, {
  joints: {
    hipL: [-16, 0, 16],
    hipR: [-16, 0, -16],
    kneeL: [14, 0, 0],
    kneeR: [14, 0, 0],
    spine: [-4, 0, 0],
    head: [-8, 0, 0],
    shoulderL: [-70, 0, 55],
    shoulderR: [-70, 0, -55],
    elbowL: [-16, 0, 0],
    elbowR: [-16, 0, 0],
    wristL: [0, 0, 0],
    wristR: [0, 0, 0],
  },
  root: [0, 0.3, 0],
});

export const FROG_ANIM: Animation = {
  name: "frog",
  loop: true,
  keyframes: [
    { pose: FROG_CROUCH, durationMs: 500, easing: "easeInOut" },
    { pose: mergePoses(FROG_CROUCH, { joints: { head: [12, 18, 0] } }), durationMs: 500, easing: "easeInOut" },
    { pose: mergePoses(FROG_CROUCH, { joints: { head: [8, -12, 0] } }), durationMs: 500, easing: "easeInOut" },
    // tongue snap (head jabs forward)
    { pose: mergePoses(FROG_CROUCH, { joints: { head: [-6, 0, 0], spine: [-28, 0, 0] } }), durationMs: 120, easing: "easeOut" },
    { pose: mergePoses(FROG_CROUCH, { joints: { head: [12, 0, 0] } }), durationMs: 380, easing: "easeInOut" },
    { pose: FROG_CROUCH, durationMs: 700 },
    // hop: gather, spring up with the arms sweeping, land back in the squat
    { pose: mergePoses(FROG_CROUCH, { root: [0, -0.54, 0], joints: { spine: [-24, 0, 0] } }), durationMs: 260, easing: "easeIn" },
    { pose: FROG_JUMP, durationMs: 320, easing: "easeOut" },
    { pose: FROG_CROUCH, durationMs: 300, easing: "easeIn" },
    { pose: mergePoses(FROG_CROUCH, { root: [0, -0.53, 0] }), durationMs: 120, easing: "easeOut" },
    { pose: FROG_CROUCH, durationMs: 1300, easing: "easeInOut" },
  ],
};

// ---------------------------------------------------------------- chicken: wings on hips, strut

const CHICKEN_BASE: Pose = mergePoses(IDLE_POSE, {
  joints: {
    shoulderL: [10, 0, 44],
    shoulderR: [10, 0, -44],
    elbowL: [-20, 0, -108],
    elbowR: [-20, 0, 108],
    wristL: [0, 0, -20],
    wristR: [0, 0, 20],
    kneeL: [8, 0, 0],
    kneeR: [8, 0, 0],
    spine: [-6, 0, 0],
    head: [4, 0, 0],
  },
  hands: { L: { open: 0.1 }, R: { open: 0.1 } },
});

const strut = (side: "L" | "R"): Pose =>
  mergePoses(CHICKEN_BASE, {
    joints: side === "L" ? { hipL: [-42, 0, 4], kneeL: [60, 0, 0], head: [22, 0, 0], spine: [-12, 0, 0] } : { hipR: [-42, 0, -4], kneeR: [60, 0, 0], head: [22, 0, 0], spine: [-12, 0, 0] },
    root: [0, 0.02, 0],
  });

export const CHICKEN_ANIM: Animation = {
  name: "chicken",
  loop: true,
  keyframes: [
    { pose: CHICKEN_BASE, durationMs: 400, easing: "easeOutBack" },
    { pose: strut("L"), durationMs: 260, easing: "easeInOut" },
    { pose: mergePoses(CHICKEN_BASE, { joints: { head: [-4, 0, 0] } }), durationMs: 220, easing: "easeInOut" },
    { pose: strut("R"), durationMs: 260, easing: "easeInOut" },
    { pose: mergePoses(CHICKEN_BASE, { joints: { head: [-4, 0, 0] } }), durationMs: 220, easing: "easeInOut" },
    { pose: strut("L"), durationMs: 260, easing: "easeInOut" },
    { pose: mergePoses(CHICKEN_BASE, { joints: { head: [-4, 0, 0] } }), durationMs: 220, easing: "easeInOut" },
    // look around
    { pose: mergePoses(CHICKEN_BASE, { joints: { head: [0, 34, 0] } }), durationMs: 200, easing: "easeOut" },
    { pose: mergePoses(CHICKEN_BASE, { joints: { head: [0, 34, 0] } }), durationMs: 350 },
    { pose: mergePoses(CHICKEN_BASE, { joints: { head: [0, -34, 0] } }), durationMs: 200, easing: "easeOut" },
    { pose: mergePoses(CHICKEN_BASE, { joints: { head: [0, -34, 0] } }), durationMs: 350 },
    // quick flap then back to hips
    { pose: mergePoses(CHICKEN_BASE, { joints: { shoulderL: [0, 0, 84], shoulderR: [0, 0, -84], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0], wristL: [0, 0, 0], wristR: [0, 0, 0] }, root: [0, -0.03, 0] }), durationMs: 130, easing: "easeOut" },
    { pose: mergePoses(CHICKEN_BASE, { joints: { shoulderL: [0, 0, 30], shoulderR: [0, 0, -30], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0], wristL: [0, 0, 0], wristR: [0, 0, 0] }, root: [0, 0.03, 0] }), durationMs: 130, easing: "easeIn" },
    { pose: mergePoses(CHICKEN_BASE, { joints: { shoulderL: [0, 0, 84], shoulderR: [0, 0, -84], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0], wristL: [0, 0, 0], wristR: [0, 0, 0] }, root: [0, -0.03, 0] }), durationMs: 130, easing: "easeOut" },
    { pose: CHICKEN_BASE, durationMs: 400, easing: "easeOutBack" },
    { pose: CHICKEN_BASE, durationMs: 500 },
  ],
};

// ---------------------------------------------------------------- shark: swims and floats

const SHARK_SWIM: Pose = mergePoses(IDLE_POSE, {
  joints: {
    spine: [-34, 0, 0],
    chest: [-10, 0, 0],
    head: [-16, 0, 0],
    shoulderL: [58, 0, 14],
    shoulderR: [58, 0, -14],
    elbowL: [-12, 0, 0],
    elbowR: [-12, 0, 0],
    hipL: [-14, 0, 5],
    hipR: [10, 0, -5],
    kneeL: [22, 0, 0],
    kneeR: [8, 0, 0],
  },
  root: [0, 0.2, 0],
  hands: { L: OPEN, R: OPEN },
});

const kick = (phase: number): Pose =>
  mergePoses(SHARK_SWIM, {
    joints:
      phase === 0
        ? { hipL: [-14, 0, 5], hipR: [10, 0, -5], kneeL: [22, 0, 0], kneeR: [8, 0, 0], spine: [-34, 0, 6], hips: [0, 8, 0] }
        : { hipL: [10, 0, 5], hipR: [-14, 0, -5], kneeL: [8, 0, 0], kneeR: [22, 0, 0], spine: [-34, 0, -6], hips: [0, -8, 0] },
    root: [0, phase === 0 ? 0.18 : 0.26, 0],
  });

export const SHARK_ANIM: Animation = {
  name: "shark",
  loop: true,
  keyframes: [
    { pose: kick(0), durationMs: 650, easing: "easeInOut" },
    { pose: kick(1), durationMs: 650, easing: "easeInOut" },
    { pose: kick(0), durationMs: 650, easing: "easeInOut" },
    { pose: kick(1), durationMs: 650, easing: "easeInOut" },
    // chomp
    { pose: mergePoses(kick(0), { joints: { head: [-40, 0, 0] } }), durationMs: 240, easing: "easeIn" },
    { pose: mergePoses(kick(0), { joints: { head: [12, 0, 0] } }), durationMs: 110, easing: "easeOut" },
    { pose: mergePoses(kick(0), { joints: { head: [-40, 0, 0] } }), durationMs: 200, easing: "easeIn" },
    { pose: mergePoses(kick(0), { joints: { head: [12, 0, 0] } }), durationMs: 110, easing: "easeOut" },
    { pose: kick(1), durationMs: 650, easing: "easeInOut" },
  ],
};

// ---------------------------------------------------------------- astronaut: float and hold a black hole

const DRIFT = { peace: 0, open: 0.55, thumb: 0.4 };
const HOLD = { peace: 0, open: 0.9, thumb: 1 };

/** Left hand raised, palm up: the black hole hovers over it (see effects). */
const ASTRO_HOLD: Pose = mergePoses(IDLE_POSE, {
  joints: {
    shoulderL: [-54, 0, 30],
    shoulderR: [-26, 0, -40],
    elbowL: [-56, 0, 18],
    elbowR: [-36, 0, -8],
    wristL: [-20, 0, 0],
    hipL: [-16, 0, 8],
    hipR: [-10, 0, -6],
    kneeL: [24, 0, 0],
    kneeR: [16, 0, 0],
    spine: [-4, 0, 4],
    head: [-8, 18, -6],
  },
  root: [0, 0.14, 0],
  yaw: -5,
  hands: { L: HOLD, R: DRIFT },
});

export const ASTRONAUT_FLOAT_ANIM: Animation = {
  name: "astronautFloat",
  loop: true,
  keyframes: [
    { pose: ASTRO_HOLD, durationMs: 1900, easing: "easeInOut" },
    {
      pose: mergePoses(ASTRO_HOLD, {
        joints: { shoulderR: [-16, 0, -50], elbowR: [-26, 0, -14], hipL: [-8, 0, 6], hipR: [-20, 0, -8], kneeL: [14, 0, 0], kneeR: [30, 0, 0], spine: [2, 0, -4], head: [-4, 24, 4], shoulderL: [-60, 0, 26], elbowL: [-52, 0, 22] },
        root: [0.02, 0.2, 0],
        yaw: 6,
      }),
      durationMs: 2100,
      easing: "easeInOut",
    },
    {
      pose: mergePoses(ASTRO_HOLD, {
        joints: { shoulderR: [-30, 0, -32], elbowR: [-50, 0, -4], hipL: [-14, 0, 10], hipR: [-14, 0, -10], kneeL: [22, 0, 0], kneeR: [22, 0, 0], spine: [-6, 0, 0], head: [-12, 14, 0] },
        root: [-0.02, 0.16, 0],
        yaw: 0,
      }),
      durationMs: 1800,
      easing: "easeInOut",
    },
  ],
};

// ---------------------------------------------------------------- diver: heavy trudge

export const DIVER_WALK_ANIM: Animation = {
  name: "diverWalk",
  loop: true,
  keyframes: [
    {
      pose: mergePoses(IDLE_POSE, {
        joints: { hipL: [-24, 0, 4], kneeL: [34, 0, 0], hipR: [8, 0, -4], spine: [-10, 0, 3], head: [10, 0, -3], shoulderL: [10, 0, 26], shoulderR: [-14, 0, -26], elbowL: [-14, 0, 0], elbowR: [-18, 0, 0] },
        root: [0, -0.02, 0],
      }),
      durationMs: 900,
      easing: "easeInOut",
    },
    {
      pose: mergePoses(IDLE_POSE, {
        joints: { hipL: [8, 0, 4], hipR: [-24, 0, -4], kneeR: [34, 0, 0], spine: [-10, 0, -3], head: [10, 0, 3], shoulderL: [-14, 0, 26], shoulderR: [10, 0, -26], elbowL: [-18, 0, 0], elbowR: [-14, 0, 0] },
        root: [0, -0.02, 0],
      }),
      durationMs: 900,
      easing: "easeInOut",
    },
  ],
};

export const ROAR_ARMS_UP = mergePoses(ARMS_UP_POSE, {});
export const MIRRORED_CAT_PAWS = mirrorPose(CAT_PAWS);

export const MASCOT_ANIMS: Record<string, Animation> = {
  cheetah: CHEETAH_ANIM,
  trex: TREX_ANIM,
  frog: FROG_ANIM,
  chicken: CHICKEN_ANIM,
  shark: SHARK_ANIM,
};

export const COSTUME_ANIMATION_PRESETS: Record<string, Animation> = {
  ...MASCOT_ANIMS,
  astronautFloat: ASTRONAUT_FLOAT_ANIM,
  diverWalk: DIVER_WALK_ANIM,
};

/** Looping animation a costume uses instead of the plain idle, if any. */
export function costumeAnimation(costume: string, mascot: string | null): Animation | null {
  switch (costume) {
    case "astronaut":
      return ASTRONAUT_FLOAT_ANIM;
    case "diver":
      return DIVER_WALK_ANIM;
    case "mascot":
      return (mascot && MASCOT_ANIMS[mascot]) || CHEETAH_ANIM;
    default:
      return null;
  }
}
