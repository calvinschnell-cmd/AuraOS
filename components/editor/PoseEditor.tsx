"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { generateOutfit } from "@/lib/clothing/generator";
import { THEMES } from "@/lib/clothing/themes";
import { SLOTS, type Outfit, type Slot } from "@/lib/clothing/types";
import { AnimationPlayer, resolvePose, type ResolvedPose } from "@/lib/mannequin/animation";
import { MannequinScene } from "@/lib/mannequin/scene";
import { ANIMATION_PRESETS, IDOL_POSES, JOINT_NAMES, POSE_PRESETS, WAVE_ANIM_L, WAVE_ANIM_R, type Animation, type JointName, type Pose } from "@/lib/poses";
import { COSTUME_ANIMATION_PRESETS } from "@/lib/costumePoses";
import { randomSeed } from "@/lib/prng";

const ALL_ANIMS: Record<string, Animation> = { ...ANIMATION_PRESETS, ...COSTUME_ANIMATION_PRESETS };
const AXES = ["x", "y", "z"] as const;

type Locks = Partial<Record<Slot, boolean>>;

/** Pose JSON in the exact lib/poses.ts format (only non-zero joints). */
function poseToJson(p: ResolvedPose): string {
  const joints: Record<string, number[]> = {};
  for (const j of JOINT_NAMES) {
    const r = p.joints[j].map((v) => Math.round(v));
    if (r.some((v) => v !== 0)) joints[j] = r;
  }
  const out: Record<string, unknown> = { joints };
  if (p.root.some((v) => Math.abs(v) > 0.0005)) out.root = p.root.map((v) => Math.round(v * 1000) / 1000);
  if (Math.abs(p.yaw) > 0.5) out.yaw = Math.round(p.yaw);
  out.hands = { L: p.hands.L, R: p.hands.R };
  return JSON.stringify(out, null, 2);
}

/**
 * /pose-editor: orbit the mannequin, drag every joint axis, load presets,
 * copy pose JSON, scrub animations, dress it, and check garment clipping.
 */
