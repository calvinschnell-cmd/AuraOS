import * as THREE from "three";
import { JOINT_NAMES, type HandPose, type JointName } from "@/lib/poses";
import type { ResolvedPose } from "./animation";
import { DIMS, SKIN_COLOR } from "./dims";
import { PartRegistry, type RenderMode } from "./parts";

const DEG = Math.PI / 180;

/** Limb radii. Segments that meet at a joint share its radius exactly. */
const R = {
  shoulder: 0.054,
  elbow: 0.044,
  wrist: DIMS.wristR,
  hip: 0.082,
  knee: 0.062,
  ankle: 0.048,
};

interface FingerRig {
  knuckle: THREE.Group;
  /** Spread direction/amount in degrees when the hand opens. */
  spread: number;
  index: number;
}

export interface HandRig {
  wrist: THREE.Group;
  /** Twists so palms face the camera for peace signs and waves. */
  hand: THREE.Group;
  fingers: FingerRig[]; // index, middle, ring, pinky
  thumb: THREE.Group;
}

/**
 * Original stylized mannequin built from smooth primitives with hierarchical
 * joints. Limbs are single tapered shapes that share the joint radius so no
 * ball joints or steps show; the torso is one continuous shell.
 * `joints` are the attachment points garments parent to.
 */
export class MannequinRig {
  readonly root = new THREE.Group();
  readonly joints: Record<JointName, THREE.Group>;
  readonly hands: { L: HandRig; R: HandRig };
  readonly parts: PartRegistry;

  constructor(mode: RenderMode) {
    this.parts = new PartRegistry(mode);
    const J = {} as Record<JointName, THREE.Group>;
    for (const name of JOINT_NAMES) {
      J[name] = new THREE.Group();
      J[name].name = name;
      J[name].rotation.order = "ZYX";
    }
    this.joints = J;
    const D = DIMS;

    // ---- hierarchy
    this.root.add(J.hips);
    J.hips.position.set(0, D.hipsY, 0);
    J.hips.add(J.spine);
    J.spine.position.set(0, D.spineUp, 0);
    J.spine.add(J.chest);
    J.chest.position.set(0, D.chestUp, 0);
    J.chest.add(J.neck);
    J.neck.position.set(0, D.neckUp, 0);
    J.neck.add(J.head);
    J.head.position.set(0, D.headUp, 0);

    for (const side of ["L", "R"] as const) {
      const s = side === "L" ? 1 : -1;
      const shoulder = J[`shoulder${side}`];
      const elbow = J[`elbow${side}`];
      const wrist = J[`wrist${side}`];
      J.chest.add(shoulder);
      shoulder.position.set(s * D.shoulderX, D.shoulderY, 0);
      shoulder.add(elbow);
      elbow.position.set(0, -D.upperArmL, 0);
      elbow.add(wrist);
      wrist.position.set(0, -D.forearmL, 0);

      const hip = J[`hip${side}`];
      const knee = J[`knee${side}`];
      const ankle = J[`ankle${side}`];
      J.hips.add(hip);
      hip.position.set(s * D.hipX, D.hipY, 0);
      hip.add(knee);
      knee.position.set(0, -D.thighL, 0);
      knee.add(ankle);
      ankle.position.set(0, -D.shinL, 0);
    }

    // ---- body meshes
    const P = this.parts;
    const skin = SKIN_COLOR;
    const skinMat = { roughness: 0.75 };
    P.add(P.sphere(D.headR), skin, J.head, { position: [0, D.headR * 0.72, 0], material: skinMat });
    P.add(
      P.lathe([
        [0.052, -0.04],
        [0.047, 0.03],
        [0.05, 0.08],
        [0.06, 0.12],
      ]),
      skin,
      J.neck,
      { material: skinMat, doubleSide: true },
    );
    // One continuous torso from the hips to the shoulders (chest-local Y).
    P.add(
      P.lathe([
        [0.0, -0.445],
        [0.09, -0.435],
        [0.145, -0.405],
        [0.166, -0.34],
        [0.163, -0.24],
        [0.158, -0.16],
        [0.168, -0.06],
        [0.178, 0.03],
        [0.182, 0.1],
        [0.172, 0.15],
        [0.13, 0.19],
        [0.07, 0.215],
        [0.0, 0.222],
      ]),
      skin,
      J.chest,
      { scale: [1, 1, 0.72], material: skinMat },
    );

    for (const side of ["L", "R"] as const) {
      P.add(P.limb(R.shoulder, R.elbow, D.upperArmL), skin, J[`shoulder${side}`], { material: skinMat });
      P.add(P.limb(R.elbow, R.wrist, D.forearmL), skin, J[`elbow${side}`], { material: skinMat });
      P.add(P.limb(R.hip, R.knee, D.thighL), skin, J[`hip${side}`], { material: skinMat });
      P.add(P.limb(R.knee, R.ankle, D.shinL), skin, J[`knee${side}`], { material: skinMat });
      P.add(P.box(...D.foot, 0.03), skin, J[`ankle${side}`], { position: D.footOffset, material: skinMat, thinOutline: true });
    }

    this.hands = { L: this.buildHand("L"), R: this.buildHand("R") };
  }

