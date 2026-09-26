import * as THREE from "three";
import { DIVER_VALVE_OFFSET } from "@/lib/clothing/costumes";
import type { Effect, EffectContext } from "./effects";
import type { RenderMode } from "./parts";

interface Bubble {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  age: number;
  life: number;
  vy: number;
  wobble: number;
  phase: number;
  size: number;
}

const MAX_BUBBLES = 18;
const SPAWN_EVERY_MS = 230;

/** Rising, wobbling bubbles from the diving helmet valve. Lives in world space. */
export class BubbleEffect implements Effect {
  readonly group = new THREE.Group();
  private bubbles: Bubble[] = [];
  private geometry = new THREE.SphereGeometry(1, 12, 10);
  private sinceSpawn = 0;
  private origin = new THREE.Vector3();
  private mode: RenderMode;

  constructor(scene: THREE.Scene, mode: RenderMode) {
    this.mode = mode;
    scene.add(this.group);
  }

  setMode(mode: RenderMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const b of this.bubbles) {
      b.material.dispose();
      b.material = this.makeMaterial();
      b.mesh.material = b.material;
    }
  }

  private makeMaterial(): Bubble["material"] {
    if (this.mode === "edges") {
      return new THREE.MeshBasicMaterial({ color: "#9ee7ff", wireframe: true, transparent: true, opacity: 0.9 });
    }
    return new THREE.MeshStandardMaterial({ color: "#eaf7ff", transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1 });
  }

  update(ctx: EffectContext): void {
    const head = ctx.rig.joints.head;
    head.updateWorldMatrix(true, false);
    this.origin.set(...DIVER_VALVE_OFFSET);
    head.localToWorld(this.origin);

    this.sinceSpawn += ctx.dtMs;
    if (this.sinceSpawn >= SPAWN_EVERY_MS && this.bubbles.length < MAX_BUBBLES) {
      this.sinceSpawn = 0;
      this.spawn(this.origin);
    }
    const dt = ctx.dtMs / 1000;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.age += ctx.dtMs;
      const k = b.age / b.life;
      if (k >= 1) {
        this.group.remove(b.mesh);
        b.material.dispose();
        this.bubbles.splice(i, 1);
        continue;
      }
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.x += Math.sin((b.age / 1000) * 6 + b.phase) * b.wobble * dt;
      const s = b.size * (0.6 + k * 0.9);
      b.mesh.scale.setScalar(s);
      b.material.opacity = (this.mode === "edges" ? 0.9 : 0.55) * (1 - k * k);
    }
  }

  private spawn(origin: THREE.Vector3): void {
    const material = this.makeMaterial();
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.position.copy(origin);
    mesh.position.x += (Math.random() - 0.5) * 0.04;
    mesh.position.z += (Math.random() - 0.5) * 0.04;
    this.group.add(mesh);
    this.bubbles.push({
      mesh,
      material,
      age: 0,
      life: 1500 + Math.random() * 900,
      vy: 0.28 + Math.random() * 0.2,
      wobble: 0.15 + Math.random() * 0.1,
      phase: Math.random() * Math.PI * 2,
      size: 0.022 + Math.random() * 0.03,
    });
  }

  dispose(): void {
    for (const b of this.bubbles) {
      this.group.remove(b.mesh);
      b.material.dispose();
    }
    this.bubbles = [];
    this.geometry.dispose();
    this.group.removeFromParent();
  }
}