export default function PoseEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<MannequinScene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [ready, setReady] = useState(false);
  const [pose, setPose] = useState<ResolvedPose>(() => resolvePose(POSE_PRESETS.idle));
  const [preset, setPreset] = useState("idle");
  const [anim, setAnim] = useState("waveL");
  const [speed, setSpeed] = useState(1);
  const [scrub, setScrub] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(() => randomSeed());
  const [theme, setTheme] = useState<string>("");
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [locks, setLocks] = useState<Locks>({});
  const [hidden, setHidden] = useState<Partial<Record<Slot, boolean>>>({});
  const [clothesVisible, setClothesVisible] = useState(true);
  const [clips, setClips] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  // Scene + orbit controls.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new MannequinScene(canvas, { mode: "solid" });
    scene.setTextBand(false);
    scene.setIdle(0);
    scene.setYaw(0);
    scene.setManualPose(POSE_PRESETS.idle);
    sceneRef.current = scene;
    const controls = new OrbitControls(scene.camera, canvas);
    controls.target.set(0, 0.95, 0);
    controls.enableDamping = true;
    controlsRef.current = controls;
    let raf = 0;
    const loop = () => {
      controls.update();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setReady(true);
    return () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      scene.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, []);

  // Outfit.
  useEffect(() => {
    if (!ready) return;
    const next = generateOutfit(seed, theme ? { theme } : {});
    setOutfit((prev) => {
      const merged = prev ? { ...next, ...Object.fromEntries(SLOTS.filter((s) => locks[s]).map((s) => [s, prev[s]])) } : next;
      sceneRef.current?.setOutfit(merged as Outfit);
      return merged as Outfit;
    });
    // locks intentionally not a dependency: they apply on the next reroll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, seed, theme]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const slot of SLOTS) scene.setSlotVisible(slot, clothesVisible && !hidden[slot]);
  }, [hidden, clothesVisible, outfit]);

  // Manual pose -> scene (unless an animation is playing).
  useEffect(() => {
    if (playing) return;
    sceneRef.current?.setManualPose(pose);
  }, [pose, playing]);

  const setJoint = (j: JointName, axis: 0 | 1 | 2, v: number) =>
    setPose((p) => {
      const r = [...p.joints[j]] as [number, number, number];
      r[axis] = v;
      return { ...p, joints: { ...p.joints, [j]: r } };
    });

  const loadPreset = (name: string) => {
    setPreset(name);
    setPlaying(false);
    setPose(resolvePose(POSE_PRESETS[name]));
  };

  const currentAnim = ALL_ANIMS[anim];
  const animDuration = useMemo(() => (currentAnim ? AnimationPlayer.durationOf(currentAnim) : 0), [currentAnim]);

  const play = () => {
    const scene = sceneRef.current;
    if (!scene || !currentAnim) return;
    setPlaying(true);
    scene.setManualPose(null);
    scene.player.rate = speed;
    scene.play(currentAnim, 200);
  };
  const stop = () => {
    setPlaying(false);
    const scene = sceneRef.current;
    if (scene) scene.player.rate = 1;
  };
  const onScrub = (t: number) => {
    setScrub(t);
    setPlaying(false);
    if (currentAnim) setPose(AnimationPlayer.sample(currentAnim, t));
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(poseToJson(pose));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  /** Garment parts intersecting hand/finger bounding volumes in wave, peace and idol poses. */
  const runClippingCheck = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const poses: [string, Pose][] = [
      ["waveL", WAVE_ANIM_L.keyframes[1].pose],
      ["waveR", WAVE_ANIM_R.keyframes[1].pose],
      ...IDOL_POSES.map((p, i) => [`idol${i + 1}`, p] as [string, Pose]),
    ];
    const findings: string[] = [];
    const handBox = new THREE.Box3();
    const partBox = new THREE.Box3();
    for (const [name, p] of poses) {
      scene.setManualPose(p);
      scene.rig.applyPose(resolvePose(p));
      scene.rig.root.updateWorldMatrix(true, true);
      for (const side of ["L", "R"] as const) {
        handBox.setFromObject(scene.rig.hands[side].hand);
        for (const slot of SLOTS) {
          for (const part of scene.slotParts(slot)) {
            partBox.setFromObject(part.mesh);
            if (partBox.intersectsBox(handBox)) {
              findings.push(`${name}: ${slot} (${outfit?.[slot].type ?? "?"}) touches hand ${side}`);
              break;
            }
          }
        }
      }
    }
    scene.setManualPose(pose);
    setClips([...new Set(findings)]);
  }, [outfit, pose]);

  return (
    <main className="editor">
      <div className="editor__stage">
        <canvas ref={canvasRef} className="editor__canvas" />
      </div>
      <aside className="editor__panel">
        <section className="editor__section">
          <div className="editor__heading">POSE</div>
          <div className="editor__row">
            <select value={preset} onChange={(e) => loadPreset(e.target.value)}>
              {Object.keys(POSE_PRESETS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button type="button" onClick={copyJson}>
              {copied ? "[COPIED]" : "[COPY POSE JSON]"}
            </button>
          </div>
          <div className="editor__sliders">
            {JOINT_NAMES.map((j) => (
              <div key={j} className="editor__joint">
                <span className="editor__joint-name">{j}</span>
                {AXES.map((axis, i) => (
                  <label key={axis} className="editor__slider">
                    <span>{axis}</span>
                    <input type="range" min={-180} max={180} step={1} value={pose.joints[j][i]} onChange={(e) => setJoint(j, i as 0 | 1 | 2, Number(e.target.value))} />
                    <span className="editor__value">{Math.round(pose.joints[j][i])}</span>
                  </label>
                ))}
              </div>
            ))}
            <div className="editor__joint">
              <span className="editor__joint-name">root</span>
              {AXES.map((axis, i) => (
                <label key={axis} className="editor__slider">
                  <span>{axis}</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={pose.root[i]}
                    onChange={(e) =>
                      setPose((p) => {
                        const r = [...p.root] as [number, number, number];
                        r[i] = Number(e.target.value);
                        return { ...p, root: r };
                      })
                    }
                  />
                  <span className="editor__value">{pose.root[i].toFixed(2)}</span>
                </label>
              ))}
              <label className="editor__slider">
                <span>yaw</span>
                <input type="range" min={-180} max={180} step={1} value={pose.yaw} onChange={(e) => setPose((p) => ({ ...p, yaw: Number(e.target.value) }))} />
                <span className="editor__value">{Math.round(pose.yaw)}</span>
              </label>
            </div>
            {(["L", "R"] as const).map((side) => (
              <div key={side} className="editor__joint">
                <span className="editor__joint-name">hand {side}</span>
                {(["peace", "open", "thumb"] as const).map((k) => (
                  <label key={k} className="editor__slider">
                    <span>{k}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={pose.hands[side][k]}
                      onChange={(e) => setPose((p) => ({ ...p, hands: { ...p.hands, [side]: { ...p.hands[side], [k]: Number(e.target.value) } } }))}
                    />
                    <span className="editor__value">{pose.hands[side][k].toFixed(2)}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="editor__section">
          <div className="editor__heading">ANIMATION</div>
          <div className="editor__row">
            <select value={anim} onChange={(e) => setAnim(e.target.value)}>
              {Object.keys(ALL_ANIMS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={1}>1x</option>
              <option value={0.25}>0.25x</option>
            </select>
            {playing ? (
              <button type="button" onClick={stop}>
                [STOP]
              </button>
            ) : (
              <button type="button" onClick={play}>
                [PLAY]
              </button>
            )}
          </div>
          <label className="editor__slider">
            <span>scrub</span>
            <input type="range" min={0} max={animDuration} step={10} value={scrub} onChange={(e) => onScrub(Number(e.target.value))} />
            <span className="editor__value">
              {scrub}/{animDuration}ms
            </span>
          </label>
        </section>

        <section className="editor__section">
          <div className="editor__heading">CLOTHING</div>
          <div className="editor__row">
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">any theme</option>
              <option value="chaos">chaos</option>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setSeed(randomSeed())}>
              [REROLL]
            </button>
            <button type="button" onClick={() => setClothesVisible((v) => !v)}>
              {clothesVisible ? "[HIDE CLOTHES]" : "[SHOW CLOTHES]"}
            </button>
          </div>
          <div className="editor__slots">
            {SLOTS.map((slot) => (
              <div key={slot} className="editor__slot">
                <span className="editor__slot-name">
                  {slot}: {outfit?.[slot].type ?? "-"}
                </span>
                <label>
                  <input type="checkbox" checked={Boolean(locks[slot])} onChange={(e) => setLocks((l) => ({ ...l, [slot]: e.target.checked }))} /> lock
                </label>
                <label>
                  <input type="checkbox" checked={!hidden[slot]} onChange={(e) => setHidden((h) => ({ ...h, [slot]: !e.target.checked }))} /> show
                </label>
              </div>
            ))}
          </div>
          <div className="font-mono text-[10px] opacity-70">
            seed {outfit?.seed} · theme {outfit?.theme} · {outfit?.wildcards.join(", ")}
          </div>
        </section>

        <section className="editor__section">
          <div className="editor__heading">CLIPPING CHECK</div>
          <button type="button" onClick={runClippingCheck}>
            [CHECK WAVE / PEACE / IDOL POSES]
          </button>
          {clips && (
            <ul className="editor__clips">
              {clips.length === 0 && <li>no garment touches the hands or fingers</li>}
              {clips.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </main>
  );
}
