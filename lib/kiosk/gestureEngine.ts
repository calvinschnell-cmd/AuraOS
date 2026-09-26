import type { GestureId, ScreenSide } from "./types";

/**
 * Pure gesture engine. Feed it one observation frame at a time (from the
 * MediaPipe runtime or from tests) and it emits kiosk gesture events.
 *
 * - Every hold gesture fills a progress value while it is seen and drains it
 *   while it is not; reaching 1 fires the event and enters a refractory period.
 *   Tracker dropouts of the scan gestures (`bridged`) are bridged at
 *   `bridgeFill` speed: they keep filling for `graceMs` after last seen, and a double peace keeps filling on
 *   one visible Victory hand for `oneHandGraceMs` after both were seen. A real
 *   release therefore stops the ring instead of snapping it back to zero.
 * - Scan and battle only count people whose pose is fully framed (when the
 *   runtime supplies `framed`), so nobody is judged half out of frame.
 * - A battle needs two people who both want in: each framed, facing the
 *   camera and holding a battle sign (two fists or double peace). One person
 *   holding two fists with nobody else in frame is a solo battle (the kiosk
 *   clowns them); with a second person who is not in on it, the engine waits.
 * - A wave is a raised Open_Palm hand (wrist at or above shoulder height when
 *   the pose is known) whose wrist x reverses direction at least
 *   `waveReversals` times within `waveWindowMs`, ignoring jitter below
 *   `waveMinTravel` (normalized image units). A wave track only starts on a
 *   confident Open_Palm; blurred "None" frames can continue one, never start
 *   one, so relaxed or walking hands do not wave.
 * - Hands are assigned to people by the nearest pose wrist landmark.
 */

export type EngineGesture = GestureId | "battle" | "solo_battle";

/** MediaPipe canned gesture names we use. */
export type GestureLabel = "Victory" | "Open_Palm" | "Thumb_Up" | "Thumb_Down" | "Closed_Fist" | "Pointing_Up" | "ILoveYou" | "None" | string;

export interface HandObservation {
  gesture: GestureLabel;
  score: number;
  /** Wrist position, normalized 0-1 in the upright (rotated) image, unmirrored. */
  wristX: number;
  wristY: number;
  handedness: "Left" | "Right" | string;
}

export interface PoseObservation {
  /** Wrist positions (left and right), normalized 0-1. */
  wrists: { x: number; y: number }[];
  /** Whole fit in frame at a readable size (framing.ts). Missing means unknown: treated as framed. */
  framed?: boolean;
  /** Facing the camera (framing.ts isFacingCamera). Missing means unknown: treated as facing. */
  facing?: boolean;
  /** Mean shoulder height, normalized 0-1 (y grows downward). Missing: the raised-hand check is skipped. */
  shoulderY?: number;
}

export interface ObservationFrame {
  /** Milliseconds (monotonic). */
  t: number;
  hands: HandObservation[];
  poses: PoseObservation[];
  /** True when the display mirrors the camera (digital flip or a real mirror). */
  mirrored: boolean;
}

export type GestureEvent =
  | { type: "double_peace"; person: number }
  | { type: "battle" }
  /** Two fists held up with nobody else in frame. */
  | { type: "solo_battle" }
  | { type: "wave"; side: ScreenSide; x: number }
  | { type: "thumb_up" }
  | { type: "thumb_down" }
  | { type: "open_palm" };

export interface EngineConfig {
  holdMs: Record<EngineGesture, number>;
  victoryScore: number;
  palmScore: number;
  thumbScore: number;
  /** Progress drains this many times faster than it fills (after the grace window). */
  drainRate: number;
  /** A hold gesture still counts as seen this long after the tracker loses it. */
  graceMs: number;
  /** Double peace keeps filling on a single Victory hand this long after both hands were seen. */
  oneHandGraceMs: number;
  /** Fill speed (fraction of normal) while a gesture is only bridged, not seen. */
  bridgeFill: number;
  /**
   * Gestures whose dropouts are bridged. Only the scan gestures: session
   * gestures (open palm ends the session) stay strict so relaxed hands and
   * waves never trigger them.
   */
  bridged: readonly EngineGesture[];
  refractoryMs: number;
  waveWindowMs: number;
  waveReversals: number;
  waveMinTravel: number;
  waveRefractoryMs: number;
  /** A waving wrist may sit at most this far below the shoulders (normalized y). */
  waveRaiseMargin: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  // double_fist is an alias that feeds the battle hold, so it has no hold of its own.
  holdMs: { double_peace: 600, battle: 750, solo_battle: 750, thumb_up: 1000, thumb_down: 1000, open_palm: 1500, wave: 0, double_fist: 0 },
  victoryScore: 0.55,
  palmScore: 0.5,
  thumbScore: 0.6,
  drainRate: 2,
  graceMs: 250,
  oneHandGraceMs: 400,
  bridgeFill: 0.5,
  bridged: ["double_peace", "battle", "solo_battle"],
  refractoryMs: 1500,
  waveWindowMs: 2000,
  waveReversals: 3,
  waveMinTravel: 0.06,
  waveRefractoryMs: 2500,
  waveRaiseMargin: 0.03,
};

