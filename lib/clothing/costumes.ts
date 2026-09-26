import { BRASS, D, FABRIC, SILVER, darken, ellipsoid, legs, lighten, sleeves, torsoShell, waist, type Ctx } from "./shells";
import type { MascotAnimal, Outfit } from "./types";

/**
 * Rare full-body costumes (1% of rolls): animal mascot suits, an astronaut
 * suit and a brass-helmet diving suit. Built from the same shell helpers as
 * regular garments. Hands stay uncovered so gestures still read.
 */

const HEAD_Y = D.headR * 0.72;

interface SuitOpts {
  color: string;
  belly?: string;
  material?: Parameters<typeof torsoShell>[2]["material"];
  inflate?: number;
}

/** Full body suit: torso, long sleeves, trousers, boots. */
function bodySuit(c: Ctx, o: SuitOpts): void {
  const m = o.material ?? FABRIC.fleece;
  const inflate = o.inflate ?? 1.16;
  torsoShell(c, o.color, { hem: 0.4, fit: "regular", inflate, material: m, z: 0.86 });
  sleeves(c, o.color, { length: "long", fit: "regular", inflate: inflate * 1.12, material: m });
  waist(c, o.color, { inflate: 1.08, material: m });
  legs(c, o.color, { thighR: 0.105, shinR: 0.095, material: m, shinLength: D.shinL - 0.02 });
  // Joint covers in the suit color: bent knees, elbows and splayed hips would
  // otherwise show the bare figure between the shell pieces.
  for (const side of ["L", "R"] as const) {
    c.add(c.P.sphere(0.098), o.color, c.J[`knee${side}`], { material: m });
    c.add(c.P.sphere(0.105), o.color, c.J[`hip${side}`], { material: m });
    c.add(c.P.sphere(0.05 * inflate * 1.1), o.color, c.J[`elbow${side}`], { material: m });
  }
  // Belly patch sits on the suit's surface (inside it, only two lobes poked out).
  if (o.belly) ellipsoid(c, o.belly, c.J.chest, [0.125, 0.17, 0.04], [0, -0.1, 0.15], m);
}

function bigFeet(c: Ctx, color: string, material = FABRIC.fleece, size: [number, number, number] = [0.13, 0.09, 0.3]): void {
  const [fx, fy, fz] = D.footOffset;
  for (const side of ["L", "R"] as const) {
    c.add(c.P.box(...size, 0.04), color, c.J[`ankle${side}`], { position: [fx, fy - 0.01, fz + 0.02], material });
  }
}

function eyes(c: Ctx, x: number, y: number, z: number, r = 0.03, white = false): void {
  for (const s of [1, -1]) {
    if (white) {
      c.add(c.P.sphere(r * 1.7), "#ffffff", c.J.head, { position: [s * x, y, z - r * 0.4], material: FABRIC.plastic });
    }
    c.add(c.P.sphere(r), "#111111", c.J.head, { position: [s * x, y, z], noOutline: true, material: FABRIC.glass });
    c.add(c.P.sphere(r * 0.35), "#ffffff", c.J.head, { position: [s * x + r * 0.3, y + r * 0.35, z + r * 0.75], noOutline: true });
  }
}

// ---------------------------------------------------------------- mascots

