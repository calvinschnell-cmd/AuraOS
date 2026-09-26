"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { GestureRecognizer, NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import { snapshotFromMediapipe, type PoseSnapshot } from "@/lib/pose/landmarks";
import { assessFraming, assessPose, isFacingCamera, type Framing } from "./framing";
import { frameDistance, handCropRect, mapCropPoint, poseHandAnchors, type HandAnchor } from "./handCrops";
import { SHAPE_CONFIDENCE, classifyHandShape, handExtent } from "./handShape";
import { GestureEngine, allowedGestures, type EngineDebug, type EngineGesture, type ObservationFrame, type Progress } from "./gestureEngine";
import { gestureEvent, gesturesForState, gesturesIgnored, isIdleState } from "./machine";
import type { CameraRotation, KioskEvent, KioskState } from "./types";
import { POSE_LEFT_HIP, POSE_LEFT_SHOULDER, POSE_LEFT_WRIST, POSE_RIGHT_HIP, POSE_RIGHT_SHOULDER, POSE_RIGHT_WRIST, createGestureRecognizer, createPoseLandmarker } from "./vision";

export type GestureStatus = "off" | "loading" | "running" | "error";

export interface HandLandmarks {
  points: NormalizedLandmark[];
  gesture: string;
  score: number;
  handedness: string;
}

export interface PoseBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface GestureDebug extends EngineDebug {
  status: GestureStatus;
  detectFps: number;
  landmarks: HandLandmarks[];
  personSeen: boolean;
  cooldownMs: number;
  /** Size of the frame the landmarks are normalized to (upright, unmirrored). */
  frame: { width: number; height: number };
  /** Bounding boxes of detected people (for battle crops). */
  poseBoxes: PoseBox[];
  /** Whether the main person's whole fit is in frame (drives the STEP BACK prompt). */
  framing: Framing;
}

export interface GestureRuntime {
  status: GestureStatus;
  /** Smooth ring progress; read inside rAF, not render. */
  progressRef: RefObject<Progress>;
  /** Latest pose boxes without waiting for a debug refresh. */
  poseBoxesRef: RefObject<PoseBox[]>;
  /** Latest full landmark sets per person (upright, unmirrored): the pose score at capture time. */
  posesRef: RefObject<PoseSnapshot[]>;
  debug: GestureDebug;
}

export interface GestureOptions {
  video: RefObject<HTMLVideoElement | null>;
  /** Camera is live: run detection. Otherwise only the no-person timers run. */
  cameraLive: boolean;
  /** Screen sides are mirrored relative to the raw camera image. */
  mirrored: boolean;
  rotation: CameraRotation;
  state: KioskState;
  /** Result reveal animation still running: ignore gestures. */
  revealing: boolean;
  performanceMode: boolean;
  send: (event: KioskEvent) => void;
}

const DETECT_FPS = 15;
const POSE_EVERY_N = 3; // ~5 fps
const DEBUG_FPS = 8;
const NO_PERSON_RESULT_MS = 20_000;
const NO_PERSON_ATTRACT_MS = 60_000;
const SESSION_END_COOLDOWN_MS = 5000;
const DETECT_LONG_SIDE = 640;
/** A pose frame that suddenly finds nobody keeps the last people this long (detector dropout). */
const POSE_HOLD_MS = 600;
/** Per-wrist crops are resampled to this square before the second recognizer pass. */
const CROP_SIZE = 256;
/** Max wrist crops per frame (two people x two hands). */
const MAX_CROPS = 4;
/**
 * A full-frame hand this close to a pose wrist (long-side units) already
 * covers it, and crop results this close replace it. Kept small so two hands
 * held together (double peace at the chest) are never merged into one.
 */
const HAND_MATCH_DISTANCE = 0.045;
/** Pose wrists below this visibility are not cropped. */
const ANCHOR_VISIBILITY = 0.4;
/** A full-frame hand smaller than this (long-side units) gets a crop pass anyway. */
const MIN_FULL_FRAME_HAND = 0.09;
/** Classifier results below this fall back to the geometric hand shape. */
const CONFIDENT_SCORE = 0.6;

