"use client";

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import { createPoseLandmarker } from "@/lib/kiosk/vision";
import { useCamera } from "@/lib/kiosk/useCamera";
import { useSettings } from "@/lib/kiosk/useSettings";
import { snapshotArea, snapshotFromMediapipe, compactSnapshot, type PoseSnapshot } from "@/lib/pose/landmarks";
import { POSE_MODEL } from "@/lib/pose/model";
import { ARCHETYPES, scorePose, type ArchetypeId, type PoseResult } from "@/lib/pose/score";

const RECORD_MS = 3000;
const SAMPLE_EVERY_MS = 250;

/** Collect the latest pose every SAMPLE_EVERY_MS for RECORD_MS. */
async function collectSamples(read: () => PoseSnapshot | null): Promise<PoseSnapshot[]> {
  const samples: PoseSnapshot[] = [];
  for (let t = 0; t < RECORD_MS; t += SAMPLE_EVERY_MS) {
    const s = read();
    if (s) samples.push(compactSnapshot(s));
    await new Promise((r) => setTimeout(r, SAMPLE_EVERY_MS));
  }
  return samples;
}

/**
 * Pose lab (developer tool, hidden): the trained classifier's live read of the
 * camera (archetype, match %, pose score, dynamism signals), and a recorder
 * that saves labeled landmark samples from the kiosk's own camera to
 * ml-service/pose/recorded.jsonl. `npm run pose:train` folds them in, which
 * closes the gap between internet photos and the event camera.
 */
export default function PoseLab() {
  const [settings] = useSettings();
  const { status: cameraStatus, videoRef, attachVideo } = useCamera(settings.cameraDeviceId);
  const [live, setLive] = useState<PoseResult | null>(null);
  const [status, setStatus] = useState("LOADING POSE LANDMARKER...");
  const [recording, setRecording] = useState<ArchetypeId | null>(null);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const latest = useRef<PoseSnapshot | null>(null);
  const rotation = settings.cameraRotation;

  // Detection loop (~10 fps) on the rotated, upright frame (like the kiosk).
  useEffect(() => {
    if (cameraStatus !== "live") return;
    let landmarker: PoseLandmarker | null = null;
    let timer = 0;
    let cancelled = false;
    let lastTs = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    void createPoseLandmarker().then((l) => {
      if (cancelled) return l?.close();
      landmarker = l;
      setStatus(l ? "LIVE" : "POSE LANDMARKER UNAVAILABLE");
      const loop = () => {
        if (cancelled) return;
        timer = window.setTimeout(loop, 100);
        const video = videoRef.current;
        if (!landmarker || !video || video.readyState < 2 || !ctx) return;
        const sideways = rotation === 90 || rotation === 270;
        const w = sideways ? video.videoHeight : video.videoWidth;
        const h = sideways ? video.videoWidth : video.videoHeight;
        const k = Math.min(1, 640 / Math.max(w, h));
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(video, (-video.videoWidth * k) / 2, (-video.videoHeight * k) / 2, video.videoWidth * k, video.videoHeight * k);
        const ts = Math.max(performance.now(), lastTs + 1);
        lastTs = ts;
        const result = landmarker.detectForVideo(canvas, ts);
        const people = result.landmarks.map((lm) => snapshotFromMediapipe(lm, canvas.width / canvas.height)).filter((p): p is PoseSnapshot => p !== null);
        const main = people.sort((a, b) => snapshotArea(b) - snapshotArea(a))[0] ?? null;
        latest.current = main;
        setLive(main ? scorePose(POSE_MODEL, main) : null);
      };
      loop();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      landmarker?.close();
    };
  }, [cameraStatus, videoRef, rotation]);

  const record = async (category: ArchetypeId) => {
    setRecording(category);
    const samples = await collectSamples(() => latest.current);
    setRecording(null);
    if (samples.length === 0) return setStatus("NOBODY IN FRAME. NOTHING SAVED.");
    const res = await fetch("/api/pose-samples", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, samples }) });
    const body = (await res.json().catch(() => ({}))) as { saved?: number; error?: string };
    if (!res.ok) return setStatus(body.error ?? "SAVE FAILED.");
    setSaved((s) => ({ ...s, [category]: (s[category] ?? 0) + (body.saved ?? 0) }));
    setStatus(`SAVED ${body.saved} ${ARCHETYPES[category].label} SAMPLES. RUN npm run pose:train.`);
  };

  const probs = live && live.archetype !== "unknown" ? live : null;
  return (
    <main className="tool-page aura-grid-bg">
      <section className="os-window os-window--dark pose-lab">
        <header className="os-window__title">
          <span>POSE_LAB.EXE · {status}</span>
          <span>x</span>
        </header>
        <div className="os-window__body pose-lab__body">
          <video ref={attachVideo} className="pose-lab__video" style={{ transform: `rotate(${rotation}deg) scaleX(-1)` }} muted playsInline autoPlay />
          <div className="pose-lab__read">
            <div className="font-heading text-xs">LIVE CLASSIFIER ({POSE_MODEL.kind.toUpperCase()} · CV {Math.round(POSE_MODEL.meta.cvAccuracy * 100)}%)</div>
            {probs ? (
              <>
                <div className="pose-lab__score font-number aura-text-glow">{probs.score}</div>
                <div className="font-heading">
                  {probs.label} · {probs.match}% MATCH
                </div>
                <dl className="reveal-grid reveal-grid--compact">
                  {Object.entries(probs.signals ?? {}).map(([k, v]) => (
                    <div key={k} className="reveal-grid__row">
                      <dt>{k.toUpperCase()}</dt>
                      <dd>{Math.round(v * 100)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <div className="font-mono text-xs">{cameraStatus === "live" ? "STEP INTO FRAME, HEAD TO SHOES." : `CAMERA: ${cameraStatus.toUpperCase()}`}</div>
            )}
            <div className="font-heading text-xs mt-3">RECORD {RECORD_MS / 1000}S OF LABELED SAMPLES</div>
            <div className="pose-lab__buttons">
              {(Object.keys(ARCHETYPES) as ArchetypeId[]).map((a) => (
                <button key={a} type="button" className="card-page__button" disabled={recording !== null || !live} onClick={() => void record(a)}>
                  [{recording === a ? "RECORDING..." : ARCHETYPES[a].label}]{saved[a] ? ` ${saved[a]}` : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
