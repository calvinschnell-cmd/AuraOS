import { buildCostume } from "./costumes";
import {
  BRASS,
  D,
  FABRIC,
  FIT_MUL,
  GOLD,
  SILVER,
  buttonLine,
  collarRing,
  ctx,
  darken,
  ellipsoid,
  fabricFor,
  frameRect,
  frontZ,
  lapels,
  legs,
  lighten,
  placket,
  pocket,
  shirtCollar,
  sleeves,
  standCollar,
  torsoShell,
  waist,
  zipper,
  type Ctx,
} from "./shells";
import type { Garment, Outfit, Slot } from "./types";
import type { MaterialSpec, Part } from "@/lib/mannequin/parts";
import type { MannequinRig } from "@/lib/mannequin/rig";

/**
 * Procedural garment builder. Every garment is a lathe-revolved shell with a
 * real silhouette, layered over the body and parented to joints so it follows
 * poses. Flat colors and simple procedural patterns only. Hands always stay
 * visible: sleeves end above the wrist and oversized means wider, never longer.
 */

export interface BuiltSlot {
  slot: Slot | "costume";
  parts: Part[];
}

const TOP_HEM = 0.36; // below the chest joint: covers the hips
const OUTER_INFLATE = 1.09;
const OUTER_SLEEVE = 1.16;
const TOP_SLEEVE = 1.0;
const HEAD_Y = D.headR * 0.72;
const EYE_Y = HEAD_Y + 0.012;
const EYE_Z = D.headR * 0.94;
const SATIN = { roughness: 0.38, metalness: 0.08 };

// ---------------------------------------------------------------- tops

function buildTop(c: Ctx, g: Outfit["top"]): void {
  const { type, primary, secondary, fit, details } = g;
  const tucked = Boolean(details.tucked);
  const hem = tucked ? 0.3 : TOP_HEM;
  const cuff = details.rolledCuffs ? secondary : undefined;
  /** Front surface depth of this top at a given height. */
  const fz = (inflate = 1) => (y: number) => frontZ(y, inflate, fit, hem);
  switch (type) {
    case "tee": {
      const m = fabricFor(g, FABRIC.cotton);
      torsoShell(c, primary, { hem, fit, material: m });
      sleeves(c, primary, { length: "short", fit, inflate: TOP_SLEEVE, material: m });
      collarRing(c, secondary, 0.011, 0.2, FABRIC.knit);
      break;
    }
    case "tank": {
      const m = fabricFor(g, FABRIC.cotton);
      torsoShell(c, primary, { hem, fit, inflate: 0.98, material: m });
      for (const s of [1, -1]) {
        c.add(c.P.box(0.035, 0.09, 0.012, 0.005), primary, c.J.chest, { position: [s * 0.11, 0.17, 0.03], rotation: [0, 0, s * 0.35], material: m });
      }
      break;
    }
    case "longsleeve": {
      const m = fabricFor(g, FABRIC.cotton);
      torsoShell(c, primary, { hem, fit, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: TOP_SLEEVE, material: m, cuffColor: cuff });
      collarRing(c, primary, 0.011, 0.2, FABRIC.knit);
      break;
    }
    case "crewneck": {
      const m = fabricFor(g, FABRIC.knit);
      torsoShell(c, primary, { hem, fit, inflate: 1.02, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: TOP_SLEEVE * 1.04, material: m, cuffColor: secondary, cuffMaterial: FABRIC.knit });
      collarRing(c, secondary, 0.016, 0.2, FABRIC.knit);
      c.add(c.P.torus(0.186 * FIT_MUL[fit], 0.016), secondary, c.J.chest, {
        position: [0, -hem + 0.01, 0],
        rotation: [Math.PI / 2, 0, 0],
        scale: [1, 0.76, 1],
        material: FABRIC.knit,
      });
      break;
    }
    case "hoodie": {
      const m = fabricFor(g, FABRIC.fleece);
      torsoShell(c, primary, { hem, fit, inflate: 1.04, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: TOP_SLEEVE * 1.08, material: m, cuffColor: cuff ?? darken(primary, 0.85), cuffMaterial: FABRIC.knit });
      c.add(c.P.box(0.2, 0.1, 0.03, 0.014), darken(primary, 0.92), c.J.spine, { position: [0, 0.0, 0.125], material: FABRIC.fleece });
      for (const s of [1, -1]) {
        c.add(c.P.cylinder(0.004, 0.004, 0.13), secondary, c.J.chest, { position: [s * 0.032, 0.11, fz(1.04)(0.11) + 0.004], noOutline: true });
        c.add(c.P.cylinder(0.006, 0.006, 0.014), SILVER, c.J.chest, { position: [s * 0.032, 0.04, fz(1.04)(0.04) + 0.006], noOutline: true, material: FABRIC.metal });
      }
      if (details.hoodUp) {
        c.add(c.P.sphere(D.headR * 1.38, Math.PI * 0.78, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7), primary, c.J.head, {
          position: [0, HEAD_Y, -0.015],
          scale: [1, 1.08, 1.02],
          material: m,
          doubleSide: true,
        });
        c.add(c.P.torus(D.headR * 1.25, 0.014, Math.PI * 1.2), darken(primary, 0.85), c.J.head, {
          position: [0, HEAD_Y, 0.03],
          rotation: [0.15, Math.PI * 0.9, 0],
          scale: [1, 1.15, 1],
          material: FABRIC.fleece,
        });
      } else {
        ellipsoid(c, primary, c.J.chest, [0.13, 0.06, 0.09], [0, 0.19, -0.09], m, [-0.5, 0, 0]);
        ellipsoid(c, darken(primary, 0.9), c.J.chest, [0.1, 0.04, 0.07], [0, 0.215, -0.06], m, [-0.7, 0, 0]);
      }
      break;
    }
    case "buttonup": {
      const m = fabricFor(g, FABRIC.cotton);
      torsoShell(c, primary, { hem: tucked ? 0.3 : 0.38, fit, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: TOP_SLEEVE, material: m, cuffColor: cuff ?? primary });
      shirtCollar(c, primary, m);
      placket(c, darken(primary, 0.92), 0.36, 0.0, fz(), 0.024);
      buttonLine(c, secondary, 6, 0.15, 0.058, fz());
      break;
    }
    case "dress_shirt": {
      const m = fabricFor(g, FABRIC.cotton);
      torsoShell(c, primary, { hem: 0.3, fit, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: TOP_SLEEVE, material: m, cuffColor: primary });
      shirtCollar(c, primary, m);
      placket(c, primary, 0.34, 0.0, fz(), 0.03);
      buttonLine(c, lighten(primary, 0.2), 6, 0.14, 0.055, fz(), FABRIC.plastic);
      // cuff buttons
      for (const side of ["L", "R"] as const) {
        c.add(c.P.sphere(0.006), lighten(primary, 0.3), c.J[`elbow${side}`], { position: [0.04, -0.17, 0.02], noOutline: true, material: FABRIC.plastic });
      }
      break;
    }
    case "polo": {
      const m = fabricFor(g, FABRIC.knit);
      torsoShell(c, primary, { hem, fit, material: m });
      sleeves(c, primary, { length: "short", fit, inflate: TOP_SLEEVE, material: m });
      shirtCollar(c, primary, m);
      placket(c, darken(primary, 0.92), 0.1, 0.13, fz(), 0.024);
      buttonLine(c, secondary, 2, 0.15, 0.045, fz());
      break;
    }
    case "turtleneck": {
      const m = fabricFor(g, FABRIC.knit);
      torsoShell(c, primary, { hem, fit, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: TOP_SLEEVE, material: m });
      standCollar(c, primary, 0.1, m);
      c.add(c.P.torus(0.075, 0.012), primary, c.J.neck, { position: [0, 0.085, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.9, 1], material: m });
      break;
    }
    case "quarterzip": {
      const m = fabricFor(g, FABRIC.fleece);
      torsoShell(c, primary, { hem, fit, inflate: 1.01, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: TOP_SLEEVE * 1.02, material: m, cuffColor: cuff });
      standCollar(c, primary, 0.065, m);
      zipper(c, SILVER, 0.14, 0.12, fz(1.01));
      break;
    }
    case "dress": {
      // Knee-length dress: fitted bodice, cinched waist, A-line skirt to just above the knee.
      const m = fabricFor(g, FABRIC.cotton);
      c.add(
        c.P.lathe([
          [0.3, -0.8],
          [0.27, -0.64],
          [0.225, -0.46],
          [0.195, -0.32],
          [0.174, -0.2],
          [0.186, -0.06],
          [0.196, 0.06],
          [0.19, 0.14],
          [0.13, 0.17],
          [0.09, 0.19],
        ]),
        primary,
        c.J.chest,
        { scale: [1, 1, 0.8], material: m, doubleSide: true },
      );
      for (const s of [1, -1]) {
        c.add(c.P.box(0.02, 0.1, 0.008, 0.003), primary, c.J.chest, { position: [s * 0.075, 0.2, 0.06], rotation: [-0.6, 0, s * 0.1], material: m });
      }
      c.add(c.P.torus(0.176, 0.01), darken(primary, 0.78), c.J.chest, { position: [0, -0.2, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], material: m });
      break;
    }
    case "gown": {
      // Full-length gown: fitted bodice, cinched waist, flared skirt to the ankles.
      const m = { ...SATIN };
      c.add(
        c.P.lathe([
          [0.36, -1.16],
          [0.33, -1.02],
          [0.26, -0.7],
          [0.2, -0.42],
          [0.178, -0.3],
          [0.17, -0.2],
          [0.186, -0.06],
          [0.196, 0.06],
          [0.19, 0.14],
          [0.13, 0.17],
          [0.09, 0.19],
        ]),
        primary,
        c.J.chest,
        { scale: [1, 1, 0.78], material: m, doubleSide: true },
      );
      // straps + waist sash
      for (const s of [1, -1]) {
        c.add(c.P.box(0.018, 0.1, 0.008, 0.003), primary, c.J.chest, { position: [s * 0.075, 0.2, 0.06], rotation: [-0.6, 0, s * 0.1], material: m });
      }
      c.add(c.P.torus(0.176, 0.014), secondary, c.J.chest, { position: [0, -0.21, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.78, 1], material: FABRIC.metal });
      break;
    }
  }
}

