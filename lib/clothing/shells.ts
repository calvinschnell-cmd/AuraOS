import type * as THREE from "three";
import { DIMS } from "@/lib/mannequin/dims";
import type { LatheProfile, MaterialSpec, Part, PartOptions, PartRegistry, PatternSpec } from "@/lib/mannequin/parts";
import type { MannequinRig } from "@/lib/mannequin/rig";
import type { FitWidth, Garment, Pattern } from "./types";

/**
 * Shared garment-building helpers. Garments are lathe-revolved shells with a
 * real silhouette (shoulder slope, waist, hem) instead of capsules, scaled on
 * Z for an elliptical cross-section, and open at the ends like real cloth.
 */

export const D = DIMS;

/** Sleeves stop this far above the wrist so hands stay visible. */
export const SLEEVE_WRIST_MARGIN = 0.07;
export const FIT_MUL: Record<FitWidth, number> = { slim: 0.97, regular: 1, oversized: 1.07 };
export const TORSO_Z = 0.76;
export const SILVER = "#d6d6d6";
export const GOLD = "#d9a441";
export const BRASS = "#b08d57";

export interface Ctx {
  P: PartRegistry;
  J: MannequinRig["joints"];
  parts: Part[];
  add: (geometry: THREE.BufferGeometry, color: string, parent: THREE.Object3D, opts?: PartOptions) => Part;
}

export function ctx(rig: MannequinRig): Ctx {
  const parts: Part[] = [];
  return {
    P: rig.parts,
    J: rig.joints,
    parts,
    add: (g, c, parent, opts) => {
      const part = rig.parts.add(g, c, parent, opts);
      parts.push(part);
      return part;
    },
  };
}

export function darken(hex: string, f = 0.8): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function lighten(hex: string, f = 0.25): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * f);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Scale a profile's radii. */
export function widen(profile: LatheProfile, mul: number): LatheProfile {
  return profile.map(([r, y]) => [r * mul, y] as const);
}

// ---------------------------------------------------------------- fabrics

export const FABRIC: Record<string, MaterialSpec> = {
  cotton: { roughness: 0.92 },
  knit: { roughness: 1 },
  fleece: { roughness: 1 },
  denim: { roughness: 0.96 },
  wool: { roughness: 0.85 },
  nylon: { roughness: 0.55 },
  leather: { roughness: 0.42, metalness: 0.05 },
  puffer: { roughness: 0.5 },
  rubber: { roughness: 0.7 },
  metal: { roughness: 0.32, metalness: 0.85 },
  glass: { roughness: 0.12, metalness: 0.7 },
  plastic: { roughness: 0.45 },
  canvas: { roughness: 1 },
};

/** Material for a garment: fabric look plus its rolled pattern, if any. */
export function fabricFor(g: Garment<string>, fabric: MaterialSpec, extraPattern?: PatternSpec): MaterialSpec {
  const pattern = extraPattern ?? patternSpec(g.pattern, g.primary, g.secondary, g.type);
  return pattern ? { ...fabric, pattern } : fabric;
}

export function patternSpec(pattern: Pattern, primary: string, secondary: string, seedText = ""): PatternSpec | undefined {
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  switch (pattern) {
    case "solid":
      return undefined;
    case "stripes":
      return { kind: "stripes", colorA: primary, colorB: secondary, repeat: [1, 3] };
    case "vstripes":
      return { kind: "vstripes", colorA: primary, colorB: secondary, repeat: [4, 1] };
    case "check":
      return { kind: "check", colorA: primary, colorB: secondary, colorC: darken(primary, 0.45), repeat: [3, 2] };
    case "colorblock":
      return { kind: "colorblock", colorA: primary, colorB: secondary, colorC: darken(secondary, 0.7), repeat: [1, 1] };
    case "camo":
      return { kind: "camo", colorA: primary, colorB: secondary, colorC: darken(primary, 0.6), repeat: [2, 2], seed };
  }
}

// ---------------------------------------------------------------- profiles (chest-local, bottom to top)