/** A confident open palm: the only thing that can start a wave track. */
function isOpenPalm(h: HandObservation, palmScore: number): boolean {
  return h.gesture === "Open_Palm" && h.score >= palmScore;
}

/**
 * Motion blur drops many frames of a real wave to "None": those may continue
 * an existing wave track, but never start one. Deliberate signs never wave.
 */
function mayContinueWave(h: HandObservation, palmScore: number): boolean {
  return isOpenPalm(h, palmScore) || h.gesture === "None";
}

export interface Progress {
  gesture: EngineGesture | null;
  value: number;
}

export interface HandDebug {
  gesture: string;
  score: number;
  handedness: string;
  person: number;
  x: number;
  y: number;
}

export interface EngineDebug {
  hands: HandDebug[];
  personCount: number;
  waveReversals: number;
  progress: Progress;
  lastEvent: string | null;
  /** People holding a scan/battle gesture who are not fully framed (the runtime shows STEP BACK / COME CLOSER). */
  unframedPeople: number[];
  /** Someone is holding up two fists but the other person in frame is not in on the battle yet. */
  battleWaiting: boolean;
}

interface WaveSample {
  t: number;
  x: number;
}

interface WaveTrack {
  samples: WaveSample[];
  /** Extremes (turning points) with their times. */
  reversals: number[];
  lastDir: number;
  extremeX: number;
  lastSeen: number;
}

const HOLD_GESTURES: EngineGesture[] = ["battle", "solo_battle", "double_peace", "thumb_up", "thumb_down", "open_palm"];

export class GestureEngine {
  private progress = new Map<EngineGesture, number>();
  private refractoryUntil = new Map<EngineGesture, number>();
  /** Last time each hold gesture was actually detected (not bridged). */
  private lastSeenAt = new Map<EngineGesture, number>();
  private waves = new Map<string, WaveTrack>();
  private waveRefractoryUntil = 0;
  private lastT: number | null = null;
  private lastEvent: string | null = null;
  private lastDebug: EngineDebug = { hands: [], personCount: 0, waveReversals: 0, progress: { gesture: null, value: 0 }, lastEvent: null, unframedPeople: [], battleWaiting: false };

  constructor(private readonly config: EngineConfig = DEFAULT_ENGINE_CONFIG) {
    for (const g of HOLD_GESTURES) this.progress.set(g, 0);
  }

  /** Existing wave track of this person closest to x (within reach), else a fresh key (null when `existingOnly`). */
  private waveTrackKey(person: number, x: number, taken: Set<string>, existingOnly = false): string | null {
    let best: string | null = null;
    let bestD = WAVE_TRACK_REACH;
    for (const [key, track] of this.waves) {
      if (!key.startsWith(`${person}:`) || taken.has(key)) continue;
      const d = Math.abs(track.extremeX - x);
      if (d < bestD) {
        bestD = d;
        best = key;
      }
    }
    if (best || existingOnly) return best;
    let n = 0;
    while (this.waves.has(`${person}:${n}`) || taken.has(`${person}:${n}`)) n++;
    return `${person}:${n}`;
  }

  /** Current ring state: the most advanced hold gesture. */
  get currentProgress(): Progress {
    let best: Progress = { gesture: null, value: 0 };
    for (const [g, v] of this.progress) if (v > best.value) best = { gesture: g, value: v };
    return best;
  }

  get debug(): EngineDebug {
    return this.lastDebug;
  }

  reset(): void {
    for (const g of HOLD_GESTURES) this.progress.set(g, 0);
    this.lastSeenAt.clear();
    this.waves.clear();
    this.lastT = null;
  }

  /**
   * Process one frame. `allowed` limits which gestures can fire (from the
   * kiosk state); disallowed gestures neither fill nor fire.
   */
  update(frame: ObservationFrame, allowed: ReadonlySet<EngineGesture>): GestureEvent[] {
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(250, frame.t - this.lastT));
    this.lastT = frame.t;
    const events: GestureEvent[] = [];
    const c = this.config;