// ---------------------------------------------------------------- outerwear

function buildOuterwear(c: Ctx, g: Outfit["outerwear"]): void {
  const { type, primary, secondary, fit, details } = g;
  if (type === "none") return;
  const open = Boolean(details.open);
  const gap = open ? 0.95 : 0;
  /** Front surface depth of this layer at a given height. */
  const oz = (inflate: number, hem: number) => (y: number) => frontZ(y, inflate, fit, hem);
  switch (type) {
    case "puffer": {
      const m = { ...FABRIC.puffer, pattern: { kind: "quilt" as const, colorA: primary, colorB: darken(primary, 0.72), repeat: [1, 5] as [number, number] } };
      torsoShell(c, primary, { hem: 0.4, fit, inflate: OUTER_INFLATE * 1.1, gap: open ? 0.6 : 0, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: OUTER_SLEEVE * 1.16, material: m, cuffColor: darken(primary, 0.8), cuffMaterial: FABRIC.knit });
      standCollar(c, primary, 0.075, FABRIC.puffer);
      if (!open) zipper(c, SILVER, 0.34, 0.0, oz(OUTER_INFLATE * 1.1, 0.4));
      break;
    }
    case "blazer": {
      const m = fabricFor(g, FABRIC.wool);
      const z = oz(OUTER_INFLATE, 0.44);
      torsoShell(c, primary, { hem: 0.44, fit, inflate: OUTER_INFLATE, gap, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: OUTER_SLEEVE, material: m, cuffColor: primary });
      lapels(c, darken(primary, 0.85), m, open ? 0.075 : 0.05, z);
      if (!open) buttonLine(c, secondary, 2, -0.04, 0.06, z);
      c.add(c.P.box(0.07, 0.014, 0.008, 0.003), darken(primary, 0.85), c.J.chest, { position: [-0.095, 0.06, z(0.06) - 0.012], noOutline: true, material: m });
      break;
    }
    case "overcoat": {
      const m = fabricFor(g, FABRIC.wool);
      const z = oz(OUTER_INFLATE * 1.03, 0.78);
      torsoShell(c, primary, { hem: 0.78, fit, inflate: OUTER_INFLATE * 1.03, gap: open ? 0.8 : 0, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: OUTER_SLEEVE * 1.04, material: m, cuffColor: primary });
      lapels(c, darken(primary, 0.88), m, open ? 0.08 : 0.055, z);
      standCollar(c, primary, 0.05, m);
      if (!open) buttonLine(c, darken(primary, 0.6), 3, 0.0, 0.09, z);
      break;
    }
    case "suitvest": {
      const m = fabricFor(g, FABRIC.wool);
      const z = oz(1.03, 0.36);
      torsoShell(c, primary, { hem: 0.36, fit, inflate: 1.03, material: m });
      for (const s of [1, -1]) {
        c.add(c.P.box(0.05, 0.16, 0.008, 0.004), darken(primary, 0.9), c.J.chest, { position: [s * 0.04, 0.1, z(0.1) - 0.002], rotation: [0, 0, s * 0.5], material: m });
      }
      buttonLine(c, secondary, 4, 0.02, 0.06, z);
      c.add(c.P.box(0.055, 0.012, 0.008, 0.003), darken(primary, 0.85), c.J.chest, { position: [-0.085, -0.06, z(-0.06) - 0.012], noOutline: true, material: m });
      c.add(c.P.box(0.055, 0.012, 0.008, 0.003), darken(primary, 0.85), c.J.chest, { position: [0.085, -0.06, z(-0.06) - 0.012], noOutline: true, material: m });
      break;
    }
    case "varsity": {
      const body = fabricFor(g, FABRIC.wool);
      torsoShell(c, primary, { hem: 0.38, fit, inflate: OUTER_INFLATE, gap, material: body });
      sleeves(c, secondary, { length: "long", fit, inflate: OUTER_SLEEVE, material: FABRIC.leather, cuffColor: primary, cuffMaterial: FABRIC.knit });
      collarRing(c, secondary, 0.02, 0.2, FABRIC.knit);
      c.add(c.P.torus(0.2 * FIT_MUL[fit], 0.02), secondary, c.J.chest, {
        position: [0, -0.37, 0],
        rotation: [Math.PI / 2, 0, 0],
        scale: [1, 0.78, 1],
        material: FABRIC.knit,
      });
      buttonLine(c, lighten(secondary, 0.3), 5, 0.12, 0.075, oz(OUTER_INFLATE, 0.38), FABRIC.metal);
      c.add(c.P.box(0.06, 0.07, 0.012, 0.004), secondary, c.J.chest, { position: [0.09, 0.05, oz(OUTER_INFLATE, 0.38)(0.05) - 0.012], material: FABRIC.wool });
      break;
    }
    case "denim": {
      const m = fabricFor(g, FABRIC.denim);
      const z = oz(OUTER_INFLATE, 0.36);
      torsoShell(c, primary, { hem: 0.36, fit, inflate: OUTER_INFLATE, gap, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: OUTER_SLEEVE, material: m, cuffColor: darken(primary, 0.85) });
      shirtCollar(c, primary, m);
      for (const s of [1, -1]) {
        pocket(c, darken(primary, 0.93), c.J.chest, [0.08, 0.075], [s * 0.09, 0.05, z(0.05) - 0.014], undefined, m);
      }
      for (const s of [1, -1]) {
        c.add(c.P.box(0.006, 0.34, 0.004, 0.002), lighten(primary, 0.35), c.J.chest, { position: [s * 0.15, -0.12, z(-0.12) - 0.03], noOutline: true });
      }
      if (!open) buttonLine(c, GOLD, 5, 0.12, 0.07, z, FABRIC.metal);
      break;
    }
    case "trench": {
      const m = fabricFor(g, FABRIC.canvas);
      const z = oz(OUTER_INFLATE, 0.72);
      torsoShell(c, primary, { hem: 0.72, fit, inflate: OUTER_INFLATE, gap, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: OUTER_SLEEVE, material: m, cuffColor: darken(primary, 0.85) });
      lapels(c, darken(primary, 0.9), m, 0.06, z);
      const beltR = frontZ(-0.24, OUTER_INFLATE, fit, 0.72, 0.006) / 0.76;
      c.add(c.P.torus(beltR, 0.014), darken(primary, 0.78), c.J.spine, {
        position: [0, -0.02, 0],
        rotation: [Math.PI / 2, 0, 0],
        scale: [1, 0.76, 1],
        material: m,
      });
      c.add(c.P.box(0.04, 0.03, 0.01, 0.003), GOLD, c.J.spine, { position: [0.02, -0.02, z(-0.24) + 0.006], noOutline: true, material: FABRIC.metal });
      if (!open) buttonLine(c, secondary, 3, 0.02, 0.09, z);
      for (const s of [1, -1]) {
        c.add(c.P.box(0.09, 0.016, 0.03, 0.005), darken(primary, 0.9), c.J.chest, { position: [s * 0.16, 0.185, 0], rotation: [0, 0, s * 0.35], material: m });
      }
      break;
    }
    case "fleece": {
      const m = fabricFor(g, FABRIC.fleece);
      torsoShell(c, primary, { hem: 0.38, fit, inflate: OUTER_INFLATE * 1.03, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: OUTER_SLEEVE * 1.05, material: m, cuffColor: secondary, cuffMaterial: FABRIC.knit });
      standCollar(c, primary, 0.085, m);
      zipper(c, SILVER, 0.36, 0.0, oz(OUTER_INFLATE * 1.03, 0.38));
      c.add(c.P.box(0.07, 0.07, 0.014, 0.006), secondary, c.J.chest, { position: [0.09, 0.06, oz(OUTER_INFLATE * 1.03, 0.38)(0.06) - 0.012], material: FABRIC.fleece });
      break;
    }
    case "windbreaker": {
      const m = fabricFor(g, FABRIC.nylon);
      torsoShell(c, primary, { hem: 0.36, fit, inflate: OUTER_INFLATE * 1.02, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: OUTER_SLEEVE * 1.03, material: m, cuffColor: secondary, cuffMaterial: FABRIC.knit });
      standCollar(c, primary, 0.07, m);
      zipper(c, darken(primary, 0.6), 0.34, 0.0, oz(OUTER_INFLATE * 1.02, 0.36));
      c.add(c.P.lathe([[0.228, 0.02], [0.232, 0.07]]), secondary, c.J.chest, { scale: [FIT_MUL[fit] * 1.02, 1, 0.77], material: FABRIC.nylon, doubleSide: true });
      break;
    }
    case "leather": {
      const m = FABRIC.leather;
      torsoShell(c, primary, { hem: 0.36, fit, inflate: OUTER_INFLATE, gap, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: OUTER_SLEEVE, material: m, cuffColor: darken(primary, 0.7), cuffMaterial: m });
      lapels(c, darken(primary, 0.8), m, open ? 0.08 : 0.055, oz(OUTER_INFLATE, 0.36));
      if (!open) zipper(c, SILVER, 0.3, -0.02, oz(OUTER_INFLATE, 0.36));
      c.add(c.P.box(0.01, 0.3, 0.006, 0.002), SILVER, c.J.chest, { position: [0.06, -0.03, oz(OUTER_INFLATE, 0.36)(-0.03) - 0.002], rotation: [0, 0, 0.12], noOutline: true, material: FABRIC.metal });
      break;
    }
    case "cardigan": {
      const m = fabricFor(g, FABRIC.knit);
      const z = oz(OUTER_INFLATE * 0.98, 0.42);
      torsoShell(c, primary, { hem: 0.42, fit, inflate: OUTER_INFLATE * 0.98, gap: open ? 0.7 : 0, material: m });
      sleeves(c, primary, { length: "long", fit, inflate: OUTER_SLEEVE * 0.95, material: m, cuffColor: secondary, cuffMaterial: FABRIC.knit });
      for (const s of [1, -1]) {
        c.add(c.P.box(0.03, 0.4, 0.012, 0.005), darken(primary, 0.88), c.J.chest, { position: [s * (open ? 0.075 : 0.02), -0.02, z(-0.02) - 0.012], material: FABRIC.knit });
      }
      buttonLine(c, secondary, 5, 0.1, 0.07, z);
      break;
    }
    case "vest": {
      const m = fabricFor(g, FABRIC.puffer);
      torsoShell(c, primary, { hem: 0.36, fit, inflate: OUTER_INFLATE * 1.06, gap: open ? 0.5 : 0, material: { ...m, pattern: { kind: "quilt", colorA: primary, colorB: darken(primary, 0.72), repeat: [1, 4] } } });
      for (const s of [1, -1]) {
        c.add(c.P.torus(0.082, 0.012), darken(primary, 0.8), c.J.chest, { position: [s * 0.205, 0.1, 0], rotation: [0, Math.PI / 2, 0], scale: [1, 1.3, 1], material: FABRIC.knit });
      }
      standCollar(c, primary, 0.08, FABRIC.puffer);
      if (!open) zipper(c, SILVER, 0.32, 0.0, oz(OUTER_INFLATE * 1.06, 0.36));
      break;
    }
  }
}

