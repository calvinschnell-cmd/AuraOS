/**
 * Train the pose-archetype classifier (spec: "Pose matching implementation").
 *
 *   1. ml-service/pose/collect.py   pulls photos per search category (weak labels)
 *   2. ml-service/pose/extract.py   MediaPipe landmarks + automatic filtering -> landmarks.jsonl
 *   3. npm run pose:train           (this) features -> CV model selection -> lib/pose/model.json
 *
 * Optional extra samples recorded live at the kiosk (/pose-lab) are read from
 * ml-service/pose/recorded.jsonl in the same format.
 *
 * Mirror + landmark-noise augmentation is applied inside training folds only,
 * so no copy of a validation photo ever leaks into its own training set.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { predictArchetype, type PoseModel } from "../lib/pose/classifier";
import { FEATURE_NAMES, poseFeatures } from "../lib/pose/features";
import { isPoseSnapshot, mirrorSnapshot, type Landmark, type PoseSnapshot } from "../lib/pose/landmarks";
import { ARCHETYPES } from "../lib/pose/score";
import { applyStandardizer, argmax, fitStandardizer, forward, knnPredict, metrics, stratifiedFolds, trainNetwork, type Dataset, type Metrics } from "../lib/pose/train";
import { createRng } from "../lib/prng";

const ROOT = join(__dirname, "..");
const SOURCES = [join(ROOT, "ml-service/pose/landmarks.jsonl"), join(ROOT, "ml-service/pose/recorded.jsonl")];
const MODEL_OUT = join(ROOT, "lib/pose/model.json");
const REPORT_OUT = join(ROOT, "ml-service/pose/REPORT.md");

const CLASSES = Object.keys(ARCHETYPES);
const FOLDS = 5;
const SEED = "aura-pose-v1";
const NOISE = 0.006;

interface Sample {
  id: string;
  label: number;
  snapshot: PoseSnapshot;
  license: string | null;
}

function load(): Sample[] {
  const out: Sample[] = [];
  for (const path of SOURCES) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { id: string; category: string; width: number; height: number; landmarks: Landmark[]; license?: string };
      const label = CLASSES.indexOf(r.category);
      const snapshot = { aspect: r.width / r.height, landmarks: r.landmarks };
      if (label < 0 || !isPoseSnapshot(snapshot)) continue;
      out.push({ id: r.id, label, snapshot, license: r.license ?? null });
    }
  }
  return out;
}

function noisy(s: PoseSnapshot, seed: string): PoseSnapshot {
  const rng = createRng(seed);
  return { ...s, landmarks: s.landmarks.map(([x, y, z, v]) => [x + rng.float(-NOISE, NOISE), y + rng.float(-NOISE, NOISE), z, v]) };
}

/** Each training sample as the original, its mirror, and a noisy copy of each (the live lite model is noisier). */
function augment(samples: Sample[]): Dataset {
  const x: number[][] = [];
  const y: number[] = [];
  for (const s of samples) {
    const m = mirrorSnapshot(s.snapshot);
    for (const snap of [s.snapshot, m, noisy(s.snapshot, `${s.id}:n`), noisy(m, `${s.id}:mn`)]) {
      x.push(poseFeatures(snap));
      y.push(s.label);
    }
  }
  return { x, y };
}

interface Config {
  name: string;
  hidden: number;
  l2: number;
  epochs?: number;
}

const GRID: Config[] = [
  { name: "softmax l2=1e-3", hidden: 0, l2: 1e-3 },
  { name: "softmax l2=1e-2", hidden: 0, l2: 1e-2 },
  { name: "mlp-24 l2=1e-3", hidden: 24, l2: 1e-3 },
  { name: "mlp-24 l2=1e-2", hidden: 24, l2: 1e-2 },
  { name: "mlp-48 l2=3e-3", hidden: 48, l2: 3e-3 },
  { name: "mlp-64 l2=3e-3", hidden: 64, l2: 3e-3 },
  { name: "mlp-64 l2=1e-2 (100 ep)", hidden: 64, l2: 1e-2, epochs: 100 },
  { name: "mlp-96 l2=1e-2 (100 ep)", hidden: 96, l2: 1e-2, epochs: 100 },
];
const EPOCHS = 60;
const LR = 0.01;
const BATCH = 32;

function trainModel(samples: Sample[], cfg: Config, seed: string) {
  const raw = augment(samples);
  const std = fitStandardizer(raw.x);
  const data = { x: applyStandardizer(std, raw.x), y: raw.y };
  const layers = trainNetwork(data, { classes: CLASSES.length, hidden: cfg.hidden, l2: cfg.l2, epochs: cfg.epochs ?? EPOCHS, lr: LR, batch: BATCH, seed });
  return { std, layers, data };
}

function toModel(t: ReturnType<typeof trainModel>, cfg: Config, samples: Sample[], cvAccuracy: number): PoseModel {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  const counts = Object.fromEntries(CLASSES.map((c, i) => [c, samples.filter((s) => s.label === i).length]));
  return {
    version: 1,
    kind: cfg.hidden > 0 ? "mlp" : "softmax",
    classes: CLASSES,
    featureNames: [...FEATURE_NAMES],
    mean: t.std.mean.map(r),
    std: t.std.std.map(r),
    layers: t.layers.map((l) => ({ weights: l.weights.map((row) => row.map(r)), bias: l.bias.map(r) })),
    meta: {
      trainedAt: new Date().toISOString(),
      samples: counts,
      cvAccuracy: Math.round(cvAccuracy * 1000) / 1000,
      notes: `${cfg.name}; ${FOLDS}-fold CV on ${samples.length} photos (Wikimedia Commons, weak labels by search category); mirror + noise augmentation`,
    },
  };
}

