import * as THREE from "three";
import type { RenderMode } from "./parts";

const CYAN = "#9ee7ff";

/**
 * A ring of text orbiting the mannequin ("WAVE IF YOU THINK YOUR FIT HAS
 * AURA"). Two cylinders: the front half reads normally, the back half is
 * drawn inside-out with a mirrored texture so its letters read correctly too.
 */
export class TextBand {
  readonly group = new THREE.Group();
  private front: THREE.Mesh;
  private back: THREE.Mesh;
  private texture: THREE.CanvasTexture;
  private mirrored: THREE.CanvasTexture;
  private geometry: THREE.CylinderGeometry;
  private mats: THREE.MeshBasicMaterial[];
  private speed = 0.35;
  private targetOpacity = 0;
  private opacity = 0;

  constructor(scene: THREE.Scene, text: string, mode: RenderMode) {
    const radius = 0.78;
    const height = 0.17;
    this.geometry = new THREE.CylinderGeometry(radius, radius, height, 96, 1, true);
    this.texture = TextBand.makeTexture(text);
    this.mirrored = this.texture.clone();
    this.mirrored.repeat.x = -1;
    this.mirrored.offset.x = 1;
    this.mirrored.needsUpdate = true;
    const front = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.FrontSide, depthWrite: false, opacity: 0 });
    const back = new THREE.MeshBasicMaterial({ map: this.mirrored, transparent: true, side: THREE.BackSide, depthWrite: false, opacity: 0 });
    this.mats = [front, back];
    this.front = new THREE.Mesh(this.geometry, front);
    this.back = new THREE.Mesh(this.geometry, back);
    this.group.add(this.front, this.back);
    this.group.position.y = 1.02;
    this.group.rotation.x = 0.12;
    this.group.renderOrder = 5;
    scene.add(this.group);
    this.setMode(mode);
  }

  private static makeTexture(text: string): THREE.CanvasTexture {
    const w = 2048;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-silkscreen").trim() || "monospace";
    ctx.font = `700 54px ${family}, monospace`;
    ctx.fillStyle = CYAN;
    ctx.textBaseline = "middle";
    const label = `${text}   ✦   `;
    const width = ctx.measureText(label).width || 800;
    const copies = Math.max(1, Math.floor(w / width));
    const step = w / copies;
    for (let i = 0; i < copies; i++) ctx.fillText(label, i * step, h / 2 + 2);
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  setVisible(visible: boolean, speed = 0.35): void {
    this.targetOpacity = visible ? 1 : 0;
    this.speed = speed;
  }

  setMode(mode: RenderMode): void {
    // Cyan in both modes: it is a UI accent, not a surface.
    for (const m of this.mats) m.color.set(mode === "edges" ? CYAN : "#ffffff");
  }

  update(dtMs: number): void {
    this.opacity += (this.targetOpacity - this.opacity) * Math.min(1, dtMs / 350);
    const o = this.opacity;
    this.front.visible = this.back.visible = o > 0.01;
    this.mats[0].opacity = o;
    this.mats[1].opacity = o * 0.55;
    this.group.rotation.y -= (this.speed * dtMs) / 1000;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.texture.dispose();
    this.mirrored.dispose();
    for (const m of this.mats) m.dispose();
  }
}