// ---------------------------------------------------------------- bottoms

function buildBottom(c: Ctx, g: Outfit["bottom"]): void {
  const { type, primary, secondary, fit, details } = g;
  if (type === "none") return;
  const baggy = Boolean(details.baggy) || fit === "oversized";
  const slim = fit === "slim" && !baggy;
  const cuff = details.rolledCuffs ? darken(primary, 0.82) : undefined;
  const thighR = baggy ? 0.1 : slim ? 0.084 : 0.09;
  const shinR = baggy ? 0.095 : slim ? 0.068 : 0.078;
  switch (type) {
    case "jeans": {
      const m = fabricFor(g, FABRIC.denim);
      waist(c, primary, { material: m, band: darken(primary, 0.75) });
      legs(c, primary, { thighR, shinR, flare: baggy ? 1.12 : 1, material: m, cuffColor: cuff });
      jeansDetails(c, primary);
      break;
    }
    case "slacks": {
      const m = fabricFor(g, FABRIC.wool);
      waist(c, primary, { material: m, band: darken(primary, 0.8) });
      legs(c, primary, { thighR: 0.088, shinR: 0.076, material: m, cuffColor: cuff });
      for (const side of ["L", "R"] as const) {
        c.add(c.P.box(0.005, 0.3, 0.006, 0.002), darken(primary, 0.85), c.J[`knee${side}`], { position: [0, -0.16, 0.078], noOutline: true });
      }
      c.add(c.P.box(0.03, 0.028, 0.008, 0.003), SILVER, c.J.hips, { position: [0.0, 0.035, 0.14], noOutline: true, material: FABRIC.metal });
      break;
    }
    case "cargos": {
      const m = fabricFor(g, FABRIC.canvas);
      waist(c, primary, { material: m, band: darken(primary, 0.8) });
      legs(c, primary, { thighR: baggy ? 0.105 : 0.095, shinR: baggy ? 0.1 : 0.085, flare: 1.05, material: m, cuffColor: cuff });
      for (const side of ["L", "R"] as const) {
        const s = side === "L" ? 1 : -1;
        pocket(c, darken(primary, 0.92), c.J[`hip${side}`], [0.075, 0.1], [s * (baggy ? 0.1 : 0.092), -0.24, 0.0], [0, s * Math.PI / 2, 0], m);
      }
      break;
    }
    case "trackpants": {
      const m = fabricFor(g, FABRIC.nylon);
      waist(c, primary, { material: m, band: secondary });
      legs(c, primary, { thighR: 0.095, shinR: 0.085, flare: 1.06, material: m, cuffColor: secondary });
      for (const side of ["L", "R"] as const) {
        const s = side === "L" ? 1 : -1;
        c.add(c.P.box(0.012, 0.34, 0.03, 0.004), secondary, c.J[`hip${side}`], { position: [s * 0.097, -0.19, 0], noOutline: true, material: m });
        c.add(c.P.box(0.012, 0.31, 0.03, 0.004), secondary, c.J[`knee${side}`], { position: [s * 0.087, -0.16, 0], noOutline: true, material: m });
      }
      break;
    }
    case "sweatpants": {
      const m = fabricFor(g, FABRIC.fleece);
      waist(c, primary, { material: m, band: darken(primary, 0.85) });
      legs(c, primary, { thighR: 0.102, shinR: 0.095, flare: 0.8, material: m, cuffColor: darken(primary, 0.85) });
      for (const s of [1, -1]) {
        c.add(c.P.cylinder(0.004, 0.004, 0.08), secondary, c.J.hips, { position: [s * 0.02, -0.01, 0.145], noOutline: true });
      }
      break;
    }
    case "shorts": {
      const m = fabricFor(g, FABRIC.cotton);
      waist(c, primary, { material: m, band: darken(primary, 0.85) });
      legs(c, primary, { thighR: baggy ? 0.105 : 0.098, shinR: null, material: m });
      break;
    }
    case "skirt": {
      const m = fabricFor(g, FABRIC.wool);
      waist(c, primary, { material: m, band: darken(primary, 0.8) });
      c.add(
        c.P.lathe([
          [0.31, -0.42],
          [0.27, -0.3],
          [0.21, -0.15],
          [0.17, -0.05],
          [0.168, 0.0],
        ]),
        primary,
        c.J.hips,
        { scale: [1.05, 1, 0.88], material: m, doubleSide: true },
      );
      break;
    }
  }
}