  /**
   * Hands hang with the palm facing the legs (palm normal is -X for the left
   * hand, +X for the right). Fingers run along Z, the thumb sits on the front
   * edge and points forward.
   */
  private buildHand(side: "L" | "R"): HandRig {
    const D = DIMS;
    const P = this.parts;
    const s = side === "L" ? 1 : -1;
    const wrist = this.joints[`wrist${side}`];
    const hand = new THREE.Group();
    hand.name = `hand${side}`;
    wrist.add(hand);
    P.add(P.box(...D.palm, 0.012), SKIN_COLOR, hand, { position: [0, -D.palmDrop, 0], thinOutline: true });

    // index .. pinky from the front (thumb side) to the back
    const offsets = [1.5, 0.5, -0.5, -1.5];
    const fingers: FingerRig[] = offsets.map((k, i) => {
      const knuckle = new THREE.Group();
      knuckle.position.set(0, -D.knuckleDrop, k * D.fingerSpacing);
      hand.add(knuckle);
      const len = i === 3 ? D.fingerL * 0.78 : i === 1 ? D.fingerL * 1.08 : i === 2 ? D.fingerL * 0.98 : D.fingerL;
      P.add(P.capsule(D.fingerR, len), SKIN_COLOR, knuckle, { position: [0, -len / 2 - D.fingerR * 0.5, 0], thinOutline: true });
      return { knuckle, spread: k * 6, index: i };
    });

    const thumb = new THREE.Group();
    thumb.position.set(-s * 0.004, -D.palmDrop + 0.012, D.palm[2] / 2 + 0.004);
    hand.add(thumb);
    P.add(P.capsule(D.thumbR, D.thumbL), SKIN_COLOR, thumb, { position: [0, -D.thumbL / 2 - D.thumbR * 0.5, 0], thinOutline: true });

    const rig: HandRig = { wrist, hand, fingers, thumb };
    return rig;
  }

  private applyHand(side: "L" | "R", pose: HandPose): void {
    const hand = this.hands?.[side];
    if (!hand) return;
    const s = side === "L" ? 1 : -1;
    const showing = Math.max(pose.peace, pose.open);

    // Palms turn to face the camera when the hand is presenting something.
    const twist = Math.max(0, Math.min(1, (showing - 0.45) / 0.4));
    hand.hand.rotation.set(0, s * 90 * DEG * twist, 0);

    for (const f of hand.fingers) {
      const isPeaceFinger = f.index < 2;
      const ext = isPeaceFinger ? showing : pose.open;
      const curl = (1 - ext) * 92;
      // Curl toward the palm face (+/-X); spread fans along Z.
      let spread = -f.spread * pose.open;
      if (isPeaceFinger && pose.peace > pose.open) spread = f.index === 0 ? -14 * pose.peace : 14 * pose.peace;
      f.knuckle.rotation.set(spread * DEG, 0, -s * curl * DEG);
    }
    const thumbExt = Math.max(pose.thumb, pose.open);
    // Curled: folded across the palm. Extended: pointing forward and out.
    const tx = -25 - thumbExt * 40;
    const tz = -s * (75 - thumbExt * 63);
    hand.thumb.rotation.set(tx * DEG, 0, tz * DEG);
  }

  applyPose(pose: ResolvedPose): void {
    for (const name of JOINT_NAMES) {
      const r = pose.joints[name];
      this.joints[name].rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
    }
    this.root.position.set(pose.root[0], pose.root[1], pose.root[2]);
    this.root.rotation.y = pose.yaw * DEG;
    this.applyHand("L", pose.hands.L);
    this.applyHand("R", pose.hands.R);
  }

  setMode(mode: RenderMode): void {
    this.parts.setMode(mode);
  }

  dispose(): void {
    this.parts.dispose();
    this.root.removeFromParent();
  }
}