function cheetah(c: Ctx, color: string): void {
  const spots = { ...FABRIC.fleece, pattern: { kind: "spots" as const, colorA: color, colorB: "#241a12", colorC: "#8a5a2b", repeat: [3, 3] as [number, number], seed: 11 } };
  const cream = "#f4e6c8";
  bodySuit(c, { color, belly: cream, material: spots });
  bigFeet(c, darken(color, 0.9), spots);
  const head = c.J.head;
  c.add(c.P.sphere(0.19), color, head, { position: [0, HEAD_Y + 0.02, 0], material: spots });
  // ears
  for (const s of [1, -1]) {
    c.add(c.P.sphere(0.05, Math.PI * 0.6), color, head, { position: [s * 0.13, HEAD_Y + 0.17, -0.02], rotation: [-0.3, 0, s * 0.5], material: spots });
    c.add(c.P.sphere(0.028), "#2a1a12", head, { position: [s * 0.13, HEAD_Y + 0.175, 0.01], noOutline: true, material: FABRIC.fleece });
  }
  // muzzle, nose, tear lines, whiskers
  ellipsoid(c, cream, head, [0.085, 0.06, 0.07], [0, HEAD_Y - 0.03, 0.165], FABRIC.fleece);
  c.add(c.P.sphere(0.024), "#1a1a1a", head, { position: [0, HEAD_Y + 0.0, 0.232], noOutline: true, material: FABRIC.plastic });
  eyes(c, 0.065, HEAD_Y + 0.07, 0.17, 0.026);
  for (const s of [1, -1]) {
    c.add(c.P.box(0.01, 0.075, 0.006, 0.003), "#1a1a1a", head, { position: [s * 0.05, HEAD_Y + 0.01, 0.19], rotation: [0, 0, s * 0.35], noOutline: true });
    for (let i = 0; i < 3; i++) {
      c.add(c.P.cylinder(0.002, 0.002, 0.12), "#f4f4f4", head, {
        position: [s * 0.09, HEAD_Y - 0.03 + (i - 1) * 0.012, 0.19],
        rotation: [0, 0, Math.PI / 2 + s * (0.15 - i * 0.15)],
        noOutline: true,
      });
    }
  }
  // long tail
  c.add(c.P.torus(0.16, 0.022, Math.PI * 0.75), color, c.J.hips, { position: [0.02, -0.15, -0.13], rotation: [0, Math.PI / 2, Math.PI * 0.85], material: spots });
  c.add(c.P.sphere(0.03), "#241a12", c.J.hips, { position: [0.02, 0.0, -0.29], noOutline: true, material: FABRIC.fleece });
}

function trex(c: Ctx, color: string): void {
  const belly = lighten(color, 0.4);
  bodySuit(c, { color, belly, material: FABRIC.rubber });
  bigFeet(c, darken(color, 0.85), FABRIC.rubber, [0.15, 0.09, 0.32]);
  const head = c.J.head;
  // big snout: upper jaw forward, lower jaw open
  ellipsoid(c, color, head, [0.15, 0.13, 0.17], [0, HEAD_Y + 0.05, 0.02], FABRIC.rubber);
  ellipsoid(c, color, head, [0.12, 0.085, 0.2], [0, HEAD_Y + 0.02, 0.17], FABRIC.rubber);
  ellipsoid(c, darken(color, 0.9), head, [0.11, 0.045, 0.19], [0, HEAD_Y - 0.09, 0.14], FABRIC.rubber, [0.35, 0, 0]);
  // teeth along both jaws
  for (let i = -3; i <= 3; i++) {
    c.add(c.P.cone(0.011, 0.03), "#fbfbf4", head, { position: [i * 0.03, HEAD_Y - 0.025, 0.3 - Math.abs(i) * 0.012], rotation: [Math.PI, 0, 0], noOutline: true });
    c.add(c.P.cone(0.009, 0.024), "#fbfbf4", head, { position: [i * 0.03, HEAD_Y - 0.075, 0.28 - Math.abs(i) * 0.015], rotation: [-0.35, 0, 0], noOutline: true });
  }
  // brow ridges + eyes
  for (const s of [1, -1]) {
    ellipsoid(c, darken(color, 0.85), head, [0.05, 0.03, 0.05], [s * 0.1, HEAD_Y + 0.14, 0.09], FABRIC.rubber);
  }
  eyes(c, 0.105, HEAD_Y + 0.1, 0.11, 0.024);
  // nostrils + back spikes + tail
  for (const s of [1, -1]) {
    c.add(c.P.sphere(0.012), darken(color, 0.5), head, { position: [s * 0.04, HEAD_Y + 0.07, 0.34], noOutline: true });
  }
  for (let i = 0; i < 4; i++) {
    c.add(c.P.cone(0.025, 0.06), darken(color, 0.8), c.J.chest, { position: [0, 0.17 - i * 0.1, -0.16 - i * 0.015], rotation: [-0.6, 0, 0], material: FABRIC.rubber });
  }
  c.add(c.P.cone(0.09, 0.46), color, c.J.hips, { position: [0, -0.08, -0.32], rotation: [-Math.PI / 2 - 0.35, 0, 0], material: FABRIC.rubber });
  c.add(c.P.sphere(0.09), color, c.J.hips, { position: [0, -0.03, -0.14], material: FABRIC.rubber });
}

