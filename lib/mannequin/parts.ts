import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type RenderMode = "solid" | "edges";

export type PatternKind = "stripes" | "vstripes" | "check" | "colorblock" | "camo" | "quilt" | "spots" | "terminal";

export interface PatternSpec {
  kind: PatternKind;
  colorA: string;
  colorB: string;
  colorC?: string;
  /** Texture repeats across the garment (default 1). */
  repeat?: [number, number];
  /** Deterministic seed for camo blobs. */
  seed?: number;
}

export interface MaterialSpec {
  roughness?: number;
  metalness?: number;
  /** 0..1 opacity; below 1 makes the material transparent. */
  opacity?: number;
  pattern?: PatternSpec;
  emissive?: string;
}

export interface PartOptions {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  /** Skip the outline hull (tiny details that would just blob together). */
  noOutline?: boolean;
  /** Thin outline hull for small parts like fingers and feet. */
  thinOutline?: boolean;
  material?: MaterialSpec;
  /** Render both faces (open lathe shells seen from inside). */
  doubleSide?: boolean;
}

export interface Part {
  group: THREE.Group;
  mesh: THREE.Mesh;
  hull: THREE.Mesh;
  color: string;
  spec: MaterialSpec | undefined;
  doubleSide: boolean;
}

/** [radius, y] pairs revolved around Y. */
export type LatheProfile = readonly (readonly [number, number])[];

const OUTLINE_THICKNESS = 0.011;
const THIN_OUTLINE_THICKNESS = 0.0045;
const CYAN = "#9ee7ff";

/** Inverted-hull outline: back faces pushed out along their normals. */
function hullMaterial(thickness: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: CYAN, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n transformed += normalize(normal) * ${thickness.toFixed(4)};`,
    );
  };
  return m;
}

/**
 * Mirror-mode fill: black, with a cyan rim wherever the surface curves away
 * from the camera. That keeps hands in front of the body, garment hems and
 * overlapping parts readable at every turntable angle (a flat black fill
 * made them vanish into each other).
 */
function rimMaterial(side: THREE.Side): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side,
    uniforms: {
      uColor: { value: new THREE.Color(CYAN) },
      uPower: { value: 2.2 },
      uEdge0: { value: 0.32 },
      uEdge1: { value: 0.78 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uEdge0;
      uniform float uEdge1;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        float facing = clamp(dot(n, normalize(vView)), 0.0, 1.0);
        float rim = pow(1.0 - facing, uPower);
        float line = smoothstep(uEdge0, uEdge1, rim);
        gl_FragColor = vec4(uColor * line, 1.0);
      }
    `,
  });
}

/**
 * Shared materials and geometry cache. Every body part and garment goes
 * through here so switching between digital (solid matte) and mirror (black
 * fill + cyan outline hull) rendering is one call.
 */
export class PartRegistry {
  private parts = new Set<Part>();
  private solidMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private textures = new Map<string, THREE.CanvasTexture>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private blackMaterial = rimMaterial(THREE.FrontSide);
  private blackDouble = rimMaterial(THREE.DoubleSide);
  private hullMaterial = hullMaterial(OUTLINE_THICKNESS);
  private hullThinMaterial = hullMaterial(THIN_OUTLINE_THICKNESS);
  private mode: RenderMode;

  constructor(mode: RenderMode) {
    this.mode = mode;
  }

  get renderMode(): RenderMode {
    return this.mode;
  }

  // ---------------------------------------------------------------- geometry

  capsule(radius: number, length: number): THREE.BufferGeometry {
    return this.cached(`cap:${radius.toFixed(4)}:${length.toFixed(4)}`, () => new THREE.CapsuleGeometry(radius, length, 8, 24));
  }

  sphere(radius: number, thetaLength = Math.PI, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0): THREE.BufferGeometry {
    return this.cached(
      `sph:${radius.toFixed(4)}:${thetaLength.toFixed(3)}:${phiStart.toFixed(3)}:${phiLength.toFixed(3)}:${thetaStart.toFixed(3)}`,
      () => new THREE.SphereGeometry(radius, 28, 20, phiStart, phiLength, thetaStart, thetaLength),
    );
  }

  box(w: number, h: number, d: number, radius = 0.01): THREE.BufferGeometry {
    const r = Math.min(radius, w / 2, h / 2, d / 2);
    return this.cached(`box:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}:${r.toFixed(4)}`, () => new RoundedBoxGeometry(w, h, d, 3, r));
  }

  torus(radius: number, tube: number, arc = Math.PI * 2): THREE.BufferGeometry {
    return this.cached(`tor:${radius.toFixed(4)}:${tube.toFixed(4)}:${arc.toFixed(3)}`, () => new THREE.TorusGeometry(radius, tube, 10, 32, arc));
  }

