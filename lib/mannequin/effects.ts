import * as THREE from "three";
import { FROG_LOOP_MS, FROG_TONGUE_AT_MS } from "@/lib/costumePoses";
import type { RenderMode } from "./parts";
import type { MannequinRig } from "./rig";

const CYAN = "#9ee7ff";

export interface EffectContext {
  dtMs: number;
  clockMs: number;
  rig: MannequinRig;
  /** Milliseconds since the current animation loop started (for syncing). */
  animTimeMs: number;
}

export interface Effect {
  update(ctx: EffectContext): void;
  setMode(mode: RenderMode): void;
  dispose(): void;
}

function basic(color: string, opts: Partial<THREE.MeshBasicMaterialParameters> = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

// ---------------------------------------------------------------- black hole

/** A small black hole hovering over the astronaut's raised palm. */
export class BlackHoleEffect implements Effect {
  private group = new THREE.Group();
  private disk: THREE.Mesh;
  private disk2: THREE.Mesh;
  private ring: THREE.Mesh;
  private core: THREE.Mesh;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mode: RenderMode;
  private diskTexture: THREE.CanvasTexture;

  constructor(rig: MannequinRig, mode: RenderMode) {
    this.mode = mode;
    // Hovers just off the palm, on the palm side of the left wrist.
    this.group.position.set(0.0, -0.07, 0.14);
    rig.joints.wristL.add(this.group);

    const coreGeo = new THREE.SphereGeometry(0.055, 32, 24);
    const ringGeo = new THREE.TorusGeometry(0.066, 0.005, 12, 64);
    const diskGeo = new THREE.RingGeometry(0.07, 0.19, 64);
    this.geos.push(coreGeo, ringGeo, diskGeo);

    this.diskTexture = BlackHoleEffect.diskTexture();
    const coreMat = basic("#000000");
    const ringMat = basic("#fff2d0");
    const diskMat = new THREE.MeshBasicMaterial({ map: this.diskTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const disk2Mat = new THREE.MeshBasicMaterial({ map: this.diskTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.6 });
    this.mats.push(coreMat, ringMat, diskMat, disk2Mat);

    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.disk = new THREE.Mesh(diskGeo, diskMat);
    this.disk2 = new THREE.Mesh(diskGeo, disk2Mat);
    this.disk.rotation.x = Math.PI / 2 - 0.5;
    this.disk2.rotation.x = Math.PI / 2 - 0.5;
    this.disk2.rotation.z = 0.8;
    this.disk2.scale.setScalar(0.82);
    this.ring.rotation.x = 0.4;
    this.group.add(this.core, this.ring, this.disk, this.disk2);
    this.setMode(mode);
  }

  private static diskTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.27, size / 2, size / 2, size * 0.5);
    g.addColorStop(0, "rgba(255, 244, 214, 1)");
    g.addColorStop(0.18, "rgba(255, 170, 60, 0.95)");
    g.addColorStop(0.5, "rgba(210, 80, 20, 0.55)");
    g.addColorStop(1, "rgba(120, 30, 60, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // streaks
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2);
      ctx.lineTo(size / 2 + Math.cos(a) * size, size / 2 + Math.sin(a) * size);
      ctx.lineWidth = 1 + (i % 3);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  update(ctx: EffectContext): void {
    const t = ctx.clockMs / 1000;
    this.disk.rotation.z += ctx.dtMs * 0.0022;
    this.disk2.rotation.z -= ctx.dtMs * 0.0016;
    this.ring.rotation.y += ctx.dtMs * 0.001;
    this.group.position.y = -0.07 + Math.sin(t * 2.2) * 0.012;
    const pulse = 1 + Math.sin(t * 3.1) * 0.04;
    this.core.scale.setScalar(pulse);
  }

  setMode(mode: RenderMode): void {
    this.mode = mode;
    const edges = mode === "edges";
    (this.ring.material as THREE.MeshBasicMaterial).color.set(edges ? CYAN : "#fff2d0");
    (this.disk.material as THREE.MeshBasicMaterial).wireframe = edges;
    (this.disk2.material as THREE.MeshBasicMaterial).wireframe = edges;
    (this.disk.material as THREE.MeshBasicMaterial).color.set(edges ? CYAN : "#ffffff");
    (this.disk2.material as THREE.MeshBasicMaterial).color.set(edges ? CYAN : "#ffffff");
    (this.disk.material as THREE.MeshBasicMaterial).map = edges ? null : this.diskTexture;
    (this.disk2.material as THREE.MeshBasicMaterial).map = edges ? null : this.diskTexture;
    (this.disk.material as THREE.MeshBasicMaterial).needsUpdate = true;
    (this.disk2.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
    this.diskTexture.dispose();
  }
}

// ---------------------------------------------------------------- fish school

interface Fish {
  mesh: THREE.Group;
  speed: number;
  yBase: number;
  zBase: number;
  phase: number;
  amp: number;
  tail: THREE.Mesh;
}

/**
 * A school of fish swims in from the left of the screen, weaves around the
 * diver at different depths and heights, and leaves on the right.
 */
export class FishSchoolEffect implements Effect {
  private group = new THREE.Group();
  private fish: Fish[] = [];
  private bodyGeo = new THREE.SphereGeometry(1, 14, 10);
  private tailGeo = new THREE.ConeGeometry(1, 1, 3);
  private finGeo = new THREE.ConeGeometry(1, 1, 3);
  private mats: THREE.MeshStandardMaterial[] = [];
  private mode: RenderMode;
  private readonly enterX = -1.9;
  private readonly exitX = 1.9;

  constructor(scene: THREE.Scene, mode: RenderMode) {
    this.mode = mode;
    scene.add(this.group);
    const palette = ["#7fb3d5", "#a9c9e0", "#5d8aa8", "#c0d6df", "#8fa9bd"];
    for (let i = 0; i < 16; i++) {
      const color = palette[i % palette.length];
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.35 });
      this.mats.push(mat);
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.bodyGeo, mat);
      body.scale.set(0.075, 0.04, 0.028);
      const tail = new THREE.Mesh(this.tailGeo, mat);
      tail.scale.set(0.04, 0.05, 0.008);
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.09;
      const fin = new THREE.Mesh(this.finGeo, mat);
      fin.scale.set(0.02, 0.032, 0.007);
      fin.position.set(0.0, 0.042, 0);
      g.add(body, tail, fin);
      const lane = i / 16;
      const fish: Fish = {
        mesh: g,
        speed: 0.42 + Math.random() * 0.25,
        yBase: 0.55 + lane * 1.05 + (Math.random() - 0.5) * 0.15,
        zBase: (Math.random() - 0.35) * 0.9,
        phase: Math.random() * Math.PI * 2,
        amp: 0.05 + Math.random() * 0.06,
        tail,
      };
      // Start spread across the whole path so some are already passing by.
      g.position.set(this.enterX + Math.random() * (this.exitX - this.enterX), fish.yBase, fish.zBase);
      this.group.add(g);
      this.fish.push(fish);
    }
    this.setMode(mode);
  }

  update(ctx: EffectContext): void {
    const dt = ctx.dtMs / 1000;
    const t = ctx.clockMs / 1000;
    for (const f of this.fish) {
      f.mesh.position.x += f.speed * dt;
      // weave around the figure: swing toward the camera in the middle
      const mid = 1 - Math.min(1, Math.abs(f.mesh.position.x) / 0.8);
      f.mesh.position.y = f.yBase + Math.sin(t * 2.4 + f.phase) * f.amp;
      f.mesh.position.z = f.zBase + mid * 0.35 * Math.sign(f.zBase || 1);
      f.mesh.rotation.y = Math.sin(t * 2 + f.phase) * 0.25;
      f.mesh.rotation.z = Math.sin(t * 2.4 + f.phase) * 0.15;
      f.tail.rotation.y = Math.sin(t * 9 + f.phase) * 0.55;
      if (f.mesh.position.x > this.exitX) {
        f.mesh.position.x = this.enterX - Math.random() * 1.5;
        f.zBase = (Math.random() - 0.35) * 0.9;
      }
    }
  }

  setMode(mode: RenderMode): void {
    this.mode = mode;
    for (const m of this.mats) {
      m.wireframe = mode === "edges";
      if (mode === "edges") m.emissive = new THREE.Color(CYAN);
      else m.emissive = new THREE.Color(0x000000);
      m.color.set(mode === "edges" ? CYAN : m.userData.base ?? m.color.getHexString());
      m.userData.base ??= `#${m.color.getHexString()}`;
      m.needsUpdate = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of this.mats) m.dispose();
    this.bodyGeo.dispose();
    this.tailGeo.dispose();
    this.finGeo.dispose();
  }
}

