"use client";

import type { GestureRecognizer, ImageSegmenter, PoseLandmarker } from "@mediapipe/tasks-vision";

/**
 * Lazy MediaPipe Tasks Vision loaders. Everything comes from the CDN on first
 * use; every loader resolves to null (never throws) when it cannot load.
 */

const TASKS_VISION_VERSION = "1.0.1";
export const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODELS = "https://storage.googleapis.com/mediapipe-models";
export const GESTURE_MODEL_URL = `${MODELS}/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task`;
export const POSE_MODEL_URL = `${MODELS}/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`;
export const SEGMENTER_MODEL_URL = `${MODELS}/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`;

/**
 * Hands tracked at once. The spec's recognizer runs with two hands; battles
 * need both people's double peace at the same time, so we track four.
 */
export const GESTURE_NUM_HANDS = 4;
export const POSE_NUM_POSES = 2;

type Vision = typeof import("@mediapipe/tasks-vision");
type WasmFileset = Awaited<ReturnType<Vision["FilesetResolver"]["forVisionTasks"]>>;

let visionPromise: Promise<{ vision: Vision; fileset: WasmFileset } | null> | null = null;

export function loadVision(): Promise<{ vision: Vision; fileset: WasmFileset } | null> {
  if (!visionPromise) {
    visionPromise = (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        return { vision, fileset };
      } catch (err) {
        console.warn("[aura] MediaPipe unavailable", err);
        return null;
      }
    })();
  }
  return visionPromise;
}

/**
 * VIDEO mode tracks hands across the full frame; IMAGE mode re-detects every
 * call and is used for the per-wrist crops, whose content changes each frame.
 */
export async function createGestureRecognizer(runningMode: "VIDEO" | "IMAGE" = "VIDEO"): Promise<GestureRecognizer | null> {
  const v = await loadVision();
  if (!v) return null;
  try {
    return await v.vision.GestureRecognizer.createFromOptions(v.fileset, {
      baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate: "GPU" },
      runningMode,
      numHands: runningMode === "IMAGE" ? 2 : GESTURE_NUM_HANDS,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  } catch (err) {
    console.warn("[aura] gesture recognizer unavailable", err);
    return null;
  }
}

export async function createPoseLandmarker(): Promise<PoseLandmarker | null> {
  const v = await loadVision();
  if (!v) return null;
  try {
    return await v.vision.PoseLandmarker.createFromOptions(v.fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: POSE_NUM_POSES,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch (err) {
    console.warn("[aura] pose landmarker unavailable", err);
    return null;
  }
}

export async function createImageSegmenter(runningMode: "IMAGE" | "VIDEO"): Promise<ImageSegmenter | null> {
  const v = await loadVision();
  if (!v) return null;
  try {
    return await v.vision.ImageSegmenter.createFromOptions(v.fileset, {
      baseOptions: { modelAssetPath: SEGMENTER_MODEL_URL, delegate: "GPU" },
      runningMode,
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  } catch (err) {
    console.warn("[aura] image segmenter unavailable", err);
    return null;
  }
}

/** Pose landmark indexes we use. */
export const POSE_LEFT_SHOULDER = 11;
export const POSE_RIGHT_SHOULDER = 12;
export const POSE_LEFT_WRIST = 15;
export const POSE_RIGHT_WRIST = 16;

/** Hand landmark connections for the debug overlay. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