function main() {
  const samples = load();
  if (samples.length < CLASSES.length * 5) {
    console.error(`only ${samples.length} samples: run ml-service/pose collect.py + extract.py first`);
    process.exit(1);
  }
  console.log(`samples: ${samples.length}`, Object.fromEntries(CLASSES.map((c, i) => [c, samples.filter((s) => s.label === i).length])));
  const folds = stratifiedFolds(
    samples.map((s) => s.label),
    FOLDS,
    SEED,
  );

  const results: { cfg: Config | "knn"; m: Metrics }[] = [];
  for (const cfg of [...GRID, "knn" as const]) {
    const actual: number[] = [];
    const predicted: number[] = [];
    for (let f = 0; f < FOLDS; f++) {
      const train = samples.filter((_, i) => folds[i] !== f);
      const val = samples.filter((_, i) => folds[i] === f);
      if (cfg === "knn") {
        const raw = augment(train);
        const std = fitStandardizer(raw.x);
        const data = { x: applyStandardizer(std, raw.x), y: raw.y };
        for (const s of val) {
          actual.push(s.label);
          predicted.push(knnPredict(data, applyStandardizer(std, [poseFeatures(s.snapshot)])[0], 7, CLASSES.length));
        }
        continue;
      }
      const t = trainModel(train, cfg, `${SEED}:${cfg.name}:${f}`);
      const model = toModel(t, cfg, train, 0);
      for (const s of val) {
        actual.push(s.label);
        // Exactly the runtime path: mirror-averaged prediction.
        predicted.push(CLASSES.indexOf(predictArchetype(model, s.snapshot).archetype));
      }
    }
    const m = metrics(actual, predicted, CLASSES.length);
    results.push({ cfg, m });
    console.log(`${cfg === "knn" ? "knn k=7 (baseline)" : cfg.name}: acc ${(m.accuracy * 100).toFixed(1)}%  macroF1 ${(m.macroF1 * 100).toFixed(1)}%`);
  }

  const candidates = results.filter((r): r is { cfg: Config; m: Metrics } => r.cfg !== "knn");
  const best = candidates.sort((a, b) => b.m.macroF1 - a.m.macroF1)[0];
  console.log(`best: ${best.cfg.name}`);
  const final = trainModel(samples, best.cfg, `${SEED}:final`);
  const model = toModel(final, best.cfg, samples, best.m.accuracy);
  writeFileSync(MODEL_OUT, `${JSON.stringify(model)}\n`);

  // Training-set fit (sanity only; the CV numbers are the honest ones).
  const fit = metrics(
    final.data.y,
    final.data.x.map((x) => argmax(forward(final.layers, x))),
    CLASSES.length,
  );

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const chance = 1 / CLASSES.length;
  const licenses = new Map<string, number>();
  for (const s of samples) licenses.set(s.license ?? "unknown", (licenses.get(s.license ?? "unknown") ?? 0) + 1);
  const confusion = best.m.confusion;
  const report = `# Pose classifier report

Generated by \`npm run pose:train\` on ${new Date().toISOString()}.

## Data

${samples.length} photos survived automatic filtering (single person, full body, confident landmarks).
Source: Wikimedia Commons, freely licensed files only (photos are not stored in the repo; see
\`ml-service/pose/data/manifest.jsonl\` locally for per-file attribution). Labels are weak: each photo's
archetype is the search category it was found under, so some labels are wrong by design.

| Archetype | Label | Photos |
| --- | --- | ---: |
${CLASSES.map((c, i) => `| ${c} | ${ARCHETYPES[c as keyof typeof ARCHETYPES].label} | ${samples.filter((s) => s.label === i).length} |`).join("\n")}

Licenses: ${[...licenses.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(", ")}.

## Model selection (${FOLDS}-fold stratified cross-validation, mirror-averaged predictions)

Chance level: ${pct(chance)}.

| Model | Accuracy | Macro F1 |
| --- | ---: | ---: |
${results.map((r) => `| ${r.cfg === "knn" ? "k-NN k=7 (baseline)" : r.cfg.name}${r.cfg !== "knn" && r.cfg.name === best.cfg.name ? " **(chosen)**" : ""} | ${pct(r.m.accuracy)} | ${pct(r.m.macroF1)} |`).join("\n")}

Final model: ${best.cfg.name}, retrained on all photos (training-set accuracy ${pct(fit.accuracy)}).

## Confusion matrix (chosen model, cross-validated; rows = label, columns = predicted)

| | ${CLASSES.join(" | ")} |
| --- | ${CLASSES.map(() => "---:").join(" | ")} |
${confusion.map((row, i) => `| **${CLASSES[i]}** | ${row.join(" | ")} |`).join("\n")}

## How it is used

\`lib/pose/score.ts\` runs the classifier on the live MediaPipe landmarks captured with each photo
(mirror-aware: the pose and its mirror image are averaged), then blends the archetype probabilities with
rule-based dynamism signals (arms raised, reach, stance width, asymmetry, lean, knee bend) into the 0-100
Pose sub-score. The archetype and match % feed the battle commentary.
`;
  writeFileSync(REPORT_OUT, report);
  console.log(`wrote ${MODEL_OUT} and ${REPORT_OUT}`);
}

main();