function frog(c: Ctx, color: string): void {
  const belly = "#f2e6a6";
  bodySuit(c, { color, belly });
  bigFeet(c, darken(color, 0.9), FABRIC.rubber, [0.16, 0.05, 0.3]);
  const head = c.J.head;
  c.add(c.P.sphere(0.2), color, head, { position: [0, HEAD_Y + 0.01, 0.01], scale: [1.18, 0.88, 1.05], material: FABRIC.rubber });
  for (const s of [1, -1]) {
    c.add(c.P.sphere(0.07), color, head, { position: [s * 0.11, HEAD_Y + 0.18, 0.05], material: FABRIC.rubber });
  }
  eyes(c, 0.11, HEAD_Y + 0.19, 0.1, 0.03, true);
  // wide smile
  c.add(c.P.torus(0.13, 0.008, Math.PI), "#3a2a2a", head, { position: [0, HEAD_Y - 0.01, 0.19], rotation: [0, 0, Math.PI], scale: [1, 0.5, 1], noOutline: true });
  for (const s of [1, -1]) {
    c.add(c.P.sphere(0.012), darken(color, 0.6), head, { position: [s * 0.04, HEAD_Y + 0.06, 0.205], noOutline: true });
  }
}

function chicken(c: Ctx, color: string): void {
  bodySuit(c, { color, belly: lighten(color, 0.3) });
  bigFeet(c, "#f0a020", FABRIC.rubber, [0.15, 0.04, 0.3]);
  const head = c.J.head;
  c.add(c.P.sphere(0.19), color, head, { position: [0, HEAD_Y + 0.03, 0], material: FABRIC.fleece });
  c.add(c.P.cone(0.045, 0.1), "#f0a020", head, { position: [0, HEAD_Y + 0.02, 0.225], rotation: [Math.PI / 2, 0, 0], material: FABRIC.plastic });
  for (const [x, y, z] of [
    [0, 0.235, 0.03],
    [0, 0.25, -0.03],
    [0, 0.225, 0.085],
  ] as const) {
    c.add(c.P.sphere(0.036), "#d62828", head, { position: [x, HEAD_Y + y, z], material: FABRIC.rubber });
  }
  c.add(c.P.sphere(0.028), "#d62828", head, { position: [0, HEAD_Y - 0.05, 0.19], material: FABRIC.rubber });
  eyes(c, 0.07, HEAD_Y + 0.1, 0.16, 0.025);
  // wing fringes along the forearms and a tail fan
  for (const side of ["L", "R"] as const) {
    const s = side === "L" ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      c.add(c.P.box(0.02, 0.07, 0.05, 0.01), lighten(color, 0.5), c.J[`elbow${side}`], {
        position: [s * 0.055, -0.05 - i * 0.045, 0],
        rotation: [0, 0, s * 0.4],
        material: FABRIC.fleece,
      });
    }
  }
  for (const a of [-0.5, 0, 0.5]) {
    c.add(c.P.box(0.05, 0.16, 0.012, 0.01), lighten(color, 0.5), c.J.hips, { position: [Math.sin(a) * 0.08, 0.04, -0.14], rotation: [0.6, 0, a], material: FABRIC.fleece });
  }
}

function shark(c: Ctx, color: string): void {
  const belly = "#e8eef2";
  const dark = darken(color, 0.8);
  const rubber = FABRIC.rubber;
  bodySuit(c, { color, belly, material: rubber });
  bigFeet(c, dark, rubber);
  const head = c.J.head;
  const y = HEAD_Y + 0.02;
  // hood: rounded head that tapers into a snout, mouth open under it
  ellipsoid(c, color, head, [0.2, 0.19, 0.24], [0, y, 0.0], rubber);
  ellipsoid(c, color, head, [0.135, 0.095, 0.17], [0, y + 0.02, 0.19], rubber); // upper jaw / snout
  ellipsoid(c, "#4a1620", head, [0.115, 0.06, 0.13], [0, y - 0.05, 0.19], rubber); // mouth interior
  ellipsoid(c, belly, head, [0.125, 0.045, 0.16], [0, y - 0.11, 0.16], rubber, [0.3, 0, 0]); // lower jaw
  for (let i = -3; i <= 3; i++) {
    const z = 0.3 - Math.abs(i) * 0.022;
    c.add(c.P.cone(0.011, 0.034), "#ffffff", head, { position: [i * 0.032, y - 0.03, z], rotation: [Math.PI, 0, 0], noOutline: true });
    c.add(c.P.cone(0.009, 0.028), "#ffffff", head, { position: [i * 0.032 + 0.016, y - 0.085, z - 0.03], noOutline: true });
  }
  eyes(c, 0.16, y + 0.07, 0.11, 0.028);
  // gill slits
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      c.add(c.P.box(0.006, 0.06, 0.012, 0.002), dark, head, { position: [s * 0.19, y - 0.02, -0.05 - i * 0.032], rotation: [0.2, 0, 0], noOutline: true });
    }
  }
  // dorsal fin (thin wedge swept back), pectoral fins at the sides, two-lobed tail
  c.add(c.P.cone(0.11, 0.3), color, c.J.chest, { position: [0, 0.16, -0.19], rotation: [-0.5, 0, 0], scale: [0.22, 1, 1], material: rubber });
  for (const s of [1, -1]) {
    c.add(c.P.cone(0.07, 0.24), color, c.J.chest, { position: [s * 0.23, -0.08, -0.03], rotation: [0.35, 0, s * 1.9], scale: [0.25, 1, 1], material: rubber });
  }
  c.add(c.P.cone(0.09, 0.3), color, c.J.hips, { position: [0, -0.08, -0.22], rotation: [-2.5, 0, 0], scale: [0.22, 1, 1], material: rubber });
  c.add(c.P.cone(0.07, 0.22), color, c.J.hips, { position: [0, -0.2, -0.22], rotation: [2.2, 0, 0], scale: [0.22, 1, 1], material: rubber });
}

