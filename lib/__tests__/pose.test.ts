import { describe, expect, it } from "vitest";
import { predictArchetype, predictFeatures, softmax, type PoseModel } from "@/lib/pose/classifier";
import { FEATURE_NAMES, dynamismSignals, jointAngle, photoPose, poseFeatures, powerPose } from "@/lib/pose/features";
import { LANDMARK_COUNT, compactSnapshot, isPoseSnapshot, mirrorSnapshot, snapshotFromMediapipe, type PoseSnapshot } from "@/lib/pose/landmarks";
import { POSE_MODEL, modelMatchesFeatures } from "@/lib/pose/model";
import { NO_POSE_SCORE, POSE_AURA_PER_POINT, POSE_NEUTRAL, describePose, dynamism, poseAura, scorePose } from "@/lib/pose/score";
import { MOCK_POSES, jitteredSnapshot, mockPoseFor, skeletonSnapshot } from "@/lib/pose/synthetic";
import { applyStandardizer, fitStandardizer, forward, metrics, stratifiedFolds, trainNetwork } from "@/lib/pose/train";

const shifted = (s: PoseSnapshot, dx: number, dy: number, k: number): PoseSnapshot => ({
  aspect: s.aspect,
  landmarks: s.landmarks.map(([x, y, z, v]) => [0.5 + (x - 0.5) * k + dx, 0.5 + (y - 0.5) * k + dy, z, v]),
});

