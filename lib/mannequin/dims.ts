/** Mannequin proportions in meters. Total height ~1.77. */
export const DIMS = {
  hipsY: 0.93,
  spineUp: 0.12,
  chestUp: 0.22,
  neckUp: 0.2,
  headUp: 0.1,
  headR: 0.115,
  neckR: 0.045,
  neckLen: 0.06,

  chestR: 0.165,
  chestH: 0.2,
  chestScale: [1.15, 1, 0.78] as [number, number, number],
  pelvisR: 0.15,
  pelvisH: 0.06,
  pelvisScale: [1.1, 1, 0.8] as [number, number, number],

  shoulderX: 0.215,
  shoulderY: 0.12,
  upperArmR: 0.05,
  upperArmL: 0.27,
  forearmR: 0.044,
  forearmL: 0.25,

  hipX: 0.1,
  hipY: -0.04,
  thighR: 0.075,
  thighL: 0.4,
  shinR: 0.058,
  shinL: 0.4,
  /** Small enough to stay inside every shoe (its outline included). */
  foot: [0.074, 0.05, 0.2] as [number, number, number],
  footOffset: [0, -0.04, 0.045] as [number, number, number],

  /** Palm is thin on X: palms face the legs at rest. Width runs along Z. */
  palm: [0.028, 0.086, 0.074] as [number, number, number],
  palmDrop: 0.046,
  fingerR: 0.0105,
  fingerL: 0.042,
  knuckleDrop: 0.084,
  fingerSpacing: 0.0185,
  thumbR: 0.0115,
  thumbL: 0.036,
  wristR: 0.036,
} as const;

export const SKIN_COLOR = "#f4f4f2";