  cylinder(rTop: number, rBottom: number, height: number, open = false): THREE.BufferGeometry {
    return this.cached(
      `cyl:${rTop.toFixed(4)}:${rBottom.toFixed(4)}:${height.toFixed(4)}:${open ? 1 : 0}`,
      () => new THREE.CylinderGeometry(rTop, rBottom, height, 28, 1, open),
    );
  }

  cone(radius: number, height: number): THREE.BufferGeometry {
    return this.cached(`cone:${radius.toFixed(4)}:${height.toFixed(4)}`, () => new THREE.ConeGeometry(radius, height, 24));
  }

  ring(inner: number, outer: number): THREE.BufferGeometry {
    return this.cached(`ring:${inner.toFixed(4)}:${outer.toFixed(4)}`, () => new THREE.RingGeometry(inner, outer, 48));
  }

  /**
   * One-piece tapered limb: a hemisphere of `rTop` at the origin, straight
   * taper to a hemisphere of `rBottom` at y = -length. Two limbs that share a
   * joint use the same radius there, so the joint reads as one smooth shape.
   */
  limb(rTop: number, rBottom: number, length: number): THREE.BufferGeometry {
    return this.cached(`limb:${rTop.toFixed(4)}:${rBottom.toFixed(4)}:${length.toFixed(4)}`, () => {
      const pts: THREE.Vector2[] = [];
      const capSegs = 7;
      for (let i = 0; i <= capSegs; i++) {
        const a = (i / capSegs) * (Math.PI / 2); // 0 = tip, PI/2 = equator
        pts.push(new THREE.Vector2(Math.sin(a) * rBottom, -length - Math.cos(a) * rBottom));
      }
      for (let i = 0; i <= capSegs; i++) {
        const a = (i / capSegs) * (Math.PI / 2);
        pts.push(new THREE.Vector2(Math.cos(a) * rTop, Math.sin(a) * rTop));
      }
      return new THREE.LatheGeometry(pts, 26);
    });
  }

  /**
   * Garment shell revolved from a profile (bottom to top). Open at both ends,
   * optionally with a gap (open jacket fronts): the gap is centred on +Z.
   */
  lathe(profile: LatheProfile, gap = 0): THREE.BufferGeometry {
    const key = `lat:${profile.map(([r, y]) => `${r.toFixed(4)},${y.toFixed(4)}`).join(";")}:${gap.toFixed(3)}`;
    return this.cached(key, () => {
      const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
      const phiLength = Math.PI * 2 - gap;
      // Lathe phi=0 sits on +X; start past +Z (phi = PI/2) by half the gap.
      const phiStart = Math.PI / 2 + gap / 2;
      const g = new THREE.LatheGeometry(pts, 40, phiStart, phiLength);
      return g;
    });
  }

