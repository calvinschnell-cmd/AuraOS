import * as THREE from "three";
import { buildCostumeSlot, buildSlot, removeSlot, type BuiltSlot } from "@/lib/clothing/build";
import { generateOutfit } from "@/lib/clothing/generator";
import { FABRIC } from "@/lib/clothing/shells";
import { SLOTS, type Outfit, type Slot } from "@/lib/clothing/types";
import { ATTRACT_LINES } from "@/lib/copy";
import { COSTUME_ANIMATION_PRESETS } from "@/lib/costumePoses";
import { ANIMATION_PRESETS, IDLE_ANIM, IDLE_POSE, type Animation, type Pose } from "@/lib/poses";
import { AnimationPlayer, resolvePose, type ResolvedPose } from "./animation";
import { BubbleEffect } from "./bubbles";
import { BlackHoleEffect, FishSchoolEffect, FrogTongueEffect, type Effect } from "./effects";
import type { Part, RenderMode } from "./parts";
import { MannequinRig } from "./rig";
import { TextBand } from "./textBand";

export interface SceneOptions {
  mode: RenderMode;
  performanceMode?: boolean;
  /** Called about once a second with the measured frame rate. */
  onFps?: (fps: number) => void;
  /** Transparent background (default) or a solid color (editor / certificate). */
  background?: string | null;
}

const MAX_DPR = 1.5;
const FIGURE_TOP = 1.95;
const FIGURE_BOTTOM = -0.1;
/** Distance between neighbouring figures in a battle line-up (world units). */
const CREW_SPACING = 1.45;
/** Half-width framed around a line-up: every figure's arm span plus a margin. */
const CREW_MARGIN = 0.8;

/** A posed, dressed figure: rig + animation player + outfit meshes. */
class Figure {
  readonly rig: MannequinRig;
  readonly player: AnimationPlayer;
  readonly offset = new THREE.Group();
  slots = new Map<Slot | "costume", BuiltSlot>();
  outfit: Outfit | null = null;
  baseAnim: Animation | null = null;
  idleAmount = 1;
  idleTarget = 1;

  constructor(mode: RenderMode) {
    this.rig = new MannequinRig(mode);
    this.offset.add(this.rig.root);
    this.player = new AnimationPlayer(IDLE_POSE);
    this.player.play(IDLE_ANIM, 0);
  }

  setOutfit(outfit: Outfit): boolean {
    const costumeChanged = this.outfit?.costume !== outfit.costume || this.outfit?.mascot !== outfit.mascot;
    this.outfit = outfit;
    for (const built of this.slots.values()) removeSlot(this.rig, built);
    this.slots.clear();
    if (outfit.costume !== "none") this.slots.set("costume", buildCostumeSlot(this.rig, outfit));
    else for (const slot of SLOTS) this.slots.set(slot, buildSlot(this.rig, outfit, slot));
    this.player.rate = outfit.costume === "astronaut" ? 0.8 : outfit.costume === "diver" ? 0.9 : 1;
    return costumeChanged;
  }

  setSlot(slot: Slot, outfit: Outfit): void {
    if (!this.outfit || this.outfit.costume !== "none") {
      const base = this.outfit ?? outfit;
      this.setOutfit({ ...base, [slot]: outfit[slot], costume: "none", mascot: null });
      return;
    }
    this.outfit = { ...this.outfit, [slot]: outfit[slot] };
    removeSlot(this.rig, this.slots.get(slot));
    this.slots.set(slot, buildSlot(this.rig, this.outfit, slot));
  }

  dispose(): void {
    for (const built of this.slots.values()) removeSlot(this.rig, built);
    this.slots.clear();
    this.rig.dispose();
    this.offset.removeFromParent();
  }
}

/**
 * Owns the Three.js renderer, lights, turntable, figures, props, effects and
 * the animation players. Presentation only: the director decides what to play.
 */