function jeansDetails(c: Ctx, primary: string): void {
  const thread = lighten(primary, 0.4);
  c.add(c.P.box(0.006, 0.1, 0.004, 0.002), thread, c.J.hips, { position: [0.012, -0.05, 0.145], noOutline: true });
  c.add(c.P.sphere(0.009), GOLD, c.J.hips, { position: [0, 0.03, 0.15], noOutline: true, material: FABRIC.metal });
  for (const x of [-0.12, -0.05, 0.05, 0.12]) {
    c.add(c.P.box(0.012, 0.035, 0.008, 0.002), darken(primary, 0.8), c.J.hips, { position: [x, 0.03, 0.13 - Math.abs(x) * 0.25], noOutline: true });
  }
  for (const s of [1, -1]) {
    c.add(c.P.box(0.065, 0.07, 0.008, 0.004), darken(primary, 0.92), c.J.hips, { position: [s * 0.06, -0.04, -0.128], rotation: [0.1, 0, 0], noOutline: true });
  }
  for (const side of ["L", "R"] as const) {
    const s = side === "L" ? 1 : -1;
    c.add(c.P.box(0.004, 0.32, 0.004, 0.002), thread, c.J[`hip${side}`], { position: [s * 0.088, -0.19, 0.02], noOutline: true });
  }
}

// ---------------------------------------------------------------- shoes