const MASCOT_COLORS: Record<MascotAnimal, string> = {
  cheetah: "#e0a94a",
  trex: "#5f8f4e",
  frog: "#4caf50",
  chicken: "#f7f3e6",
  shark: "#5b7f99",
};

// ---------------------------------------------------------------- astronaut

function astronaut(c: Ctx): void {
  const white = "#f2f2ef";
  const gray = "#9ea3a8";
  const suit = FABRIC.nylon;
  bodySuit(c, { color: white, material: suit, inflate: 1.18 });
  bigFeet(c, gray, FABRIC.rubber, [0.13, 0.11, 0.3]);
  for (const side of ["L", "R"] as const) {
    c.add(c.P.torus(0.07, 0.014), gray, c.J[`elbow${side}`], { rotation: [Math.PI / 2, 0, 0], material: FABRIC.plastic });
    c.add(c.P.torus(0.096, 0.016), gray, c.J[`knee${side}`], { rotation: [Math.PI / 2, 0, 0], material: FABRIC.plastic });
    c.add(c.P.torus(0.055, 0.014), gray, c.J[`wrist${side}`], { position: [0, 0.03, 0], rotation: [Math.PI / 2, 0, 0], material: FABRIC.plastic });
  }
  c.add(c.P.box(0.16, 0.11, 0.035, 0.008), gray, c.J.chest, { position: [0, 0.03, 0.2], material: FABRIC.plastic });
  const buttons = ["#e63946", "#2a9d8f", "#f4d35e"];
  buttons.forEach((col, i) => {
    c.add(c.P.box(0.03, 0.03, 0.012, 0.004), col, c.J.chest, { position: [-0.05 + i * 0.05, 0.04, 0.222], noOutline: true, material: FABRIC.plastic });
  });
  c.add(c.P.box(0.3, 0.38, 0.16, 0.03), white, c.J.chest, { position: [0, -0.04, -0.23], material: suit });
  c.add(c.P.box(0.24, 0.1, 0.05, 0.015), gray, c.J.chest, { position: [0, 0.12, -0.32], material: FABRIC.plastic });
  // helmet: white shell around the back and top, dark reflective visor in front
  const r = D.headR * 1.5;
  c.add(c.P.sphere(r, Math.PI, Math.PI / 2 + 1.05, Math.PI * 2 - 2.1), white, c.J.head, { position: [0, HEAD_Y, 0], material: suit, doubleSide: true });
  c.add(c.P.sphere(r * 1.005, Math.PI * 0.9, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.05), "#1a2330", c.J.head, {
    position: [0, HEAD_Y, 0],
    material: { roughness: 0.1, metalness: 0.85, opacity: 0.85 },
    doubleSide: true,
  });
  c.add(c.P.torus(0.1, 0.028), gray, c.J.neck, { position: [0, 0.01, 0], rotation: [Math.PI / 2, 0, 0], material: FABRIC.plastic });
  c.add(c.P.box(0.05, 0.035, 0.008, 0.002), "#2b4c9b", c.J.shoulderL, { position: [0.075, -0.1, 0.0], rotation: [0, Math.PI / 2, 0], noOutline: true });
}

// ---------------------------------------------------------------- diver

