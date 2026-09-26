import { createRng, type Rng } from "@/lib/prng";
import { softmax, type DenseLayer } from "./classifier";

/**
 * Small, dependency-free trainers for the pose classifier (used by
 * scripts/pose-train.ts; pure and seeded so runs are reproducible):
 * softmax regression and a one-hidden-layer MLP, both trained with Adam,
 * L2 weight decay and inverse-frequency class weights, plus k-NN as a
 * baseline and stratified k-fold cross-validation.
 */

export interface Dataset {
  x: number[][];
  y: number[];
}

export interface TrainOptions {
  classes: number;
  /** 0 = softmax regression. */
  hidden: number;
  l2: number;
  epochs: number;
  lr: number;
  batch: number;
  seed: string;
}

export interface Standardizer {
  mean: number[];
  std: number[];
}

export function fitStandardizer(x: number[][]): Standardizer {
  const d = x[0]?.length ?? 0;
  const mean = Array(d).fill(0);
  const std = Array(d).fill(0);
  for (const row of x) for (let i = 0; i < d; i++) mean[i] += row[i] / x.length;
  for (const row of x) for (let i = 0; i < d; i++) std[i] += (row[i] - mean[i]) ** 2 / x.length;
  return { mean, std: std.map((v) => Math.sqrt(v) || 1) };
}

export function applyStandardizer(s: Standardizer, x: number[][]): number[][] {
  return x.map((row) => row.map((v, i) => (v - s.mean[i]) / s.std[i]));
}

function initLayer(rng: Rng, outN: number, inN: number): DenseLayer {
  // He init for ReLU layers (fine for the softmax layer too at this size).
  const scale = Math.sqrt(2 / Math.max(1, inN));
  const gauss = () => {
    const u = Math.max(1e-12, rng.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  };
  return { weights: Array.from({ length: outN }, () => Array.from({ length: inN }, () => gauss() * scale)), bias: Array(outN).fill(0) };
}

interface AdamState {
  m: number[][][];
  v: number[][][];
  mb: number[][];
  vb: number[][];
  t: number;
}

/** Inverse-frequency class weights, normalized to mean 1. */
export function classWeights(y: number[], classes: number): number[] {
  const counts = Array(classes).fill(0);
  for (const c of y) counts[c]++;
  const raw = counts.map((n) => (n > 0 ? y.length / (classes * n) : 0));
  return raw;
}

/** Train on already-standardized features. Returns the layers (hidden ReLU layer, if any, then softmax). */
export function trainNetwork(data: Dataset, opts: TrainOptions): DenseLayer[] {
  const rng = createRng(opts.seed);
  const inN = data.x[0].length;
  const layers: DenseLayer[] = opts.hidden > 0 ? [initLayer(rng, opts.hidden, inN), initLayer(rng, opts.classes, opts.hidden)] : [initLayer(rng, opts.classes, inN)];
  const adam: AdamState = {
    m: layers.map((l) => l.weights.map((r) => r.map(() => 0))),
    v: layers.map((l) => l.weights.map((r) => r.map(() => 0))),
    mb: layers.map((l) => l.bias.map(() => 0)),
    vb: layers.map((l) => l.bias.map(() => 0)),
    t: 0,
  };
  const weights = classWeights(data.y, opts.classes);
  const order = data.x.map((_, i) => i);
  const [b1, b2, eps] = [0.9, 0.999, 1e-8];

  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    // Fisher-Yates shuffle.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // Cosine learning-rate decay.
    const lr = opts.lr * (0.5 + 0.5 * Math.cos((Math.PI * epoch) / opts.epochs));
    for (let start = 0; start < order.length; start += opts.batch) {
      const batch = order.slice(start, start + opts.batch);
      const gW = layers.map((l) => l.weights.map((r) => r.map(() => 0)));
      const gB = layers.map((l) => l.bias.map(() => 0));
      let wsum = 0;
      for (const idx of batch) {
        const w = weights[data.y[idx]];
        wsum += w;
        // Forward.
        const acts: number[][] = [data.x[idx]];
        layers.forEach((layer, li) => {
          const inp = acts[li];
          const out = layer.weights.map((row, o) => row.reduce((s, wv, i) => s + wv * inp[i], layer.bias[o]));
          acts.push(li < layers.length - 1 ? out.map((v) => Math.max(0, v)) : out);
        });
        const probs = softmax(acts[acts.length - 1]);
        // Backward: dL/dlogits = p - onehot.
        let delta = probs.map((p, c) => (p - (c === data.y[idx] ? 1 : 0)) * w);
        for (let li = layers.length - 1; li >= 0; li--) {
          const inp = acts[li];
          const layer = layers[li];
          for (let o = 0; o < delta.length; o++) {
            gB[li][o] += delta[o];
            const row = gW[li][o];
            for (let i = 0; i < inp.length; i++) row[i] += delta[o] * inp[i];
          }
          if (li > 0) {
            const prev = inp;
            delta = prev.map((a, i) => (a > 0 ? layer.weights.reduce((s, row, o) => s + row[i] * delta[o], 0) : 0));
          }
        }
      }
      // Adam step with L2 (decoupled weight decay).
      adam.t++;
      const bc1 = 1 - b1 ** adam.t;
      const bc2 = 1 - b2 ** adam.t;
      layers.forEach((layer, li) => {
        layer.weights.forEach((row, o) => {
          for (let i = 0; i < row.length; i++) {
            const g = gW[li][o][i] / wsum;
            adam.m[li][o][i] = b1 * adam.m[li][o][i] + (1 - b1) * g;
            adam.v[li][o][i] = b2 * adam.v[li][o][i] + (1 - b2) * g * g;
            row[i] -= lr * ((adam.m[li][o][i] / bc1) / (Math.sqrt(adam.v[li][o][i] / bc2) + eps) + opts.l2 * row[i]);
          }
          const gb = gB[li][o] / wsum;
          adam.mb[li][o] = b1 * adam.mb[li][o] + (1 - b1) * gb;
          adam.vb[li][o] = b2 * adam.vb[li][o] + (1 - b2) * gb * gb;
          layer.bias[o] -= lr * ((adam.mb[li][o] / bc1) / (Math.sqrt(adam.vb[li][o] / bc2) + eps));
        });
      });
    }
  }
  return layers;
}