function buildShoes(c: Ctx, g: Outfit["shoes"]): void {
  const { type, primary, secondary } = g;
  const [fx, fy, fz] = D.footOffset;
  for (const side of ["L", "R"] as const) {
    const ankle = c.J[`ankle${side}`];
    const s = side === "L" ? 1 : -1;
    /**
     * Every shoe is one elongated upper (an ellipsoid) sitting on a sole that
     * shares its exact footprint (an elliptical slab), so the sole follows the
     * shoe's silhouette instead of sticking out as a box.
     */
    const shoe = (o: { w: number; h: number; len: number; soleH: number; soleColor: string; upperColor: string; material: MaterialSpec; soleMaterial?: MaterialSpec; z?: number; lift?: number }) => {
      const z = fz + (o.z ?? 0.01);
      const soleTop = fy - 0.05 + (o.lift ?? 0);
      c.add(c.P.cylinder(1, 1, 1), o.soleColor, ankle, {
        position: [fx, soleTop - o.soleH / 2, z],
        scale: [o.w * 1.03, o.soleH, o.len * 1.03],
        material: o.soleMaterial ?? FABRIC.rubber,
      });
      ellipsoid(c, o.upperColor, ankle, [o.w, o.h, o.len], [fx, soleTop + o.h * 0.72, z], o.material);
      return { soleTop, z };
    };
    const laces = (color: string, y: number, count = 3, from = 0.0) => {
      for (let i = 0; i < count; i++) {
        c.add(c.P.box(0.046, 0.005, 0.009, 0.002), color, ankle, {
          position: [fx, y - i * 0.011, fz + from + i * 0.028],
          rotation: [0.4, 0, 0],
          noOutline: true,
        });
      }
    };
    switch (type) {
      case "sneakers": {
        const { soleTop } = shoe({ w: 0.052, h: 0.05, len: 0.145, soleH: 0.024, soleColor: secondary, upperColor: primary, material: FABRIC.canvas });
        c.add(c.P.box(0.05, 0.026, 0.05, 0.01), darken(primary, 0.9), ankle, { position: [fx, soleTop + 0.07, fz - 0.005], material: FABRIC.canvas });
        laces(lighten(secondary, 0.2), soleTop + 0.062, 3, 0.03);
        c.add(c.P.box(0.004, 0.014, 0.09, 0.002), secondary, ankle, { position: [fx + s * 0.052, soleTop + 0.03, fz - 0.01], noOutline: true });
        break;
      }
      case "hightops": {
        const { soleTop } = shoe({ w: 0.052, h: 0.05, len: 0.145, soleH: 0.024, soleColor: secondary, upperColor: primary, material: FABRIC.canvas });
        c.add(c.P.cylinder(0.058, 0.054, 0.12, false), primary, ankle, { position: [fx, soleTop + 0.09, fz - 0.06], scale: [1, 1, 1.15], material: FABRIC.canvas });
        laces(lighten(secondary, 0.2), soleTop + 0.13, 5, -0.02);
        c.add(c.P.cylinder(1, 1, 1), lighten(secondary, 0.4), ankle, { position: [fx, soleTop + 0.006, fz + 0.01], scale: [0.054, 0.008, 0.15], noOutline: true, material: FABRIC.rubber });
        break;
      }
      case "runners": {
        const { soleTop } = shoe({ w: 0.055, h: 0.054, len: 0.15, soleH: 0.03, soleColor: lighten(secondary, 0.35), upperColor: primary, material: FABRIC.nylon, lift: 0.012 });
        // chunky layered midsole below the main sole
        c.add(c.P.cylinder(1, 1, 1), secondary, ankle, { position: [fx, soleTop - 0.04, fz + 0.01], scale: [0.058, 0.02, 0.157], material: FABRIC.rubber });
        c.add(c.P.box(0.005, 0.024, 0.11, 0.002), secondary, ankle, { position: [fx + s * 0.054, soleTop + 0.03, fz], noOutline: true });
        laces(secondary, soleTop + 0.066, 4, 0.02);
        break;
      }
      case "boots": {
        const { soleTop } = shoe({ w: 0.053, h: 0.052, len: 0.142, soleH: 0.03, soleColor: darken(primary, 0.55), upperColor: primary, material: FABRIC.leather });
        c.add(c.P.cylinder(0.062, 0.057, 0.2, false), primary, ankle, { position: [fx, soleTop + 0.12, fz - 0.06], scale: [1, 1, 1.12], material: FABRIC.leather });
        laces(darken(primary, 0.5), soleTop + 0.17, 5, -0.03);
        break;
      }
      case "hikers": {
        const { soleTop } = shoe({ w: 0.055, h: 0.054, len: 0.146, soleH: 0.034, soleColor: secondary, upperColor: primary, material: FABRIC.leather });
        c.add(c.P.cylinder(0.06, 0.056, 0.13, false), primary, ankle, { position: [fx, soleTop + 0.09, fz - 0.06], scale: [1, 1, 1.12], material: FABRIC.leather });
        c.add(c.P.box(0.05, 0.03, 0.05, 0.01), darken(primary, 0.85), ankle, { position: [fx, soleTop + 0.078, fz - 0.005], material: FABRIC.leather });
        laces(lighten(secondary, 0.1), soleTop + 0.12, 5, -0.03);
        for (let i = 0; i < 3; i++) {
          for (const q of [1, -1]) {
            c.add(c.P.sphere(0.005), SILVER, ankle, { position: [fx + q * 0.028, soleTop + 0.12 - i * 0.02, fz - 0.03 + i * 0.03], noOutline: true, material: FABRIC.metal });
          }
        }
        break;
      }
      case "loafers": {
        const glossy = { roughness: 0.3, metalness: 0.05 };
        const { soleTop } = shoe({ w: 0.05, h: 0.04, len: 0.14, soleH: 0.018, soleColor: darken(primary, 0.6), upperColor: primary, material: glossy, soleMaterial: FABRIC.leather });
        c.add(c.P.box(0.062, 0.007, 0.024, 0.003), darken(primary, 0.7), ankle, { position: [fx, soleTop + 0.06, fz + 0.03], rotation: [0.35, 0, 0], noOutline: true, material: glossy });
        c.add(c.P.box(0.014, 0.004, 0.01, 0.002), GOLD, ankle, { position: [fx, soleTop + 0.066, fz + 0.03], rotation: [0.35, 0, 0], noOutline: true, material: FABRIC.metal });
        break;
      }
      case "oxfords": {
        const glossy = { roughness: 0.3, metalness: 0.05 };
        const { soleTop } = shoe({ w: 0.05, h: 0.042, len: 0.145, soleH: 0.02, soleColor: darken(primary, 0.5), upperColor: primary, material: glossy, soleMaterial: FABRIC.leather });
        c.add(c.P.torus(0.046, 0.003), darken(primary, 0.6), ankle, { position: [fx, soleTop + 0.03, fz + 0.1], scale: [1, 0.75, 1], noOutline: true });
        laces(darken(primary, 0.5), soleTop + 0.062, 3, 0.02);
        break;
      }
      case "heels": {
        const glossy = { roughness: 0.3, metalness: 0.05 };
        // pitched foot: the upper rides higher at the heel; a slim heel below it
        ellipsoid(c, primary, ankle, [0.042, 0.032, 0.125], [fx, fy - 0.005, fz + 0.045], glossy, [0.2, 0, 0]);
        c.add(c.P.cylinder(1, 1, 1), darken(primary, 0.6), ankle, { position: [fx, fy - 0.03, fz + 0.045], scale: [0.043, 0.012, 0.128], rotation: [0.2, 0, 0], material: FABRIC.leather });
        c.add(c.P.cylinder(0.008, 0.01, 0.075), darken(primary, 0.5), ankle, { position: [fx, fy - 0.055, fz - 0.06], material: glossy });
        c.add(c.P.box(0.05, 0.006, 0.006, 0.002), secondary, ankle, { position: [fx, fy + 0.012, fz - 0.03], noOutline: true, material: FABRIC.metal });
        break;
      }
      case "slides": {
        c.add(c.P.cylinder(1, 1, 1), primary, ankle, { position: [fx, fy - 0.066, fz + 0.01], scale: [0.052, 0.03, 0.135], material: FABRIC.rubber });
        c.add(c.P.box(0.104, 0.036, 0.07, 0.014), secondary, ankle, { position: [fx, fy - 0.014, fz + 0.03], rotation: [0.15, 0, 0], material: FABRIC.rubber });
        break;
      }
    }
  }
}


// ---------------------------------------------------------------- headwear