function diver(c: Ctx): void {
  const canvas = "#8a7a52";
  bodySuit(c, { color: canvas, material: FABRIC.canvas, inflate: 1.2 });
  bigFeet(c, "#2b2b2b", FABRIC.leather, [0.13, 0.13, 0.3]);
  for (const side of ["L", "R"] as const) {
    c.add(c.P.box(0.14, 0.03, 0.08, 0.008), BRASS, c.J[`ankle${side}`], { position: [0, -0.04, 0.16], material: FABRIC.metal });
    c.add(c.P.torus(0.055, 0.012), darken(canvas, 0.7), c.J[`wrist${side}`], { position: [0, 0.03, 0], rotation: [Math.PI / 2, 0, 0], material: FABRIC.rubber });
  }
  c.add(c.P.torus(0.2, 0.024), "#2b2b2b", c.J.hips, { position: [0, 0.02, 0], rotation: [Math.PI / 2, 0, 0], scale: [1.1, 0.85, 1], material: FABRIC.leather });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.add(c.P.box(0.05, 0.05, 0.03, 0.006), "#3f3f3f", c.J.hips, { position: [Math.sin(a) * 0.21, 0.02, Math.cos(a) * 0.17], rotation: [0, a, 0], material: FABRIC.metal });
  }
  c.add(c.P.box(0.22, 0.12, 0.04, 0.01), BRASS, c.J.chest, { position: [0, 0.13, 0.19], material: FABRIC.metal });
  c.add(c.P.box(0.22, 0.12, 0.04, 0.01), BRASS, c.J.chest, { position: [0, 0.13, -0.2], material: FABRIC.metal });
  const r = D.headR * 1.55;
  c.add(c.P.sphere(r), BRASS, c.J.head, { position: [0, HEAD_Y + 0.01, 0], material: FABRIC.metal });
  const port = (pos: [number, number, number], rot: [number, number, number]) => {
    c.add(c.P.torus(0.055, 0.012), lighten(BRASS, 0.15), c.J.head, { position: pos, rotation: rot, material: FABRIC.metal });
    c.add(c.P.cylinder(0.05, 0.05, 0.012), "#16222b", c.J.head, { position: pos, rotation: [rot[0] + Math.PI / 2, rot[1], rot[2]], noOutline: true, material: { roughness: 0.1, metalness: 0.6, opacity: 0.9 } });
  };
  port([0, HEAD_Y + 0.02, r - 0.01], [0, 0, 0]);
  port([r - 0.01, HEAD_Y + 0.02, 0], [0, Math.PI / 2, 0]);
  port([-(r - 0.01), HEAD_Y + 0.02, 0], [0, Math.PI / 2, 0]);
  c.add(c.P.torus(0.13, 0.03), BRASS, c.J.neck, { position: [0, 0.005, 0], rotation: [Math.PI / 2, 0, 0], material: FABRIC.metal });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.add(c.P.sphere(0.012), SILVER, c.J.neck, { position: [Math.sin(a) * 0.13, 0.005, Math.cos(a) * 0.13], noOutline: true, material: FABRIC.metal });
  }
  c.add(c.P.cylinder(0.025, 0.03, 0.04), BRASS, c.J.head, { position: [0, HEAD_Y + r + 0.01, -0.02], material: FABRIC.metal });
  c.add(c.P.torus(0.14, 0.014, Math.PI * 0.8), "#3a3a3a", c.J.head, { position: [0, HEAD_Y + 0.02, -0.12], rotation: [0, Math.PI / 2, Math.PI * 0.55], material: FABRIC.rubber });
}

// ---------------------------------------------------------------- public API

export function buildCostume(c: Ctx, outfit: Outfit): void {
  switch (outfit.costume) {
    case "mascot": {
      const animal = outfit.mascot ?? "cheetah";
      const color = MASCOT_COLORS[animal];
      if (animal === "cheetah") cheetah(c, color);
      else if (animal === "trex") trex(c, color);
      else if (animal === "frog") frog(c, color);
      else if (animal === "chicken") chicken(c, color);
      else shark(c, color);
      break;
    }
    case "astronaut":
      astronaut(c);
      break;
    case "diver":
      diver(c);
      break;
    case "none":
      break;
  }
}

/** Head-local point where diver bubbles are released (top valve). */
export const DIVER_VALVE_OFFSET: [number, number, number] = [0, HEAD_Y + D.headR * 1.55 + 0.04, -0.02];