    // ---- assign hands to people
    const personOf = frame.hands.map((h) => nearestPerson(h, frame.poses));
    const personCount = Math.max(frame.poses.length, frame.hands.length > 0 ? 1 : 0);

    const victoryByPerson = new Map<number, number>();
    const fistsByPerson = new Map<number, number>();
    let thumbUp = false;
    let thumbDown = false;
    let openPalm = false;
    frame.hands.forEach((h, i) => {
      if (h.gesture === "Victory" && h.score >= c.victoryScore) {
        victoryByPerson.set(personOf[i], (victoryByPerson.get(personOf[i]) ?? 0) + 1);
      }
      if (h.gesture === "Closed_Fist" && h.score >= c.palmScore) {
        fistsByPerson.set(personOf[i], (fistsByPerson.get(personOf[i]) ?? 0) + 1);
      }
      if (h.gesture === "Thumb_Up" && h.score >= c.thumbScore) thumbUp = true;
      if (h.gesture === "Thumb_Down" && h.score >= c.thumbScore) thumbDown = true;
      if (h.gesture === "Open_Palm" && h.score >= c.palmScore) openPalm = true;
    });
    const framed = (person: number) => frame.poses[person]?.framed ?? true;
    const facing = (person: number) => frame.poses[person]?.facing ?? true;
    const doublePeacePeople = [...victoryByPerson.entries()].filter(([, n]) => n >= 2).map(([p]) => p);
    const fistPeople = allowed.has("double_fist") ? [...fistsByPerson.entries()].filter(([, n]) => n >= 2).map(([p]) => p) : [];
    const unframedPeople = [...new Set([...doublePeacePeople, ...fistPeople])].filter((p) => !framed(p));
    // A battle needs two people who both want in: each framed, facing the
    // camera and holding a battle sign (two fists or double peace). Two
    // people asking for a battle never fall back to a single scan.
    const battlers = [...new Set([...doublePeacePeople, ...fistPeople])];
    const ready = battlers.filter((p) => framed(p) && facing(p));
    const battleSeen = ready.length >= 2;
    // Two fists with nobody else in frame: pulling up to a battle alone.
    const soloSeen = fistPeople.length === 1 && battlers.length === 1 && frame.poses.length <= 1 && framed(fistPeople[0]) && facing(fistPeople[0]);
    // Two fists up, but the other person in frame is not in on it (yet).
    const battleWaiting = fistPeople.length >= 1 && battlers.length === 1 && frame.poses.length >= 2;
    const doublePeaceSeen = doublePeacePeople.length === 1 && battlers.length === 1 && framed(doublePeacePeople[0]);

    const seen: Record<EngineGesture, boolean> = {
      battle: battleSeen,
      solo_battle: soloSeen,
      double_peace: doublePeaceSeen,
      double_fist: false,
      thumb_up: thumbUp,
      thumb_down: thumbDown,
      open_palm: openPalm,
      wave: false,
    };
    // Fill speed per gesture: 1 when seen, bridgeFill across tracker dropouts, else 0 (drain).
    const since = (g: EngineGesture) => frame.t - (this.lastSeenAt.get(g) ?? -Infinity);
    const fill = {} as Record<EngineGesture, number>;
    for (const g of HOLD_GESTURES) {
      if (seen[g]) this.lastSeenAt.set(g, frame.t);
      fill[g] = seen[g] ? 1 : c.bridged.includes(g) && since(g) <= c.graceMs ? c.bridgeFill : 0;
    }
    // One hand of a double peace dropped out: keep filling while a framed Victory hand is still up.
    const framedVictory = [...victoryByPerson.entries()].some(([p, n]) => n >= 1 && framed(p));
    if (c.bridged.includes("double_peace") && fill.double_peace === 0 && doublePeacePeople.length < 2 && framedVictory && since("double_peace") <= c.oneHandGraceMs) {
      fill.double_peace = c.bridgeFill;
    }
    if (fill.battle > 0) {
      fill.double_peace = 0;
      fill.solo_battle = 0;
    }