export class MannequinScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly turntable = new THREE.Group();
  readonly renderer: THREE.WebGLRenderer;

  private main: Figure;
  /** Battle line-up beyond the main figure (the main figure is always crew slot 0). */
  private extras: Figure[] = [];
  private canvas: HTMLCanvasElement;
  private effects: Effect[] = [];
  private textBand: TextBand;
  private laptopParts: Part[] = [];
  private laptopGroup: THREE.Group | null = null;
  private laptopScale = 0;
  private laptopTarget = 0;
  private manualPose: ResolvedPose | null = null;
  private raf = 0;
  private lastTime = 0;
  private clock = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private disposed = false;

  private spinSpeed = 0;
  private spinTarget = 0;
  private yaw = 0;
  private faceTween: { from: number; to: number; start: number; duration: number } | null = null;

  private ground: THREE.Mesh;
  private keyLight: THREE.DirectionalLight;
  private opts: SceneOptions;
  private resizeObserver: ResizeObserver | null = null;
  private halfWidth = 1.0;

  constructor(canvas: HTMLCanvasElement, opts: SceneOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    if (opts.background) this.renderer.setClearColor(new THREE.Color(opts.background), 1);
    else this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    this.keyLight.position.set(2.2, 4.5, 3.2);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.left = -2;
    this.keyLight.shadow.camera.right = 2;
    this.keyLight.shadow.camera.top = 2.5;
    this.keyLight.shadow.camera.bottom = -0.5;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 12;
    this.keyLight.shadow.radius = 4;
    const fill = new THREE.DirectionalLight(0x9ee7ff, 0.55);
    fill.position.set(-3, 1.5, -2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(0, 3, -4);
    this.scene.add(hemi, this.keyLight, fill, rim);

    this.ground = new THREE.Mesh(new THREE.CircleGeometry(1.8, 48), new THREE.ShadowMaterial({ opacity: 0.28 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0.001;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.main = new Figure(opts.mode);
    this.turntable.add(this.main.offset);
    this.scene.add(this.turntable);

    this.textBand = new TextBand(this.scene, ATTRACT_LINES[0], opts.mode);

    this.setMode(opts.mode);
    this.setPerformanceMode(Boolean(opts.performanceMode));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);

    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __auraScene?: MannequinScene }).__auraScene = this;
    }
  }

  /** All named animations (dev / pose editor). */
  readonly presets: Record<string, Animation> = { ...ANIMATION_PRESETS, ...COSTUME_ANIMATION_PRESETS };
  /** Outfit generator (dev / pose editor). */
  readonly generate = generateOutfit;

  get rig(): MannequinRig {
    return this.main.rig;
  }
  get player(): AnimationPlayer {
    return this.main.player;
  }
  get currentOutfit(): Outfit | null {
    return this.main.outfit;
  }
  /** Figures in the current line-up (1 = solo). */
  get crewSize(): number {
    return 1 + this.extras.length;
  }

  // ---------------------------------------------------------------- mode

  setMode(mode: RenderMode): void {
    this.main.rig.setMode(mode);
    for (const f of this.extras) f.rig.setMode(mode);
    this.textBand.setMode(mode);
    for (const e of this.effects) e.setMode(mode);
    this.ground.visible = mode === "solid";
    this.renderer.shadowMap.enabled = mode === "solid" && !this.opts.performanceMode;
    this.keyLight.castShadow = this.renderer.shadowMap.enabled;
    this.opts.mode = mode;
  }

  setPerformanceMode(on: boolean): void {
    this.opts.performanceMode = on;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, on ? 1 : MAX_DPR));
    this.renderer.shadowMap.enabled = this.opts.mode === "solid" && !on;
    this.keyLight.castShadow = this.renderer.shadowMap.enabled;
  }

  // ---------------------------------------------------------------- outfit

  /** Replace the whole outfit in one clean swap. */
  setOutfit(outfit: Outfit): void {
    if (this.main.setOutfit(outfit)) this.rebuildEffects(outfit);
    this.setFrameShift(outfit.costume === "astronaut" ? 0.16 : 0);
  }

  /** Replace one slot with the garment from `outfit` (slot-machine locking). */
  setSlot(slot: Slot, outfit: Outfit): void {
    this.main.setSlot(slot, outfit);
  }

  setSlotVisible(slot: Slot, visible: boolean): void {
    for (const part of this.main.slots.get(slot)?.parts ?? []) part.group.visible = visible;
  }

  /** Garment parts by slot (pose editor clipping check). */
  slotParts(slot: Slot | "costume"): Part[] {
    return this.main.slots.get(slot)?.parts ?? [];
  }

  private rebuildEffects(outfit: Outfit): void {
    for (const e of this.effects) e.dispose();
    this.effects = [];
    const mode = this.opts.mode;
    switch (outfit.costume) {
      case "diver":
        this.effects.push(new BubbleEffect(this.scene, mode), new FishSchoolEffect(this.scene, mode));
        break;
      case "astronaut":
        this.effects.push(new BlackHoleEffect(this.main.rig, mode));
        break;
      case "mascot":
        if (outfit.mascot === "frog") this.effects.push(new FrogTongueEffect(this.main.rig, mode));
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- crew (battles)

  /**
   * Battle line-up: one figure per player, left to right in slot order, each
   * wearing that player's outfit. The main figure is slot 0; extra figures
   * are created or removed to match. null (or one outfit) = the solo figure.
   */
  setCrew(outfits: Outfit[] | null): void {
    const n = outfits && outfits.length > 1 ? outfits.length : 1;
    while (this.extras.length > n - 1) this.extras.pop()!.dispose();
    while (this.extras.length < n - 1) {
      const f = new Figure(this.opts.mode);
      f.idleTarget = this.main.idleTarget;
      this.turntable.add(f.offset);
      this.extras.push(f);
    }
    const figures = [this.main, ...this.extras];
    figures.forEach((f, i) => {
      f.offset.position.x = (i - (n - 1) / 2) * CREW_SPACING;
    });
    if (outfits && outfits.length > 1) {
      figures.forEach((f, i) => {
        if (f.outfit?.seed !== outfits[i].seed) f.setOutfit(outfits[i]);
      });
    } else if (outfits?.length === 1 && this.main.outfit?.seed !== outfits[0].seed) {
      this.setOutfit(outfits[0]);
    }
    const halfWidth = n > 1 ? ((n - 1) / 2) * CREW_SPACING + CREW_MARGIN : 1.0;
    if (halfWidth !== this.halfWidth) {
      this.halfWidth = halfWidth;
      // Shadows (ground disc + shadow camera) cover the whole line-up.
      this.ground.scale.setScalar(Math.max(1, (halfWidth + 0.4) / 1.8));
      const cam = this.keyLight.shadow.camera;
      cam.left = -Math.max(2, halfWidth + 0.6);
      cam.right = Math.max(2, halfWidth + 0.6);
      cam.updateProjectionMatrix();
      this.resize();
    }
  }

  /**
   * Horizontal screen position (0-1 across the canvas) of every line-up
   * figure, so DOM overlays (stat rows) can sit exactly under each one.
   */
  crewScreenX(): number[] {
    const figures = [this.main, ...this.extras];
    const v = new THREE.Vector3();
    return figures.map((f) => {
      f.offset.getWorldPosition(v);
      v.project(this.camera);
      return (v.x + 1) / 2;
    });
  }

  /** Play an animation on one line-up figure (0 = the main figure). */
  playCrew(index: number, anim: Animation, blendMs = 200): void {
    const f = index === 0 ? this.main : this.extras[index - 1];
    f?.player.play(anim, blendMs);
  }

  // ---------------------------------------------------------------- props

  setLaptop(visible: boolean): void {
    this.laptopTarget = visible ? 1 : 0;
    if (visible && !this.laptopGroup) this.buildLaptop();
  }

  static readonly LAPTOP_POSITION: [number, number, number] = [0.02, -0.2, 0.31];

  private buildLaptop(): void {
    const P = this.main.rig.parts;
    const g = new THREE.Group();
    g.position.set(...MannequinScene.LAPTOP_POSITION);
    g.rotation.x = -0.12;
    g.scale.setScalar(0.001);
    this.main.rig.joints.chest.add(g);
    const add = (geo: THREE.BufferGeometry, color: string, opts: Parameters<typeof P.add>[3]) => this.laptopParts.push(P.add(geo, color, g, opts));
    const shell = "#d9d9d6";
    add(P.box(0.3, 0.014, 0.21, 0.006), shell, { material: FABRIC.plastic });
    add(P.box(0.25, 0.004, 0.1, 0.002), "#2a2a2a", { position: [0, 0.008, 0.03], noOutline: true, material: FABRIC.plastic });
    add(P.box(0.07, 0.003, 0.045, 0.002), "#bdbdba", { position: [0, 0.008, -0.07], noOutline: true, material: FABRIC.plastic });
    const screen = new THREE.Group();
    screen.position.set(0, 0.0, 0.105);
    screen.rotation.x = 0.32;
    g.add(screen);
    this.laptopParts.push(P.add(P.box(0.3, 0.2, 0.012, 0.006), shell, screen, { position: [0, 0.1, 0], material: FABRIC.plastic }));
    this.laptopParts.push(
      P.add(P.box(0.28, 0.18, 0.004, 0.002), "#0b1418", screen, {
        position: [0, 0.1, -0.007],
        noOutline: true,
        material: { roughness: 0.3, emissive: "#0d3340", pattern: { kind: "terminal", colorA: "#0b1418", colorB: "#9ee7ff" } },
      }),
    );
    this.laptopGroup = g;
  }

  // ---------------------------------------------------------------- motion

  play(anim: Animation, blendMs = 200): void {
    this.main.player.play(anim, blendMs);
  }

  /** Looping animation to return to after any one-shot finishes (null = hold). */
  setBaseAnimation(anim: Animation | null): void {
    this.main.baseAnim = anim;
    if (anim && this.main.player.isFinished) this.main.player.play(anim, 400);
  }

  /** Pose editor: drive the figure directly (null returns control to the player). */
  setManualPose(pose: Pose | null): void {
    this.manualPose = pose ? resolvePose(pose, this.manualPose ?? undefined) : null;
  }

  spin(speed: number): void {
    this.spinTarget = speed;
    this.faceTween = null;
  }

  /** Set the turntable angle directly (editor). */
  setYaw(radians: number): void {
    this.spinTarget = 0;
    this.spinSpeed = 0;
    this.faceTween = null;
    this.yaw = radians;
  }

  /**
   * Keep turning (same direction as the spin) until the figure faces the
   * viewer (yaw = 0 mod 2π). Already facing front: stays put.
   */
  faceFront(ms = 1000): void {
    const twoPi = Math.PI * 2;
    const current = ((this.yaw % twoPi) + twoPi) % twoPi;
    const remaining = current < 1e-3 || twoPi - current < 1e-3 ? 0 : twoPi - current;
    this.spinTarget = 0;
    this.spinSpeed = 0;
    if (remaining === 0) {
      this.faceTween = null;
      this.yaw = 0;
      return;
    }
    // A short remaining turn gets the quicker share of the time.
    this.faceTween = { from: this.yaw, to: this.yaw + remaining, start: this.clock, duration: Math.max(250, ms * (remaining / twoPi) * 1.6) };
  }

  setIdle(amount: number): void {
    this.main.idleTarget = amount;
    for (const f of this.extras) f.idleTarget = amount;
  }

  setTextBand(visible: boolean, speed = 0.35): void {
    this.textBand.setVisible(visible, speed);
  }

  get yawRadians(): number {
    return this.yaw;
  }

  /** Snapshot of the current frame (certificate line art). */
  snapshot(type = "image/png"): string {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL(type);
  }

  // ---------------------------------------------------------------- loop

  private tick = (now: number): void => {
    if (this.disposed) return;
    const dt = Math.min(50, now - this.lastTime);
    this.lastTime = now;
    this.clock += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1000) {
      this.opts.onFps?.(Math.round((this.fpsFrames * 1000) / this.fpsTime));
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private updateFigure(f: Figure, dt: number, t: number, manual: ResolvedPose | null): void {
    if (f.baseAnim && f.player.isFinished && f.player.animationName !== f.baseAnim.name) f.player.play(f.baseAnim, 450);
    const pose = manual ?? f.player.update(dt);
    f.idleAmount += (f.idleTarget - f.idleAmount) * Math.min(1, dt / 500);
    const idle = manual ? 0 : f.idleAmount;
    f.rig.applyPose(idle > 0.001 ? this.withIdle(pose, t, idle) : pose);
  }

  private update(dt: number): void {
    const t = this.clock / 1000;

    if (this.faceTween) {
      const k = Math.min(1, (this.clock - this.faceTween.start) / this.faceTween.duration);
      const e = 1 - Math.pow(1 - k, 3);
      this.yaw = this.faceTween.from + (this.faceTween.to - this.faceTween.from) * e;
      if (k >= 1) {
        this.faceTween = null;
        this.yaw = 0;
      }
    } else {
      this.spinSpeed += (this.spinTarget - this.spinSpeed) * Math.min(1, dt / 400);
      this.yaw += (this.spinSpeed * dt) / 1000;
    }
    this.turntable.rotation.y = this.yaw;

    this.updateFigure(this.main, dt, t, this.manualPose);
    this.extras.forEach((f, i) => this.updateFigure(f, dt, t + 1.7 * (i + 1), null));

    if (this.laptopGroup) {
      this.laptopScale += (this.laptopTarget - this.laptopScale) * Math.min(1, dt / 160);
      const s = Math.max(0.001, this.laptopScale);
      this.laptopGroup.scale.setScalar(s);
      this.laptopGroup.visible = s > 0.01;
    }

    const ctx = { dtMs: dt, clockMs: this.clock, rig: this.main.rig, animTimeMs: this.main.player.loopTimeMs };
    for (const e of this.effects) e.update(ctx);
    this.textBand.update(dt);
  }

  private withIdle(pose: ResolvedPose, t: number, amount: number): ResolvedPose {
    const breathe = Math.sin(t * 1.9) * amount;
    const sway = Math.sin(t * 0.7) * amount;
    const j = { ...pose.joints };
    const add = (name: keyof typeof j, d: [number, number, number]) => {
      const r = j[name];
      j[name] = [r[0] + d[0], r[1] + d[1], r[2] + d[2]];
    };
    add("chest", [-breathe * 1.6, 0, 0]);
    add("hips", [0, 0, sway * 1.2]);
    add("spine", [0, 0, -sway * 0.9]);
    add("head", [breathe * 0.8, Math.sin(t * 0.45) * 4 * amount, sway * 1.4]);
    add("shoulderL", [0, 0, breathe * 1.2]);
    add("shoulderR", [0, 0, -breathe * 1.2]);
    return { ...pose, joints: j, root: [pose.root[0], pose.root[1] + breathe * 0.004, pose.root[2]] };
  }

  // ---------------------------------------------------------------- sizing

  /** Margin above the head for hats and raised arms; identical for every outfit. */
  private static readonly HEADROOM = 0.12;
  /**
   * Share of the solo side-to-side margin kept when framing (1 = full arm span
   * plus the text band). Tall narrow canvases (the mirror panel) lower it so
   * the figure is framed by height and fills the canvas; battles always keep
   * the full width so both figures fit.
   */
  private widthFraming = 1;

  setWidthFraming(value: number): void {
    const v = Math.max(0.3, Math.min(1, value));
    if (v === this.widthFraming) return;
    this.widthFraming = v;
    this.resize();
  }
  /** Vertical framing shift: the floating astronaut is framed higher at the same size. */
  private frameShift = 0;

  private setFrameShift(value: number): void {
    if (value === this.frameShift) return;
    this.frameShift = value;
    this.resize();
  }

  resize(): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const halfFov = (this.camera.fov / 2) * (Math.PI / 180);
    const top = FIGURE_TOP + MannequinScene.HEADROOM;
    const halfHeight = (top - FIGURE_BOTTOM) / 2;
    const distH = halfHeight / Math.tan(halfFov);
    const halfWidth = this.extras.length > 0 ? this.halfWidth : this.halfWidth * this.widthFraming;
    const distW = halfWidth / (Math.tan(halfFov) * aspect);
    const dist = Math.max(distH, distW) * 1.04;
    const centerY = (top + FIGURE_BOTTOM) / 2 + this.frameShift;
    this.camera.position.set(0, centerY + 0.15, dist);
    this.camera.lookAt(0, centerY, 0);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    for (const e of this.effects) e.dispose();
    this.effects = [];
    for (const part of this.laptopParts) this.main.rig.parts.remove(part);
    this.laptopGroup?.removeFromParent();
    this.textBand.dispose();
    for (const f of this.extras) f.dispose();
    this.extras = [];
    this.main.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
