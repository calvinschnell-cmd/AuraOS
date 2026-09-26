import { poseFeatures } from "./features";
import { mirrorSnapshot, type PoseSnapshot } from "./landmarks";

/**
 * Trained pose-archetype classifier (inference only). The weights come from
 * scripts/pose-train.ts (a small MLP, or plain softmax regression when that
 * validates better) trained on landmarks MediaPipe extracted from the
 * collected dataset, with each photo's search category as a weak label.
 */

export interface DenseLayer {
  /** weights[out][in] */
  weights: number[][];
  bias: number[];
}

export interface PoseModel {
  version: 1;
  kind: "mlp" | "softmax";
  classes: string[];
  featureNames: string[];
  /** Feature standardization (z-score) fitted on the training set. */
  mean: number[];
  std: number[];
  /** Hidden layers use ReLU; the last layer is the softmax output. */
  layers: DenseLayer[];
  meta: {
    trainedAt: string;
    samples: Record<string, number>;
    /** Cross-validated accuracy of the chosen model (weak labels). */
    cvAccuracy: number;
    notes: string;
  };
}

export interface ArchetypePrediction {
  /** Most likely archetype id (e.g. "hero"). */
  archetype: string;
  /** Its probability, 0-1. */
  confidence: number;
  /** Every class probability (averaged over the pose and its mirror image). */
  probabilities: Record<string, number>;
}

function dense(layer: DenseLayer, x: number[], relu: boolean): number[] {
  return layer.weights.map((row, o) => {
    let s = layer.bias[o];
    for (let i = 0; i < row.length; i++) s += row[i] * x[i];
    return relu ? Math.max(0, s) : s;
  });
}

export function softmax(logits: number[]): number[] {
  const m = Math.max(...logits);
  const e = logits.map((l) => Math.exp(l - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

export function standardize(model: Pick<PoseModel, "mean" | "std">, features: number[]): number[] {
  return features.map((f, i) => (f - model.mean[i]) / (model.std[i] || 1));
}

/** Class probabilities for one already-computed feature vector. */
export function predictFeatures(model: PoseModel, features: number[]): number[] {
  let h = standardize(model, features);
  model.layers.forEach((layer, i) => {
    h = dense(layer, h, i < model.layers.length - 1);
  });
  return softmax(h);
}

/**
 * Mirror-aware prediction: people face the kiosk from either side, so the
 * pose and its horizontal mirror image are both classified and averaged.
 */
export function predictArchetype(model: PoseModel, snapshot: PoseSnapshot): ArchetypePrediction {
  const a = predictFeatures(model, poseFeatures(snapshot));
  const b = predictFeatures(model, poseFeatures(mirrorSnapshot(snapshot)));
  const probs = a.map((p, i) => (p + b[i]) / 2);
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return {
    archetype: model.classes[best],
    confidence: probs[best],
    probabilities: Object.fromEntries(model.classes.map((c, i) => [c, probs[i]])),
  };
}