    // ---- hold progress
    for (const g of HOLD_GESTURES) {
      const isAllowed = allowed.has(g);
      const inRefractory = (this.refractoryUntil.get(g) ?? 0) > frame.t;
      let v = this.progress.get(g) ?? 0;
      if (isAllowed && fill[g] > 0 && !inRefractory && c.holdMs[g] > 0) {
        v += (dt * fill[g]) / c.holdMs[g];
      } else if (c.holdMs[g] > 0) {
        v -= (dt * c.drainRate) / c.holdMs[g];
      }
      v = Math.max(0, Math.min(1, v));
      if (v >= 1) {
        v = 0;
        this.refractoryUntil.set(g, frame.t + c.refractoryMs);
        if (g === "battle") {
          events.push({ type: "battle" });
          this.progress.set("double_peace", 0);
          this.progress.set("solo_battle", 0);
        } else if (g === "solo_battle") {
          events.push({ type: "solo_battle" });
        } else if (g === "double_peace") {
          events.push({ type: "double_peace", person: doublePeacePeople[0] ?? 0 });
        } else if (g === "thumb_up") events.push({ type: "thumb_up" });
        else if (g === "thumb_down") events.push({ type: "thumb_down" });
        else if (g === "open_palm") events.push({ type: "open_palm" });
      }
      this.progress.set(g, v);
    }

    // ---- waves
    let waveReversals = 0;
    if (allowed.has("wave")) {
      const seen = new Set<string>();
      frame.hands.forEach((h, i) => {
        if (!mayContinueWave(h, c.palmScore)) return;
        // A wave is a raised hand: relaxed hands, walking arms and a palm held
        // out at chest height never count.
        const shoulderY = frame.poses[personOf[i]]?.shoulderY;
        if (shoulderY !== undefined && h.wristY > shoulderY + c.waveRaiseMargin) return;
        // Tracks are keyed by person + nearest existing track, never by
        // handedness: MediaPipe flips Left/Right between frames, which used
        // to reset the swing count mid-wave. Only an open palm starts a track.
        const key = this.waveTrackKey(personOf[i], h.wristX, seen, !isOpenPalm(h, c.palmScore));
        if (key === null) return;
        seen.add(key);
        const track = this.waves.get(key) ?? { samples: [], reversals: [], lastDir: 0, extremeX: h.wristX, lastSeen: frame.t };
        this.waves.set(key, track);
        track.lastSeen = frame.t;
        track.samples.push({ t: frame.t, x: h.wristX });
        const cutoff = frame.t - c.waveWindowMs;
        track.samples = track.samples.filter((s) => s.t >= cutoff);
        track.reversals = track.reversals.filter((t) => t >= cutoff);
        // Direction tracking with a travel threshold to ignore jitter.
        const delta = h.wristX - track.extremeX;
        if (Math.abs(delta) >= c.waveMinTravel) {
          const dir = Math.sign(delta);
          if (track.lastDir !== 0 && dir !== track.lastDir) track.reversals.push(frame.t);
          track.lastDir = dir;
          track.extremeX = h.wristX;
        } else if (track.lastDir !== 0 && Math.sign(delta) === track.lastDir) {
          // keep extending the current swing
          track.extremeX = h.wristX;
        }
        waveReversals = Math.max(waveReversals, track.reversals.length);
        if (track.reversals.length >= c.waveReversals && frame.t >= this.waveRefractoryUntil) {
          this.waveRefractoryUntil = frame.t + c.waveRefractoryMs;
          const screenX = frame.mirrored ? 1 - h.wristX : h.wristX;
          events.push({ type: "wave", side: screenX < 0.5 ? "left" : "right", x: screenX });
          track.reversals = [];
        }
      });
      // Drop stale tracks (hand left the frame or stopped showing a palm).
      for (const [key, track] of this.waves) {
        if (!seen.has(key) && frame.t - track.lastSeen > 600) this.waves.delete(key);
      }
    } else {
      this.waves.clear();
    }

    if (events.length > 0) this.lastEvent = events.map((e) => e.type).join(",");
    this.lastDebug = {
      hands: frame.hands.map((h, i) => ({ gesture: h.gesture, score: h.score, handedness: h.handedness, person: personOf[i], x: h.wristX, y: h.wristY })),
      personCount,
      waveReversals,
      progress: this.currentProgress,
      lastEvent: this.lastEvent,
      unframedPeople,
      battleWaiting,
    };
    return events;
  }
}

const WAVE_TRACK_REACH = 0.25;

function nearestPerson(hand: HandObservation, poses: PoseObservation[]): number {
  if (poses.length <= 1) return 0;
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  poses.forEach((p, i) => {
    for (const w of p.wrists) {
      const d = (w.x - hand.wristX) ** 2 + (w.y - hand.wristY) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  });
  return best;
}

/** Which engine gestures may fire in a kiosk state (legend gestures + battle). */
export function allowedGestures(legend: readonly GestureId[], battleAllowed: boolean): Set<EngineGesture> {
  const set = new Set<EngineGesture>(legend);
  if (battleAllowed) {
    set.add("battle");
    set.add("solo_battle");
  }
  return set;
}