export function forward(layers: DenseLayer[], x: number[]): number[] {
  let h = x;
  layers.forEach((layer, li) => {
    const out = layer.weights.map((row, o) => row.reduce((s, w, i) => s + w * h[i], layer.bias[o]));
    h = li < layers.length - 1 ? out.map((v) => Math.max(0, v)) : out;
  });
  return softmax(h);
}

export function argmax(v: number[]): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  return best;
}

/** k-nearest-neighbors baseline (standardized features, Euclidean). */
export function knnPredict(train: Dataset, x: number[], k: number, classes: number): number {
  const d = train.x.map((row, i) => ({ i, d: row.reduce((s, v, j) => s + (v - x[j]) ** 2, 0) })).sort((a, b) => a.d - b.d);
  const votes = Array(classes).fill(0);
  for (const { i, d: dist } of d.slice(0, k)) votes[train.y[i]] += 1 / (1e-6 + Math.sqrt(dist));
  return argmax(votes);
}

export interface Metrics {
  accuracy: number;
  macroF1: number;
  /** confusion[actual][predicted] */
  confusion: number[][];
}

export function metrics(actual: number[], predicted: number[], classes: number): Metrics {
  const confusion = Array.from({ length: classes }, () => Array(classes).fill(0));
  actual.forEach((a, i) => confusion[a][predicted[i]]++);
  const correct = actual.filter((a, i) => a === predicted[i]).length;
  const f1s = confusion.map((row, c) => {
    const tp = row[c];
    const fn = row.reduce((s, v) => s + v, 0) - tp;
    const fp = confusion.reduce((s, r) => s + r[c], 0) - tp;
    return tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
  });
  return { accuracy: actual.length ? correct / actual.length : 0, macroF1: f1s.reduce((s, v) => s + v, 0) / classes, confusion };
}

/** Stratified fold assignment (sample index -> fold), seeded. */
export function stratifiedFolds(y: number[], k: number, seed: string): number[] {
  const rng = createRng(seed);
  const folds = Array(y.length).fill(0);
  const byClass = new Map<number, number[]>();
  y.forEach((c, i) => byClass.set(c, [...(byClass.get(c) ?? []), i]));
  for (const idxs of byClass.values()) {
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    idxs.forEach((idx, n) => (folds[idx] = n % k));
  }
  return folds;
}
