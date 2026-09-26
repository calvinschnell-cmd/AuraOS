import type { PoseModel } from "./classifier";
import { FEATURE_NAMES } from "./features";
import modelJson from "./model.json";

/** The trained classifier (lib/pose/model.json, written by `npm run pose:train`). */
export const POSE_MODEL = modelJson as PoseModel;

/** A model trained on another feature layout would silently mis-score: fail loudly in tests instead. */
export function modelMatchesFeatures(model: PoseModel = POSE_MODEL): boolean {
  return model.mean.length === FEATURE_NAMES.length && model.layers[0].weights.every((row) => row.length === FEATURE_NAMES.length);
}