describe("pose features", () => {
  const hero = skeletonSnapshot(MOCK_POSES.hero);

  it("measures joint angles", () => {
    expect(jointAngle({ x: 0, y: -1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(Math.PI / 2);
    expect(jointAngle({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(Math.PI);
  });

  it("does not care where the person stands or how close they are", () => {
    const a = poseFeatures(hero);
    const b = poseFeatures(shifted(hero, 0.07, -0.03, 0.7));
    expect(a).toHaveLength(FEATURE_NAMES.length);
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 4));
  });

  it("mirrors anatomically (left/right swap, x flip) and back", () => {
    const m = mirrorSnapshot(mirrorSnapshot(hero));
    m.landmarks.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(hero.landmarks[i][0], 9);
      expect(y).toBeCloseTo(hero.landmarks[i][1], 9);
    });
    // A symmetric pose looks the same in the mirror.
    const sym = skeletonSnapshot(MOCK_POSES.standing);
    const f = poseFeatures(sym);
    poseFeatures(mirrorSnapshot(sym)).forEach((v, i) => expect(v).toBeCloseTo(f[i], 6));
  });

  it("reads a stiff standing photo as low-energy and a dynamic pose as high", () => {
    const stiff = dynamism(dynamismSignals(skeletonSnapshot(MOCK_POSES.standing)));
    for (const name of ["hero", "action", "dance", "fighter"] as const) {
      expect(dynamism(dynamismSignals(skeletonSnapshot(MOCK_POSES[name])))).toBeGreaterThan(stiff + 0.1);
    }
    const s = dynamismSignals(skeletonSnapshot(MOCK_POSES.dance));
    expect(s.armRaise).toBeGreaterThan(0.8);
  });

  it("validates and converts landmark payloads", () => {
    expect(isPoseSnapshot(hero)).toBe(true);
    expect(isPoseSnapshot({ aspect: 1, landmarks: [] })).toBe(false);
    expect(isPoseSnapshot({ aspect: -1, landmarks: hero.landmarks })).toBe(false);
    expect(isPoseSnapshot(JSON.parse(JSON.stringify(compactSnapshot(hero))))).toBe(true);
    const mp = snapshotFromMediapipe(
      Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
      0.75,
    );
    expect(mp?.landmarks).toHaveLength(LANDMARK_COUNT);
    expect(snapshotFromMediapipe([], 1)).toBeNull();
  });
});

describe("pose classifier + score", () => {
  it("ships a model trained on the current feature layout", () => {
    expect(modelMatchesFeatures(POSE_MODEL)).toBe(true);
    expect(POSE_MODEL.classes).toEqual(["runway", "hero", "action", "fighter", "dance", "standing"]);
  });

  it("is mirror-aware: a pose and its mirror image score the same", () => {
    const s = jitteredSnapshot(MOCK_POSES.action, "mirror-test");
    const a = predictArchetype(POSE_MODEL, s);
    const b = predictArchetype(POSE_MODEL, mirrorSnapshot(s));
    for (const c of POSE_MODEL.classes) expect(a.probabilities[c]).toBeCloseTo(b.probabilities[c], 6);
    const total = Object.values(a.probabilities).reduce((x, y) => x + y, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("scores 0-100, neutral without a pose, and turns it into aura", () => {
    for (const name of Object.keys(MOCK_POSES)) {
      const r = scorePose(POSE_MODEL, jitteredSnapshot(MOCK_POSES[name], name), "mock");
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.match).toBeGreaterThan(0);
      expect(describePose(r)).toContain("% match");
    }
    const none = scorePose(POSE_MODEL, null);
    expect(none).toMatchObject({ score: NO_POSE_SCORE, archetype: "unknown", source: "none" });
    expect(poseAura(POSE_NEUTRAL)).toBe(0);
    expect(poseAura(POSE_NEUTRAL + 10)).toBe(10 * POSE_AURA_PER_POINT);
  });

  it("a big dynamic pose outscores standing still", () => {
    const still = scorePose(POSE_MODEL, skeletonSnapshot(MOCK_POSES.standing)).score;
    expect(scorePose(POSE_MODEL, skeletonSnapshot(MOCK_POSES.dance)).score).toBeGreaterThan(still);
    expect(scorePose(POSE_MODEL, skeletonSnapshot(MOCK_POSES.action)).score).toBeGreaterThan(still);
  });

  it("mock poses are deterministic per capture", () => {
    expect(mockPoseFor("abc")).toEqual(mockPoseFor("abc"));
    expect(mockPoseFor("abc")).not.toEqual(mockPoseFor("abd"));
  });
});

describe("pose trainer", () => {
  it("softmax sums to one and survives large logits", () => {
    const p = softmax([1000, 1001, 999]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(p[1]).toBeGreaterThan(p[0]);
  });

  it("learns a separable toy problem (MLP) and builds stratified folds", () => {
    const names = Object.keys(MOCK_POSES);
    const raw = { x: [] as number[][], y: [] as number[] };
    names.forEach((name, c) => {
      for (let i = 0; i < 20; i++) {
        raw.x.push(poseFeatures(jitteredSnapshot(MOCK_POSES[name], `${name}${i}`)));
        raw.y.push(c);
      }
    });
    const std = fitStandardizer(raw.x);
    const data = { x: applyStandardizer(std, raw.x), y: raw.y };
    const layers = trainNetwork(data, { classes: names.length, hidden: 16, l2: 1e-3, epochs: 40, lr: 0.01, batch: 16, seed: "t" });
    const pred = data.x.map((x) => forward(layers, x).indexOf(Math.max(...forward(layers, x))));
    expect(metrics(data.y, pred, names.length).accuracy).toBeGreaterThan(0.9);

    const model: PoseModel = { version: 1, kind: "mlp", classes: names, featureNames: [...FEATURE_NAMES], mean: std.mean, std: std.std, layers, meta: { trainedAt: "", samples: {}, cvAccuracy: 0, notes: "" } };
    expect(predictFeatures(model, raw.x[0])).toHaveLength(names.length);

    const folds = stratifiedFolds(raw.y, 5, "f");
    for (let c = 0; c < names.length; c++) {
      const perFold = [0, 1, 2, 3, 4].map((f) => raw.y.filter((y, i) => y === c && folds[i] === f).length);
      expect(Math.max(...perFold) - Math.min(...perFold)).toBeLessThanOrEqual(1);
    }
  });

  it("computes accuracy, macro F1 and the confusion matrix", () => {
    const m = metrics([0, 0, 1, 1], [0, 1, 1, 1], 2);
    expect(m.accuracy).toBe(0.75);
    expect(m.confusion).toEqual([
      [1, 1],
      [0, 2],
    ]);
    expect(m.macroF1).toBeCloseTo((2 / 3 + 0.8) / 2, 5);
  });
});

describe("superhero power pose", () => {
  it("recognizes fists on hips with elbows out as a hero stance, even though nothing moves", () => {
    const hero = skeletonSnapshot(MOCK_POSES.hero);
    expect(powerPose(hero)).toBeGreaterThan(0.9);
    expect(powerPose(mirrorSnapshot(hero))).toBeGreaterThan(0.9);
    const r = scorePose(POSE_MODEL, hero);
    expect(r.archetype).toBe("hero");
    expect(r.standout).toBe("SUPERHERO POWER POSE");
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it("ignores arms hanging down, raised arms and one hand on a hip", () => {
    expect(powerPose(skeletonSnapshot(MOCK_POSES.standing))).toBe(0);
    expect(powerPose(skeletonSnapshot(MOCK_POSES.dance))).toBe(0);
    const oneHand = { ...MOCK_POSES.hero, right: MOCK_POSES.standing.right };
    expect(powerPose(skeletonSnapshot(oneHand))).toBe(0);
  });
});

describe("everyday photo poses (MAIN CHARACTER)", () => {
  const standing = () => skeletonSnapshot(MOCK_POSES.standing);
  const move = (s: PoseSnapshot, i: number, x: number, y: number): PoseSnapshot => ({ ...s, landmarks: s.landmarks.map((p, j) => (j === i ? [x, y, p[2], p[3]] : p)) as PoseSnapshot["landmarks"] });
  const at = (s: PoseSnapshot, i: number) => ({ x: s.landmarks[i][0], y: s.landmarks[i][1] });
  const elbowUp = (s: PoseSnapshot, elbow: number, shoulder: number) => move(s, elbow, at(s, shoulder).x + (at(s, elbow).x - at(s, shoulder).x) * 1.4, at(s, shoulder).y + 0.02);

  it("plain standing is not a photo pose", () => {
    expect(photoPose(standing())?.strength ?? 0).toBeLessThan(0.5);
    expect(scorePose(POSE_MODEL, standing()).archetype).toBe("standing");
  });

  it("reads a hand up by the face (peace sign)", () => {
    let s = standing();
    const nose = at(s, 0);
    s = elbowUp(s, 14, 12);
    s = move(s, 16, nose.x + 0.03, nose.y + 0.02);
    const p = photoPose(s);
    expect(p?.kind).toBe("peace");
    const r = scorePose(POSE_MODEL, s);
    expect(r.archetype).toBe("aesthetic");
    expect(r.label).toBe("MAIN CHARACTER");
    expect(r.score).toBeGreaterThanOrEqual(52);
    expect(r.score).toBeLessThanOrEqual(70);
  });

  it("reads hands together in front of the body", () => {
    let s = standing();
    const chest = { x: (at(s, 11).x + at(s, 12).x) / 2, y: (at(s, 11).y + at(s, 23).y) / 2 };
    s = move(s, 15, chest.x + 0.01, chest.y);
    s = move(s, 16, chest.x - 0.01, chest.y);
    expect(photoPose(s)?.kind).toBe("hands_together");
  });

  it("reads the head turned to look off camera", () => {
    let s = standing();
    const shoulderW = Math.abs(at(s, 11).x - at(s, 12).x);
    s = move(s, 0, at(s, 0).x + shoulderW * 0.5, at(s, 0).y);
    expect(photoPose(s)?.kind).toBe("look_away");
  });
});