function buildHeadwear(c: Ctx, g: Outfit["headwear"]): void {
  const { type, primary, secondary, details } = g;
  if (type === "none") return;
  const m = fabricFor(g, FABRIC.cotton);
  switch (type) {
    case "cap": {
      const back = Boolean(details.backward);
      const dir = back ? -1 : 1;
      // Crown sits over the whole top of the head (nothing pokes through).
      c.add(c.P.sphere(D.headR * 1.1, Math.PI * 0.55), primary, c.J.head, { position: [0, HEAD_Y + 0.012, 0], scale: [1, 1.02, 1.04], material: m });
      c.add(c.P.torus(0.075, 0.03, Math.PI), primary, c.J.head, {
        position: [0, HEAD_Y + 0.018, dir * 0.085],
        rotation: [Math.PI / 2 + dir * 0.28, 0, 0],
        scale: [1.35, 1.35, 0.35],
        material: m,
      });
      for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
        c.add(c.P.box(0.004, 0.13, 0.004, 0.002), darken(primary, 0.8), c.J.head, {
          position: [Math.sin(a) * 0.06, HEAD_Y + 0.115, Math.cos(a) * 0.06],
          rotation: [Math.PI / 2 - 0.8, a, 0],
          noOutline: true,
        });
      }
      c.add(c.P.sphere(0.012), secondary, c.J.head, { position: [0, HEAD_Y + D.headR * 1.14, 0], noOutline: true });
      break;
    }
    case "beanie": {
      const knit = fabricFor(g, FABRIC.knit);
      c.add(c.P.sphere(D.headR * 1.12, Math.PI * 0.6), primary, c.J.head, { position: [0, HEAD_Y + 0.015, 0], scale: [1, 1.18, 1], material: knit });
      c.add(c.P.torus(D.headR * 1.07, 0.024), primary, c.J.head, { position: [0, HEAD_Y + 0.015, 0], rotation: [Math.PI / 2, 0, 0], material: knit });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.add(c.P.box(0.004, 0.03, 0.004, 0.002), darken(primary, 0.85), c.J.head, {
          position: [Math.sin(a) * D.headR * 1.09, HEAD_Y + 0.015, Math.cos(a) * D.headR * 1.09],
          rotation: [0, a, 0],
          noOutline: true,
        });
      }
      break;
    }
    case "bucket": {
      c.add(c.P.sphere(D.headR * 1.1, Math.PI * 0.52), primary, c.J.head, { position: [0, HEAD_Y + 0.012, 0], scale: [1, 0.96, 1], material: m });
      c.add(c.P.cylinder(D.headR * 1.14, D.headR * 1.7, 0.065, true), primary, c.J.head, { position: [0, HEAD_Y + 0.04, 0], material: m, doubleSide: true });
      c.add(c.P.torus(D.headR * 1.13, 0.008), darken(primary, 0.8), c.J.head, { position: [0, HEAD_Y + 0.075, 0], rotation: [Math.PI / 2, 0, 0], noOutline: true });
      break;
    }
    case "cowboy": {
      const felt = { roughness: 0.95 };
      // tall crown with a pinched top, wide brim curled up at the sides, hat band
      c.add(
        c.P.lathe([
          [0.13, 0.0],
          [0.125, 0.05],
          [0.112, 0.11],
          [0.095, 0.15],
          [0.06, 0.165],
          [0.0, 0.168],
        ]),
        primary,
        c.J.head,
        { position: [0, HEAD_Y + 0.02, 0], scale: [1, 1, 1.08], material: felt, doubleSide: true },
      );
      c.add(
        c.P.lathe([
          [0.125, 0.0],
          [0.2, 0.004],
          [0.235, 0.022],
          [0.245, 0.04],
        ]),
        primary,
        c.J.head,
        { position: [0, HEAD_Y + 0.022, 0], scale: [1.06, 1, 0.9], material: felt, doubleSide: true },
      );
      c.add(c.P.torus(0.128, 0.012), secondary, c.J.head, { position: [0, HEAD_Y + 0.045, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 1.08, 1], material: FABRIC.leather });
      c.add(c.P.box(0.03, 0.02, 0.006, 0.002), GOLD, c.J.head, { position: [0, HEAD_Y + 0.045, 0.14], noOutline: true, material: FABRIC.metal });
      break;
    }
    case "headband":
      c.add(c.P.torus(D.headR * 1.02, 0.014), primary, c.J.head, { position: [0, HEAD_Y + 0.025, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 1.15], material: FABRIC.knit });
      break;
    case "bandana":
      c.add(c.P.sphere(D.headR * 1.06, Math.PI * 0.44), primary, c.J.head, { position: [0, HEAD_Y + 0.01, 0], material: m });
      c.add(c.P.torus(D.headR * 1.0, 0.012), primary, c.J.head, { position: [0, HEAD_Y + 0.04, 0], rotation: [Math.PI / 2, 0, 0], material: m });
      c.add(c.P.box(0.05, 0.035, 0.04, 0.012), primary, c.J.head, { position: [0, HEAD_Y + 0.02, -0.115], material: m });
      for (const s of [1, -1]) {
        c.add(c.P.box(0.02, 0.07, 0.01, 0.004), primary, c.J.head, { position: [s * 0.02, HEAD_Y - 0.02, -0.12], rotation: [0.2, 0, s * 0.5], material: m });
      }
      break;
  }
}

// ---------------------------------------------------------------- eyewear