/** Torso shells. `hem` is how far below the chest joint the garment ends. */
export function torsoProfile(hem: number, inflate = 1): LatheProfile {
  // Body torso at these heights: ~0.166 (hips) .. 0.182 (chest) .. 0.172 (shoulder line).
  return widen(
    [
      [0.186, -hem],
      [0.183, -hem + 0.06],
      [0.184, -0.12],
      [0.192, 0.0],
      [0.2, 0.1],
      [0.205, 0.15],
      [0.178, 0.185],
      [0.11, 0.205],
      [0.078, 0.215],
    ],
    inflate,
  );
}

/** Torso garment radius (before z-scale) at a chest-local height. */
export function torsoRadiusAt(y: number, hem = 0.36, inflate = 1): number {
  const p = torsoProfile(hem, inflate);
  if (y <= p[0][1]) return p[0][0];
  for (let i = 1; i < p.length; i++) {
    const [r1, y1] = p[i];
    if (y <= y1) {
      const [r0, y0] = p[i - 1];
      const t = (y - y0) / (y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return p[p.length - 1][0];
}

/**
 * Depth (chest-local z) of the front surface of a torso garment at height
 * `y`, plus a small offset, so details sit on the cloth instead of floating.
 */
export function frontZ(y: number, inflate: number, fit: FitWidth, hem = 0.36, extra = 0.004, z = TORSO_Z): number {
  return torsoRadiusAt(y, hem, inflate * FIT_MUL[fit]) * z + extra;
}

export function torsoShell(c: Ctx, color: string, opts: { hem: number; inflate?: number; fit: FitWidth; gap?: number; material?: MaterialSpec; z?: number }): Part {
  const mul = (opts.inflate ?? 1) * FIT_MUL[opts.fit];
  return c.add(c.P.lathe(torsoProfile(opts.hem, mul), opts.gap ?? 0), color, c.J.chest, {
    scale: [1, 1, opts.z ?? TORSO_Z],
    material: opts.material,
    doubleSide: true,
  });
}

/** Upper sleeve (parent shoulder). Length is measured down from the shoulder. */
export function upperSleeveProfile(length: number, inflate = 1): LatheProfile {
  // Upper arm radius 0.054 at the shoulder tapering to 0.044 at the elbow.
  return widen(
    [
      [0.058, -length],
      [0.058, -length + 0.06],
      [0.062, -0.1],
      [0.068, 0.0],
      [0.056, 0.04],
      [0.03, 0.06],
    ],
    inflate,
  );
}

export function forearmSleeveProfile(length: number, inflate = 1, flare = 1): LatheProfile {
  // Forearm radius 0.044 at the elbow tapering to 0.036 at the wrist.
  return widen(
    [
      [0.047 * flare, -length],
      [0.048, -length + 0.05],
      [0.052, -0.05],
      [0.056, 0.02],
      [0.046, 0.05],
    ],
    inflate,
  );
}

export function sleeves(
  c: Ctx,
  color: string,
  opts: { length: "short" | "long" | "none"; inflate?: number; fit: FitWidth; material?: MaterialSpec; cuffColor?: string; cuffMaterial?: MaterialSpec },
): void {
  if (opts.length === "none") return;
  const mul = (opts.inflate ?? 1) * FIT_MUL[opts.fit];
  for (const side of ["L", "R"] as const) {
    const shoulder = c.J[`shoulder${side}`];
    if (opts.length === "short") {
      c.add(c.P.lathe(upperSleeveProfile(0.15, mul)), color, shoulder, { material: opts.material, doubleSide: true });
      continue;
    }
    c.add(c.P.lathe(upperSleeveProfile(D.upperArmL - 0.02, mul)), color, shoulder, { material: opts.material, doubleSide: true });
    const elbow = c.J[`elbow${side}`];
    const cover = D.forearmL - SLEEVE_WRIST_MARGIN;
    c.add(c.P.lathe(forearmSleeveProfile(cover, mul)), color, elbow, { material: opts.material, doubleSide: true });
    if (opts.cuffColor) {
      c.add(c.P.torus(0.05 * mul, 0.012), opts.cuffColor, elbow, {
        position: [0, -cover + 0.008, 0],
        rotation: [Math.PI / 2, 0, 0],
        material: opts.cuffMaterial,
      });
    }
  }
}

/** Trouser legs (parent hip / knee). */
export function thighProfile(length: number, r: number, flareBottom = 1): LatheProfile {
  return [
    [r * flareBottom, -length],
    [r, -length + 0.08],
    [r * 1.04, -0.05],
    [r * 1.08, 0.02],
    [r * 0.95, 0.06],
  ];
}

export function shinProfile(length: number, r: number, flareBottom = 1): LatheProfile {
  return [
    [r * flareBottom, -length],
    [r, -length + 0.08],
    [r * 1.02, -0.1],
    [r * 1.06, 0.02],
    [r * 0.9, 0.05],
  ];
}

export function legs(
  c: Ctx,
  color: string,
  opts: { thighR: number; shinR: number | null; flare?: number; shinLength?: number; material?: MaterialSpec; cuffColor?: string },
): void {
  for (const side of ["L", "R"] as const) {
    const hip = c.J[`hip${side}`];
    const thighLen = opts.shinR === null ? 0.21 : D.thighL - 0.03;
    c.add(c.P.lathe(thighProfile(thighLen, opts.thighR, opts.shinR === null ? 1.04 : 1)), color, hip, {
      material: opts.material,
      doubleSide: true,
    });
    if (opts.shinR !== null) {
      const knee = c.J[`knee${side}`];
      const shinLen = opts.shinLength ?? D.shinL - 0.07;
      c.add(c.P.lathe(shinProfile(shinLen, opts.shinR, opts.flare ?? 1)), color, knee, { material: opts.material, doubleSide: true });
      if (opts.cuffColor) {
        c.add(c.P.torus(opts.shinR * 0.98, opts.shinR * 0.28), opts.cuffColor, knee, {
          position: [0, -shinLen + 0.01, 0],
          rotation: [Math.PI / 2, 0, 0],
          material: opts.material,
        });
      }
    }
  }
}

/** Waistband + seat around the hips. */
export function waist(c: Ctx, color: string, opts: { inflate?: number; material?: MaterialSpec; band?: string }): void {
  const mul = opts.inflate ?? 1;
  c.add(
    c.P.lathe(
      widen(
        [
          [0.15, -0.11],
          [0.162, -0.06],
          [0.168, 0.0],
          [0.166, 0.045],
        ],
        mul,
      ),
    ),
    color,
    c.J.hips,
    { scale: [1.1, 1, 0.82], material: opts.material, doubleSide: true },
  );
  if (opts.band) {
    c.add(c.P.torus(0.168 * mul, 0.012), opts.band, c.J.hips, {
      position: [0, 0.035, 0],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1.1, 0.82, 1],
      material: opts.material,
    });
  }
}

// ---------------------------------------------------------------- details

export function collarRing(c: Ctx, color: string, tube = 0.013, y = 0.2, material?: MaterialSpec): void {
  c.add(c.P.torus(0.078, tube), color, c.J.chest, { position: [0, y, 0.008], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.85, 1], material });
}

export function standCollar(c: Ctx, color: string, height = 0.07, material?: MaterialSpec): void {
  c.add(c.P.cylinder(0.072, 0.082, height, true), color, c.J.neck, {
    position: [0, height / 2 - 0.01, 0],
    scale: [1, 1, 0.9],
    material,
    doubleSide: true,
  });
}

export function shirtCollar(c: Ctx, color: string, material?: MaterialSpec): void {
  standCollar(c, color, 0.045, material);
  for (const s of [1, -1]) {
    c.add(c.P.box(0.075, 0.06, 0.01, 0.004), color, c.J.chest, {
      position: [s * 0.05, 0.19, 0.105],
      rotation: [-0.5, 0, s * 0.62],
      material,
    });
  }
}

/** `z` may be a number or a function of height (use `frontZ`). */
type Depth = number | ((y: number) => number);
const depth = (z: Depth, y: number) => (typeof z === "function" ? z(y) : z);

export function buttonLine(c: Ctx, color: string, count: number, top: number, spacing: number, z: Depth = 0.17, material?: MaterialSpec): void {
  for (let i = 0; i < count; i++) {
    const y = top - i * spacing;
    c.add(c.P.sphere(0.01), color, c.J.chest, { position: [0, y, depth(z, y) + 0.004], noOutline: true, material: material ?? FABRIC.plastic });
  }
}

export function placket(c: Ctx, color: string, height: number, y: number, z: Depth = 0.17, width = 0.02): void {
  // Follow the torso curve: a thin panel angled between its top and bottom depth.
  const zTop = depth(z, y + height / 2);
  const zBot = depth(z, y - height / 2);
  const tilt = Math.atan2(zTop - zBot, height);
  c.add(c.P.box(width, height, 0.006, 0.002), color, c.J.chest, { position: [0, y, (zTop + zBot) / 2], rotation: [-tilt, 0, 0], noOutline: true });
}

export function lapels(c: Ctx, color: string, material?: MaterialSpec, spread = 0.05, z: Depth = 0.168): void {
  for (const s of [1, -1]) {
    c.add(c.P.box(0.06, 0.19, 0.01, 0.004), color, c.J.chest, {
      position: [s * spread, 0.085, depth(z, 0.085) - 0.002],
      rotation: [-0.08, 0, s * 0.3],
      material,
    });
  }
}

/** Four thin bars forming a rectangular spectacle frame (in the head's XY plane). */
export function frameRect(c: Ctx, color: string, w: number, h: number, thick: number, position: [number, number, number], material?: MaterialSpec): void {
  const [x, y, z] = position;
  c.add(c.P.box(w, thick, thick, 0.001), color, c.J.head, { position: [x, y + h / 2, z], noOutline: true, material });
  c.add(c.P.box(w, thick, thick, 0.001), color, c.J.head, { position: [x, y - h / 2, z], noOutline: true, material });
  c.add(c.P.box(thick, h, thick, 0.001), color, c.J.head, { position: [x - w / 2, y, z], noOutline: true, material });
  c.add(c.P.box(thick, h, thick, 0.001), color, c.J.head, { position: [x + w / 2, y, z], noOutline: true, material });
}

export function zipper(c: Ctx, color: string, height: number, y: number, z: Depth): void {
  const zTop = depth(z, y + height / 2);
  const zBot = depth(z, y - height / 2);
  const tilt = Math.atan2(zTop - zBot, height);
  c.add(c.P.box(0.012, height, 0.006, 0.002), color, c.J.chest, { position: [0, y, (zTop + zBot) / 2], rotation: [-tilt, 0, 0], noOutline: true, material: FABRIC.metal });
  c.add(c.P.box(0.018, 0.022, 0.008, 0.003), color, c.J.chest, { position: [0, y + height / 2 - 0.02, zTop + 0.004], noOutline: true, material: FABRIC.metal });
}

/** Pocket as a slightly raised rounded panel. */
export function pocket(c: Ctx, color: string, parent: THREE.Object3D, size: [number, number], position: [number, number, number], rotation?: [number, number, number], material?: MaterialSpec): void {
  c.add(c.P.box(size[0], size[1], 0.014, 0.006), color, parent, { position, rotation, material });
  // flap
  c.add(c.P.box(size[0] * 1.04, size[1] * 0.28, 0.018, 0.005), darken(color, 0.9), parent, {
    position: [position[0], position[1] + size[1] * 0.4, position[2] + 0.004],
    rotation,
    material,
    noOutline: true,
  });
}

/** Elliptical shape used for shoe uppers and cushions. */
export function ellipsoid(c: Ctx, color: string, parent: THREE.Object3D, radii: [number, number, number], position: [number, number, number], material?: MaterialSpec, rotation?: [number, number, number]): Part {
  return c.add(c.P.sphere(1), color, parent, { position, scale: radii, rotation, material });
}