const EMPTY_DEBUG: GestureDebug = {
  status: "off",
  detectFps: 0,
  landmarks: [],
  hands: [],
  personCount: 0,
  waveReversals: 0,
  progress: { gesture: null, value: 0 },
  lastEvent: null,
  unframedPeople: [],
  battleWaiting: false,
  personSeen: false,
  cooldownMs: 0,
  frame: { width: 0, height: 0 },
  poseBoxes: [],
  framing: "none",
};

/**
 * MediaPipe gesture + pose runtime. Runs the gesture recognizer at ~15fps
 * (half in performance mode) and the pose landmarker at ~5fps (every frame
 * while a battle looks likely), feeds the pure engine and forwards events to
 * the kiosk machine. Also owns the no-person timers and the post-session
 * cooldown.
 */
export function useGestures(opts: GestureOptions): GestureRuntime {
  const [status, setStatus] = useState<GestureStatus>("off");
  const [debug, setDebug] = useState<GestureDebug>(EMPTY_DEBUG);
  const progressRef = useRef<Progress>({ gesture: null, value: 0 });
  const poseBoxesRef = useRef<PoseBox[]>([]);
  const posesRef = useRef<PoseSnapshot[]>([]);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const lastPersonAt = useRef<number>(Date.now());
  const cooldownUntil = useRef(0);
  const prevState = useRef<KioskState>(opts.state);

  // Cooldown starts whenever a session ends (non-idle -> idle).
  useEffect(() => {
    if (isIdleState(opts.state) && !isIdleState(prevState.current) && prevState.current !== "BOOT") {
      cooldownUntil.current = Date.now() + SESSION_END_COOLDOWN_MS;
    }
    prevState.current = opts.state;
  }, [opts.state]);

  // No-person timers (work with or without a camera: no camera = no person).
  useEffect(() => {
    const id = window.setInterval(() => {
      const o = optsRef.current;
      const noPersonFor = Date.now() - lastPersonAt.current;
      if ((o.state === "RESULT" || o.state === "CLAIM" || o.state === "BATTLE_RESULT") && noPersonFor >= NO_PERSON_RESULT_MS && o.cameraLive) {
        console.info(`[aura] nobody seen for ${(noPersonFor / 1000).toFixed(1)}s in ${o.state}: resetting`);
        o.send({ type: "TIMEOUT" });
      } else if (o.state === "SPINNING" && noPersonFor >= NO_PERSON_ATTRACT_MS) {
        o.send({ type: "TIMEOUT" });
      } else if (o.state === "ATTRACT" && noPersonFor < 1000) {
        o.send({ type: "PERSON_SEEN" });
      }
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // Detection loop.
  useEffect(() => {
    if (!opts.cameraLive) {
      setStatus("off");
      return;
    }
    let cancelled = false;
    let timer = 0;
    let recognizer: GestureRecognizer | null = null;
    let cropRecognizer: GestureRecognizer | null = null;
    let pose: PoseLandmarker | null = null;
    const engine = new GestureEngine();
    const work = document.createElement("canvas");
    const workCtx = work.getContext("2d", { willReadFrequently: false });
    const cropCanvases = Array.from({ length: MAX_CROPS }, () => {
      const c = document.createElement("canvas");
      c.width = CROP_SIZE;
      c.height = CROP_SIZE;
      return c;
    });
    let tick = 0;
    let fpsCount = 0;
    let fpsWindowStart = performance.now();
    let detectFps = 0;
    let lastDebugPush = 0;
    let lastPoses: ObservationFrame["poses"] = [];
    let lastPoseFramings: Framing[] = [];
    let lastPoseSeenAt = 0;
    let lastAnchors: HandAnchor[][] = [];
    let lastBoxes: PoseBox[] = [];
    let lastFraming: Framing = "none";
    let lastTimestamp = 0;

    const start = async () => {
      setStatus("loading");
      [recognizer, cropRecognizer, pose] = await Promise.all([createGestureRecognizer(), createGestureRecognizer("IMAGE"), createPoseLandmarker()]);
      if (cancelled) return;
      if (!recognizer) {
        setStatus("error");
        return;
      }
      setStatus("running");
      loop();
    };

    /** Upright (rotated) source for detection. Mirroring is applied in the engine. */
    const prepareSource = (video: HTMLVideoElement, rotation: CameraRotation): { source: HTMLVideoElement | HTMLCanvasElement; width: number; height: number } => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (rotation === 0) return { source: video, width: vw, height: vh };
      const sideways = rotation === 90 || rotation === 270;
      const outW = sideways ? vh : vw;
      const outH = sideways ? vw : vh;
      const scale = Math.min(1, DETECT_LONG_SIDE / Math.max(outW, outH));
      const cw = Math.round(outW * scale);
      const ch = Math.round(outH * scale);
      if (work.width !== cw || work.height !== ch) {
        work.width = cw;
        work.height = ch;
      }
      if (workCtx) {
        workCtx.setTransform(1, 0, 0, 1, 0, 0);
        workCtx.clearRect(0, 0, cw, ch);
        workCtx.translate(cw / 2, ch / 2);
        workCtx.rotate((rotation * Math.PI) / 180);
        workCtx.drawImage(video, (-vw * scale) / 2, (-vh * scale) / 2, vw * scale, vh * scale);
      }
      return { source: work, width: cw, height: ch };
    };

    const loop = () => {
      if (cancelled) return;
      const o = optsRef.current;
      const interval = 1000 / (o.performanceMode ? DETECT_FPS / 2 : DETECT_FPS);
      timer = window.setTimeout(loop, interval);
      const video = o.video.current;
      if (!recognizer || !video || video.readyState < 2 || video.videoWidth === 0) return;

      const now = performance.now();
      // MediaPipe requires strictly increasing timestamps.
      const timestamp = Math.max(now, lastTimestamp + 1);
      lastTimestamp = timestamp;
      const { source, width, height } = prepareSource(video, o.rotation);

      let hands: ObservationFrame["hands"] = [];
      let landmarks: HandLandmarks[] = [];
      try {
        const result = recognizer.recognizeForVideo(source, timestamp);
        hands = result.landmarks.map((points, i) => {
          const g = result.gestures[i]?.[0];
          const h = result.handedness[i]?.[0];
          return {
            gesture: g?.categoryName ?? "None",
            score: g?.score ?? 0,
            wristX: points[0]?.x ?? 0.5,
            wristY: points[0]?.y ?? 0.5,
            handedness: h?.categoryName ?? "Unknown",
          };
        });
        landmarks = result.landmarks.map((points, i) => ({
          points,
          gesture: result.gestures[i]?.[0]?.categoryName ?? "None",
          score: result.gestures[i]?.[0]?.score ?? 0,
          handedness: result.handedness[i]?.[0]?.categoryName ?? "?",
        }));
      } catch (err) {
        console.warn("[aura] gesture recognition failed", err);
        return;
      }

      // Second pass: at full-body distance a hand is too small for the
      // full-frame detector, so each pose wrist gets a tight crop. A crop
      // result replaces any full-frame hand at the same wrist.
      if (cropRecognizer && lastAnchors.length > 0) {
        // Crops are cut from the full-resolution video (rotated upright), not
        // from the downscaled detection frame, so a far hand stays sharp.
        const sideways = o.rotation === 90 || o.rotation === 270;
        const fullW = sideways ? video.videoHeight : video.videoWidth;
        const fullH = sideways ? video.videoWidth : video.videoHeight;
        const anchors = lastAnchors.flat().filter((a) => a.visibility >= ANCHOR_VISIBILITY).slice(0, MAX_CROPS);
        anchors.forEach((a, k) => {
          const covered = hands.findIndex((h) => frameDistance({ x: h.wristX, y: h.wristY }, a.wrist, width, height) < HAND_MATCH_DISTANCE);
          if (
            covered >= 0 &&
            hands[covered].gesture !== "None" &&
            hands[covered].score >= CONFIDENT_SCORE &&
            handExtent(landmarks[covered]?.points ?? [], width, height) >= MIN_FULL_FRAME_HAND
          )
            return;
          const r = handCropRect(a, fullW, fullH);
          if (r.size < 8) return;
          const crop = cropCanvases[k];
          const cctx = crop.getContext("2d");
          if (!cctx) return;
          const k2 = CROP_SIZE / r.size;
          cctx.setTransform(1, 0, 0, 1, 0, 0);
          cctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
          cctx.scale(k2, k2);
          cctx.translate(-r.sx + fullW / 2, -r.sy + fullH / 2);
          cctx.rotate((o.rotation * Math.PI) / 180);
          cctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
          let result: ReturnType<GestureRecognizer["recognize"]>;
          try {
            result = cropRecognizer!.recognize(crop);
          } catch {
            return;
          }
          result.landmarks.forEach((points, i) => {
            const mapped = points.map((p) => mapCropPoint(p, r, fullW, fullH));
            const wrist = mapped[0] ?? { x: a.wrist.x, y: a.wrist.y };
            const g = result.gestures[i]?.[0];
            const h = result.handedness[i]?.[0];
            const obs = { gesture: g?.categoryName ?? "None", score: g?.score ?? 0, wristX: wrist.x, wristY: wrist.y, handedness: h?.categoryName ?? "Unknown" };
            const lm = { points: mapped, gesture: obs.gesture, score: obs.score, handedness: h?.categoryName ?? "?" };
            const dup = hands.findIndex((x) => frameDistance({ x: x.wristX, y: x.wristY }, wrist, width, height) < HAND_MATCH_DISTANCE);
            if (dup >= 0) {
              hands[dup] = obs;
              landmarks[dup] = lm;
            } else {
              hands.push(obs);
              landmarks.push(lm);
            }
          });
        });
      }

      // Geometric backup: when the canned classifier says None (or is unsure),
      // read the shape from finger extension on the landmarks instead.
      const aspect = width / height;
      hands.forEach((h, i) => {
        if (h.gesture !== "None" && h.score >= CONFIDENT_SCORE) return;
        const shape = classifyHandShape(landmarks[i]?.points ?? [], aspect);
        if (shape === "None") return;
        hands[i] = { ...h, gesture: shape, score: SHAPE_CONFIDENCE };
        if (landmarks[i]) landmarks[i] = { ...landmarks[i], gesture: shape, score: SHAPE_CONFIDENCE };
      });

      // Pose at ~5fps, or every frame when a battle looks likely (3+ Victory hands).
      tick++;
      const victoryHands = hands.filter((h) => h.gesture === "Victory" && h.score >= 0.6).length;
      const battleLikely = victoryHands >= 3 || (isIdleState(o.state) || o.state === "READY" ? victoryHands >= 2 && hands.length >= 3 : false);
      if (pose && (tick % (o.performanceMode ? POSE_EVERY_N * 2 : POSE_EVERY_N) === 0 || battleLikely)) {
        let pr: ReturnType<PoseLandmarker["detectForVideo"]> | null = null;
        try {
          pr = pose.detectForVideo(source, timestamp + 0.5);
        } catch {
          // keep the last poses
        }
        // A frame that suddenly finds nobody is usually a detector dropout: keep the last people briefly.
        const dropout = pr !== null && pr.landmarks.length === 0 && now - lastPoseSeenAt < POSE_HOLD_MS;
        if (pr && !dropout) {
          if (pr.landmarks.length > 0) lastPoseSeenAt = now;
          lastPoseFramings = pr.landmarks.map((lm) => assessPose(lm));
          lastPoses = pr.landmarks.map((lm, i) => ({
            wrists: [lm[POSE_LEFT_WRIST], lm[POSE_RIGHT_WRIST]].filter(Boolean).map((p) => ({ x: p.x, y: p.y })),
            framed: lastPoseFramings[i] === "full",
            facing: isFacingCamera(lm),
            shoulderY: lm[POSE_LEFT_SHOULDER] && lm[POSE_RIGHT_SHOULDER] ? (lm[POSE_LEFT_SHOULDER].y + lm[POSE_RIGHT_SHOULDER].y) / 2 : undefined,
            hipY: lm[POSE_LEFT_HIP] && lm[POSE_RIGHT_HIP] ? (lm[POSE_LEFT_HIP].y + lm[POSE_RIGHT_HIP].y) / 2 : undefined,
          }));
          lastAnchors = pr.landmarks.map((lm) => poseHandAnchors(lm));
          lastBoxes = pr.landmarks.map((lm) => {
            let xmin = 1, ymin = 1, xmax = 0, ymax = 0;
            for (const p of lm) {
              if (p.x < xmin) xmin = p.x;
              if (p.x > xmax) xmax = p.x;
              if (p.y < ymin) ymin = p.y;
              if (p.y > ymax) ymax = p.y;
            }
            return { xmin, ymin, xmax, ymax };
          });
          poseBoxesRef.current = lastBoxes;
          posesRef.current = pr.landmarks.map((lm) => snapshotFromMediapipe(lm, width / height)).filter((p): p is PoseSnapshot => p !== null);
          lastFraming = assessFraming(pr.landmarks);
        }
      }

      const personSeen = hands.length > 0 || lastPoses.length > 0;
      if (personSeen) lastPersonAt.current = Date.now();

      // Which gestures may fire right now.
      const ignore = gesturesIgnored(o.state) || o.revealing || Date.now() < cooldownUntil.current;
      const battleAllowed = isIdleState(o.state) || o.state === "READY" || o.state === "LOBBY";
      const allowed: Set<EngineGesture> = ignore ? new Set() : allowedGestures(gesturesForState(o.state), battleAllowed);
      // Scans only judge a whole fit at a readable size: with no body in view
      // at all, hold the scan gestures. Per-person framing is checked in the
      // engine (every battler must be framed too).
      if (lastPoses.length === 0) {
        allowed.delete("double_peace");
        allowed.delete("battle");
        allowed.delete("solo_battle");
      }

      const events = engine.update({ t: now, hands, poses: lastPoses, mirrored: o.mirrored }, allowed);
      // What the FRAMING window asks for: hands but no body usually means too
      // close; otherwise whoever is gesturing unframed, else the main person.
      const unframed = engine.debug.unframedPeople;
      const shownFraming: Framing =
        lastPoses.length === 0
          ? hands.length > 0
            ? "step_back"
            : "none"
          : unframed.length > 0
            ? lastPoseFramings[unframed[0]] === "step_closer"
              ? "step_closer"
              : "step_back"
            : lastFraming;
      for (const ev of events) {
        console.info(`[aura] gesture ${ev.type} in ${o.state}`);
        switch (ev.type) {
          case "wave":
            o.send({ type: "WAVE", side: ev.side });
            break;
          default: {
            const event = gestureEvent(ev.type, o.state);
            if (event) o.send(event);
            break;
          }
        }
      }
      progressRef.current = engine.currentProgress;

      fpsCount++;
      if (now - fpsWindowStart >= 1000) {
        detectFps = Math.round((fpsCount * 1000) / (now - fpsWindowStart));
        fpsCount = 0;
        fpsWindowStart = now;
      }
      if (now - lastDebugPush >= 1000 / DEBUG_FPS) {
        lastDebugPush = now;
        const d = engine.debug;
        setDebug({
          ...d,
          status: "running",
          detectFps,
          landmarks,
          personSeen,
          cooldownMs: Math.max(0, cooldownUntil.current - Date.now()),
          frame: { width, height },
          poseBoxes: lastBoxes,
          framing: shownFraming,
        });
      }
    };

    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      recognizer?.close();
      cropRecognizer?.close();
      pose?.close();
    };
  }, [opts.cameraLive]);

  return { status, progressRef, poseBoxesRef, posesRef, debug: { ...debug, status } };
}