function buildEyewear(c: Ctx, g: Outfit["eyewear"]): void {
  const { type, primary, secondary } = g;
  if (type === "none") return;
  const dark = "#15191f";
  const lensDark = { roughness: 0.12, metalness: 0.6 };
  const lensClear = { roughness: 0.05, metalness: 0.3, opacity: 0.28 };
  const metal = primary > "#888888" ? SILVER : GOLD;
  const arms = (color: string, y = EYE_Y + 0.002, thick = 0.006, material = FABRIC.plastic) => {
    for (const s of [1, -1]) {
      c.add(c.P.box(thick, thick, 0.115, 0.002), color, c.J.head, { position: [s * D.headR * 0.95, y, 0.04], noOutline: true, material });
    }
  };
  const bridge = (color: string, w = 0.018, y = EYE_Y + 0.004, material = FABRIC.plastic) => {
    c.add(c.P.box(w, 0.005, 0.006, 0.002), color, c.J.head, { position: [0, y, EYE_Z + 0.002], noOutline: true, material });
  };
  switch (type) {
    case "aviators":
      for (const s of [1, -1]) {
        ellipsoid(c, "#2a2f3a", c.J.head, [0.03, 0.026, 0.005], [s * 0.037, EYE_Y - 0.004, EYE_Z], lensDark);
        c.add(c.P.torus(0.029, 0.0025), metal, c.J.head, { position: [s * 0.037, EYE_Y - 0.004, EYE_Z], scale: [1, 0.9, 1], noOutline: true, material: FABRIC.metal });
      }
      bridge(metal, 0.02, EYE_Y + 0.012, FABRIC.metal);
      c.add(c.P.box(0.07, 0.003, 0.003, 0.001), metal, c.J.head, { position: [0, EYE_Y + 0.02, EYE_Z], noOutline: true, material: FABRIC.metal });
      arms(metal, EYE_Y + 0.01, 0.004, FABRIC.metal);
      break;
    case "wayfarers":
      for (const s of [1, -1]) {
        c.add(c.P.box(0.05, 0.034, 0.012, 0.008), dark, c.J.head, { position: [s * 0.032, EYE_Y, EYE_Z], material: FABRIC.plastic });
        c.add(c.P.box(0.042, 0.026, 0.005, 0.005), "#1c2430", c.J.head, { position: [s * 0.032, EYE_Y - 0.001, EYE_Z + 0.008], noOutline: true, material: lensDark });
      }
      bridge(dark);
      arms(dark);
      break;
    case "round_shades":
      for (const s of [1, -1]) {
        c.add(c.P.cylinder(0.024, 0.024, 0.008), "#24180f", c.J.head, { position: [s * 0.033, EYE_Y, EYE_Z], rotation: [Math.PI / 2, 0, 0], material: lensDark });
        c.add(c.P.torus(0.024, 0.003), metal, c.J.head, { position: [s * 0.033, EYE_Y, EYE_Z + 0.002], noOutline: true, material: FABRIC.metal });
      }
      bridge(metal, 0.016, EYE_Y + 0.004, FABRIC.metal);
      arms(metal, EYE_Y, 0.004, FABRIC.metal);
      break;
    case "sport_shades":
      // one wrap-around visor lens
      c.add(c.P.torus(0.118, 0.016, Math.PI * 0.62), "#0f1b2d", c.J.head, {
        position: [0, EYE_Y, 0],
        rotation: [0, Math.PI / 2 - Math.PI * 0.31, 0],
        scale: [1, 1.1, 1],
        material: { roughness: 0.08, metalness: 0.7 },
      });
      c.add(c.P.torus(0.12, 0.004, Math.PI * 0.62), primary, c.J.head, {
        position: [0, EYE_Y + 0.017, 0],
        rotation: [0, Math.PI / 2 - Math.PI * 0.31, 0],
        noOutline: true,
        material: FABRIC.plastic,
      });
      arms(primary, EYE_Y + 0.012, 0.008);
      break;
    case "tiny_shades":
      for (const s of [1, -1]) {
        c.add(c.P.box(0.03, 0.013, 0.008, 0.004), "#1a1a1a", c.J.head, { position: [s * 0.024, EYE_Y - 0.004, EYE_Z], material: lensDark });
      }
      bridge(metal, 0.012, EYE_Y - 0.002, FABRIC.metal);
      arms(metal, EYE_Y - 0.004, 0.003, FABRIC.metal);
      break;
    case "oversized_shades":
      for (const s of [1, -1]) {
        c.add(c.P.box(0.066, 0.048, 0.012, 0.014), "#111111", c.J.head, { position: [s * 0.04, EYE_Y - 0.004, EYE_Z - 0.004], material: FABRIC.plastic });
        c.add(c.P.box(0.056, 0.038, 0.005, 0.01), "#2a1a2a", c.J.head, { position: [s * 0.04, EYE_Y - 0.005, EYE_Z + 0.004], noOutline: true, material: lensDark });
      }
      bridge("#111111", 0.014, EYE_Y + 0.006);
      arms("#111111", EYE_Y + 0.006, 0.009);
      break;
    case "round_glasses":
      for (const s of [1, -1]) {
        c.add(c.P.torus(0.023, 0.0025), metal, c.J.head, { position: [s * 0.032, EYE_Y, EYE_Z + 0.002], noOutline: true, material: FABRIC.metal });
        c.add(c.P.cylinder(0.021, 0.021, 0.003), "#cfe9ff", c.J.head, { position: [s * 0.032, EYE_Y, EYE_Z], rotation: [Math.PI / 2, 0, 0], noOutline: true, material: lensClear });
      }
      bridge(metal, 0.014, EYE_Y + 0.004, FABRIC.metal);
      arms(metal, EYE_Y, 0.003, FABRIC.metal);
      break;
    case "rect_glasses":
      for (const s of [1, -1]) {
        frameRect(c, primary, 0.046, 0.028, 0.004, [s * 0.031, EYE_Y, EYE_Z + 0.002]);
        c.add(c.P.box(0.042, 0.024, 0.003, 0.002), "#cfe9ff", c.J.head, { position: [s * 0.031, EYE_Y, EYE_Z], noOutline: true, material: lensClear });
      }
      bridge(primary, 0.012);
      arms(primary, EYE_Y, 0.004);
      break;
    case "thick_glasses":
      for (const s of [1, -1]) {
        frameRect(c, "#111111", 0.05, 0.036, 0.008, [s * 0.033, EYE_Y, EYE_Z + 0.002]);
        c.add(c.P.box(0.042, 0.028, 0.003, 0.002), "#cfe9ff", c.J.head, { position: [s * 0.033, EYE_Y, EYE_Z], noOutline: true, material: lensClear });
      }
      bridge("#111111", 0.014, EYE_Y + 0.008);
      arms("#111111", EYE_Y + 0.006, 0.008);
      break;
  }
  void secondary;
}

// ---------------------------------------------------------------- accessories