  private cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geometries.get(key);
    if (!g) {
      g = make();
      this.geometries.set(key, g);
    }
    return g;
  }

  // ---------------------------------------------------------------- parts

  add(geometry: THREE.BufferGeometry, color: string, parent: THREE.Object3D, opts: PartOptions = {}): Part {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, this.solidMaterial(color, opts.material, Boolean(opts.doubleSide)));
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const hull = new THREE.Mesh(geometry, opts.thinOutline ? this.hullThinMaterial : this.hullMaterial);
    hull.visible = false;
    if (opts.noOutline) hull.userData.noOutline = true;
    group.add(mesh, hull);
    if (opts.position) group.position.set(...opts.position);
    if (opts.rotation) group.rotation.set(...opts.rotation);
    if (opts.scale !== undefined) {
      if (typeof opts.scale === "number") group.scale.setScalar(opts.scale);
      else group.scale.set(...opts.scale);
    }
    parent.add(group);
    const part: Part = { group, mesh, hull, color, spec: opts.material, doubleSide: Boolean(opts.doubleSide) };
    this.parts.add(part);
    this.applyMode(part);
    return part;
  }

  remove(part: Part): void {
    part.group.removeFromParent();
    this.parts.delete(part);
  }

  setMode(mode: RenderMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const part of this.parts) this.applyMode(part);
  }

  private applyMode(part: Part): void {
    if (this.mode === "solid") {
      part.mesh.material = this.solidMaterial(part.color, part.spec, part.doubleSide);
      part.mesh.castShadow = true;
      part.hull.visible = false;
    } else {
      part.mesh.material = part.doubleSide ? this.blackDouble : this.blackMaterial;
      part.mesh.castShadow = false;
      part.hull.visible = !part.hull.userData.noOutline;
    }
  }

  // ---------------------------------------------------------------- materials

  private solidMaterial(color: string, spec: MaterialSpec | undefined, doubleSide: boolean): THREE.MeshStandardMaterial {
    const key = `${color}|${doubleSide ? 2 : 1}|${spec ? JSON.stringify(spec) : ""}`;
    let m = this.solidMaterials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: spec?.pattern ? 0xffffff : color,
        roughness: spec?.roughness ?? 0.88,
        metalness: spec?.metalness ?? 0,
        side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (spec?.pattern) m.map = this.patternTexture(spec.pattern);
      if (spec?.opacity !== undefined && spec.opacity < 1) {
        m.transparent = true;
        m.opacity = spec.opacity;
      }
      if (spec?.emissive) m.emissive = new THREE.Color(spec.emissive);
      this.solidMaterials.set(key, m);
    }
    return m;
  }

  patternTexture(p: PatternSpec): THREE.CanvasTexture {
    const key = JSON.stringify(p);
    let t = this.textures.get(key);
    if (t) return t;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = p.colorA;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = p.colorB;
    switch (p.kind) {
      case "stripes":
        for (let y = 0; y < size; y += 64) ctx.fillRect(0, y, size, 28);
        break;
      case "vstripes":
        for (let x = 0; x < size; x += 48) ctx.fillRect(x, 0, 14, size);
        break;
      case "check": {
        ctx.globalAlpha = 0.55;
        for (let x = 0; x < size; x += 64) ctx.fillRect(x, 0, 32, size);
        for (let y = 0; y < size; y += 64) ctx.fillRect(0, y, size, 32);
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.colorC ?? "#111111";
        ctx.globalAlpha = 0.5;
        for (let x = 12; x < size; x += 64) ctx.fillRect(x, 0, 4, size);
        for (let y = 12; y < size; y += 64) ctx.fillRect(0, y, size, 4);
        ctx.globalAlpha = 1;
        break;
      }
      case "colorblock":
        ctx.fillRect(0, 0, size, size * 0.45);
        if (p.colorC) {
          ctx.fillStyle = p.colorC;
          ctx.fillRect(0, size * 0.45, size, 14);
        }
        break;
      case "camo": {
        let s = (p.seed ?? 7) >>> 0;
        const rnd = () => {
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 4294967296;
        };
        const colors = [p.colorB, p.colorC ?? "#2b2b2b", p.colorA];
        for (let i = 0; i < 46; i++) {
          ctx.fillStyle = colors[i % colors.length];
          const x = rnd() * size;
          const y = rnd() * size;
          const r = 18 + rnd() * 34;
          ctx.beginPath();
          for (let k = 0; k <= 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const rr = r * (0.7 + rnd() * 0.5);
            const px = x + Math.cos(a) * rr;
            const py = y + Math.sin(a) * rr * 0.7;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          // wrap-around copies keep the texture seamless
          ctx.save();
          ctx.translate(x > size / 2 ? -size : size, 0);
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case "terminal": {
        // Fake AURA OS terminal for the laptop screen.
        ctx.fillStyle = p.colorB;
        ctx.font = "bold 18px monospace";
        const lines = ["> AURA OS 1.3.0", "> SAVING CARD...", "> BLURRING FACE... OK", "> UPLOADING PNG... OK", "> QR READY.", "> _"];
        lines.forEach((line, i) => ctx.fillText(line, 14, 34 + i * 30));
        ctx.fillRect(14, 226, 60, 4);
        break;
      }
      case "spots": {
        let s = (p.seed ?? 3) >>> 0;
        const rnd = () => {
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 4294967296;
        };
        for (let i = 0; i < 70; i++) {
          const x = rnd() * size;
          const y = rnd() * size;
          const r = 6 + rnd() * 9;
          ctx.fillStyle = p.colorB;
          for (const dx of [0, x > size / 2 ? -size : size]) {
            ctx.beginPath();
            ctx.ellipse(x + dx, y, r, r * (0.7 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
          }
          if (p.colorC && rnd() > 0.5) {
            ctx.fillStyle = p.colorC;
            ctx.beginPath();
            ctx.ellipse(x, y, r * 0.5, r * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case "quilt": {
        ctx.fillStyle = p.colorB;
        for (let y = 0; y < size; y += 42) {
          ctx.fillRect(0, y, size, 5);
        }
        // soft shading below each seam for a puffed look
        const grad = ctx.createLinearGradient(0, 0, 0, 42);
        grad.addColorStop(0, "rgba(0,0,0,0.22)");
        grad.addColorStop(0.35, "rgba(0,0,0,0)");
        grad.addColorStop(0.8, "rgba(255,255,255,0.08)");
        grad.addColorStop(1, "rgba(0,0,0,0.18)");
        for (let y = 5; y < size; y += 42) {
          ctx.save();
          ctx.translate(0, y);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, size, 37);
          ctx.restore();
        }
        break;
      }
    }
    t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    const [rx, ry] = p.repeat ?? [1, 1];
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    this.textures.set(key, t);
    return t;
  }

  dispose(): void {
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.solidMaterials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.geometries.clear();
    this.solidMaterials.clear();
    this.textures.clear();
    this.blackMaterial.dispose();
    this.blackDouble.dispose();
    this.hullMaterial.dispose();
    this.hullThinMaterial.dispose();
    this.parts.clear();
  }
}