// ---------------------------------------------------------------- frog tongue + fly

/** A fly buzzes in front of the frog; on the beat the tongue shoots out and eats it. */
export class FrogTongueEffect implements Effect {
  private tongue: THREE.Mesh;
  private fly: THREE.Group;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mouth = new THREE.Group();
  private flyHome = new THREE.Vector3(0.1, 0.02, 0.5);
  private eatenUntil = 0;
  private mode: RenderMode;
  private static SNAP_MS = 130;
  private static HOLD_MS = 90;
  private static RETRACT_MS = 220;

  constructor(rig: MannequinRig, mode: RenderMode) {
    this.mode = mode;
    // Mouth sits at the front of the frog head.
    this.mouth.position.set(0, 0.06, 0.2);
    rig.joints.head.add(this.mouth);

    const tongueGeo = new THREE.CylinderGeometry(0.014, 0.02, 1, 10);
    tongueGeo.translate(0, 0.5, 0);
    tongueGeo.rotateX(Math.PI / 2); // along +Z
    const tipGeo = new THREE.SphereGeometry(0.022, 12, 10);
    const flyBody = new THREE.SphereGeometry(0.022, 10, 8);
    const wingGeo = new THREE.CircleGeometry(0.022, 10);
    this.geos.push(tongueGeo, tipGeo, flyBody, wingGeo);

    const tongueMat = new THREE.MeshStandardMaterial({ color: "#ff6b8a", roughness: 0.5 });
    const flyMat = new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.6 });
    const wingMat = new THREE.MeshBasicMaterial({ color: "#dfe9f2", transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    this.mats.push(tongueMat, flyMat, wingMat);

    this.tongue = new THREE.Mesh(tongueGeo, tongueMat);
    const tip = new THREE.Mesh(tipGeo, tongueMat);
    tip.position.z = 1; // scaled with the tongue
    this.tongue.add(tip);
    this.tongue.scale.z = 0.001;
    this.mouth.add(this.tongue);

    this.fly = new THREE.Group();
    const body = new THREE.Mesh(flyBody, flyMat);
    const w1 = new THREE.Mesh(wingGeo, wingMat);
    const w2 = new THREE.Mesh(wingGeo, wingMat);
    w1.position.set(0.02, 0.016, 0);
    w2.position.set(-0.02, 0.016, 0);
    w1.rotation.x = w2.rotation.x = -Math.PI / 2;
    this.fly.add(body, w1, w2);
    this.fly.position.copy(this.flyHome);
    this.mouth.add(this.fly);
    this.setMode(mode);
  }

  update(ctx: EffectContext): void {
    const t = ctx.clockMs / 1000;
    const loop = ((ctx.animTimeMs % FROG_LOOP_MS) + FROG_LOOP_MS) % FROG_LOOP_MS;
    const since = loop - FROG_TONGUE_AT_MS;
    const snap = FrogTongueEffect.SNAP_MS;
    const hold = FrogTongueEffect.HOLD_MS;
    const retract = FrogTongueEffect.RETRACT_MS;

    // Fly buzzes around its home point until it gets eaten.
    const alive = ctx.clockMs > this.eatenUntil;
    this.fly.visible = alive;
    if (alive) {
      this.fly.position.set(
        this.flyHome.x + Math.sin(t * 7.3) * 0.06,
        this.flyHome.y + Math.sin(t * 9.1) * 0.04,
        this.flyHome.z + Math.cos(t * 5.7) * 0.05,
      );
      this.fly.rotation.y = Math.sin(t * 3) * 0.6;
      const flap = 0.4 + Math.abs(Math.sin(t * 60)) * 0.8;
      this.fly.children[1].scale.setScalar(flap);
      this.fly.children[2].scale.setScalar(flap);
    }

    let length = 0;
    if (since >= 0 && since < snap) {
      length = since / snap;
    } else if (since >= snap && since < snap + hold) {
      length = 1;
      if (alive) this.eatenUntil = ctx.clockMs + 2600;
    } else if (since >= snap + hold && since < snap + hold + retract) {
      length = 1 - (since - snap - hold) / retract;
    }
    // Aim the tongue at the fly and stretch it there.
    const reach = this.fly.position.length() || 0.5;
    this.tongue.lookAt(this.fly.position.clone().add(this.mouth.position).sub(this.mouth.position));
    this.tongue.scale.set(1, 1, Math.max(0.001, length * reach));
  }

  setMode(mode: RenderMode): void {
    this.mode = mode;
    const edges = mode === "edges";
    for (const m of this.mats) {
      if ("wireframe" in m) (m as THREE.MeshStandardMaterial).wireframe = edges;
      if ("color" in m) (m as THREE.MeshStandardMaterial).color.set(edges ? CYAN : (m.userData.base ??= `#${(m as THREE.MeshStandardMaterial).color.getHexString()}`));
      m.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mouth.removeFromParent();
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
  }
}