function buildAccessory(c: Ctx, g: Outfit["accessory"]): void {
  const { type, primary, secondary, fit } = g;
  if (type === "none") return;
  /** Accessories sit on whatever layer is underneath: assume the outer layer's depth. */
  const az = (y: number, extra = 0.004) => frontZ(y, OUTER_INFLATE, fit, 0.36, extra);
  switch (type) {
    case "chain": {
      const metal = secondary > primary ? SILVER : GOLD;
      c.add(c.P.torus(0.1, 0.007), metal, c.J.chest, {
        position: [0, 0.13, 0.03],
        rotation: [Math.PI / 2 - 0.35, 0, 0],
        scale: [1, 1.2, 1],
        noOutline: true,
        material: FABRIC.metal,
      });
      c.add(c.P.box(0.03, 0.035, 0.008, 0.004), metal, c.J.chest, { position: [0, 0.03, az(0.03)], noOutline: true, material: FABRIC.metal });
      break;
    }
    case "headphones":
      c.add(c.P.torus(D.headR * 1.22, 0.013, Math.PI), primary, c.J.head, { position: [0, HEAD_Y, 0], material: FABRIC.plastic });
      for (const s of [1, -1]) {
        c.add(c.P.cylinder(0.042, 0.042, 0.032), primary, c.J.head, { position: [s * D.headR * 1.13, HEAD_Y, 0], rotation: [0, 0, Math.PI / 2], material: FABRIC.plastic });
        c.add(c.P.cylinder(0.03, 0.03, 0.014), secondary, c.J.head, { position: [s * D.headR * 1.33, HEAD_Y, 0], rotation: [0, 0, Math.PI / 2], noOutline: true, material: FABRIC.plastic });
        c.add(c.P.cylinder(0.034, 0.034, 0.012), darken(primary, 0.6), c.J.head, { position: [s * D.headR * 1.0, HEAD_Y, 0], rotation: [0, 0, Math.PI / 2], noOutline: true, material: FABRIC.fleece });
      }
      break;
    case "backpack":
      c.add(c.P.box(0.25, 0.33, 0.13, 0.035), primary, c.J.chest, { position: [0, -0.05, -0.19], material: FABRIC.nylon });
      c.add(c.P.box(0.2, 0.12, 0.05, 0.02), secondary, c.J.chest, { position: [0, -0.13, -0.27], material: FABRIC.nylon });
      c.add(c.P.box(0.06, 0.02, 0.02, 0.006), darken(primary, 0.7), c.J.chest, { position: [0, 0.13, -0.19], noOutline: true });
      for (const s of [1, -1]) {
        c.add(c.P.box(0.04, 0.24, 0.02, 0.008), darken(primary, 0.8), c.J.chest, { position: [s * 0.1, 0.03, az(0.03, 0.002)], rotation: [0.12, 0, 0], material: FABRIC.nylon });
        c.add(c.P.box(0.04, 0.02, 0.012, 0.004), "#222222", c.J.chest, { position: [s * 0.1, -0.06, az(-0.06, 0.012)], noOutline: true, material: FABRIC.plastic });
      }
      break;
    case "crossbody":
      c.add(c.P.box(0.034, 0.46, 0.012, 0.005), primary, c.J.chest, { position: [0, -0.01, az(-0.01, 0.006)], rotation: [0, 0, 0.6], material: FABRIC.nylon });
      c.add(c.P.box(0.034, 0.32, 0.012, 0.005), primary, c.J.chest, { position: [0.02, 0.0, -0.165], rotation: [0, 0, -0.6], material: FABRIC.nylon });
      c.add(c.P.box(0.16, 0.11, 0.06, 0.018), primary, c.J.hips, { position: [-0.15, 0.02, 0.09], rotation: [0, 0.45, 0], material: FABRIC.nylon });
      c.add(c.P.box(0.16, 0.03, 0.065, 0.006), secondary, c.J.hips, { position: [-0.15, 0.065, 0.09], rotation: [0, 0.45, 0], noOutline: true, material: FABRIC.nylon });
      c.add(c.P.box(0.03, 0.012, 0.008, 0.003), "#222222", c.J.hips, { position: [-0.15, 0.045, 0.125], rotation: [0, 0.45, 0], noOutline: true, material: FABRIC.plastic });
      break;
    case "watch":
      c.add(c.P.torus(0.046, 0.011), primary, c.J.wristL, { position: [0, 0.035, 0], rotation: [Math.PI / 2, 0, 0], noOutline: true, material: FABRIC.leather });
      c.add(c.P.cylinder(0.02, 0.02, 0.012), secondary, c.J.wristL, { position: [0.04, 0.035, 0], rotation: [0, 0, Math.PI / 2], noOutline: true, material: FABRIC.metal });
      c.add(c.P.cylinder(0.015, 0.015, 0.004), "#101418", c.J.wristL, { position: [0.048, 0.035, 0], rotation: [0, 0, Math.PI / 2], noOutline: true, material: FABRIC.glass });
      break;
    case "scarf": {
      const m = fabricFor(g, FABRIC.knit);
      c.add(c.P.torus(0.088, 0.042), primary, c.J.chest, { position: [0, 0.19, 0.01], rotation: [Math.PI / 2, 0, 0], scale: [1.05, 0.78, 1], material: m });
      c.add(c.P.box(0.085, 0.28, 0.032, 0.014), primary, c.J.chest, { position: [0.06, 0.02, az(0.02, 0.016)], rotation: [0.05, 0, 0.08], material: m });
      c.add(c.P.box(0.085, 0.024, 0.034, 0.008), secondary, c.J.chest, { position: [0.066, -0.1, az(-0.1, 0.018)], noOutline: true, material: m });
      for (let i = 0; i < 5; i++) {
        c.add(c.P.cylinder(0.003, 0.003, 0.03), secondary, c.J.chest, { position: [0.032 + i * 0.016, -0.135, az(-0.135, 0.016)], noOutline: true });
      }
      break;
    }
    case "carabiner":
      c.add(c.P.torus(0.03, 0.006), SILVER, c.J.hips, { position: [0.17, -0.02, 0.06], rotation: [0, 0.4, 0.3], noOutline: true, material: FABRIC.metal });
      c.add(c.P.torus(0.016, 0.005), darken(primary, 0.9), c.J.hips, { position: [0.17, 0.02, 0.06], rotation: [0, 0.4, 0], noOutline: true, material: FABRIC.metal });
      c.add(c.P.box(0.008, 0.04, 0.008, 0.002), BRASS, c.J.hips, { position: [0.195, -0.02, 0.065], rotation: [0, 0.4, 0.3], noOutline: true, material: FABRIC.metal });
      break;
    case "tie": {
      const m = fabricFor(g, SATIN);
      // Tie hangs down the front, following the torso curve.
      c.add(c.P.box(0.036, 0.03, 0.022, 0.008), primary, c.J.chest, { position: [0, 0.175, az(0.175, 0.008)], material: m });
      c.add(c.P.box(0.028, 0.12, 0.008, 0.003), primary, c.J.chest, { position: [0, 0.1, az(0.1)], rotation: [-0.05, 0, 0], material: m });
      c.add(c.P.box(0.05, 0.24, 0.008, 0.003), primary, c.J.chest, { position: [0, -0.08, az(-0.08)], rotation: [-0.03, 0, 0], material: m });
      c.add(c.P.cone(0.026, 0.05), primary, c.J.chest, { position: [0, -0.22, az(-0.22)], rotation: [Math.PI, 0, Math.PI / 4], material: m });
      break;
    }
    case "pocket_square":
      c.add(c.P.box(0.05, 0.018, 0.012, 0.004), primary, c.J.chest, { position: [-0.095, 0.075, az(0.075, 0.002) - 0.01], rotation: [0, 0, 0.1], material: SATIN });
      c.add(c.P.cone(0.012, 0.02), primary, c.J.chest, { position: [-0.085, 0.09, az(0.09, 0.002) - 0.01], material: SATIN, noOutline: true });
      break;
    case "draped_sweater": {
      const m = fabricFor(g, FABRIC.knit);
      // sweater knotted over the shoulders: collar loop behind the neck, sleeves hanging down the chest
      c.add(c.P.torus(0.19, 0.045, Math.PI), primary, c.J.chest, { position: [0, 0.16, -0.03], rotation: [Math.PI / 2, 0, 0], scale: [1.05, 0.8, 1], material: m });
      for (const s of [1, -1]) {
        c.add(c.P.capsule(0.03, 0.2), primary, c.J.chest, { position: [s * 0.07, 0.02, az(0.02, 0.02)], rotation: [0.1, 0, s * -0.35], material: m });
      }
      c.add(c.P.box(0.09, 0.06, 0.05, 0.02), primary, c.J.chest, { position: [0, 0.1, az(0.1, 0.02)], material: m });
      break;
    }
  }
}

// ---------------------------------------------------------------- public API

export function buildSlot(rig: MannequinRig, outfit: Outfit, slot: Slot): BuiltSlot {
  const c = ctx(rig);
  switch (slot) {
    case "top":
      buildTop(c, outfit.top);
      break;
    case "outerwear":
      buildOuterwear(c, outfit.outerwear);
      break;
    case "bottom":
      buildBottom(c, outfit.bottom);
      break;
    case "shoes":
      buildShoes(c, outfit.shoes);
      break;
    case "headwear":
      buildHeadwear(c, outfit.headwear);
      break;
    case "eyewear":
      buildEyewear(c, outfit.eyewear);
      break;
    case "accessory":
      buildAccessory(c, outfit.accessory);
      break;
  }
  return { slot, parts: c.parts };
}

/** Full-body costume replacing every regular slot. */
export function buildCostumeSlot(rig: MannequinRig, outfit: Outfit): BuiltSlot {
  const c = ctx(rig);
  buildCostume(c, outfit);
  return { slot: "costume", parts: c.parts };
}

export function removeSlot(rig: MannequinRig, built: BuiltSlot | undefined): void {
  if (!built) return;
  for (const part of built.parts) rig.parts.remove(part);
}

export function garmentLabel(g: Garment<string>): string {
  return `${g.type} (${g.fit}${g.pattern !== "solid" ? `, ${g.pattern}` : ""})`;
}
