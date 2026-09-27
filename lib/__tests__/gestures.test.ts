import { describe, expect, it } from "vitest";
import { GestureEngine, allowedGestures, type EngineGesture, type GestureEvent, type HandObservation, type ObservationFrame, type PoseObservation } from "@/lib/kiosk/gestureEngine";
import { gesturesForState } from "@/lib/kiosk/machine";

const IDLE = allowedGestures(gesturesForState("SPINNING"), true);
const RESULT = allowedGestures(gesturesForState("RESULT"), false);
/** Greeting: only the scan / battle signs count (a thumbs up there does nothing). */
const GREETING = allowedGestures(gesturesForState("GREETING"), false);

function hand(gesture: string, x: number, handedness = "Right", score = 0.9): HandObservation {
  return { gesture, score, wristX: x, wristY: 0.5, handedness };
}

function frame(t: number, hands: HandObservation[], poses: { x: number; y: number }[][] = [], mirrored = true, framed?: boolean[]): ObservationFrame {
  return { t, hands, poses: poses.map((wrists, i) => ({ wrists, framed: framed?.[i] })), mirrored };
}

const PEACE = [hand("Victory", 0.4, "Left"), hand("Victory", 0.6, "Right")];

/** 15fps frames where `pick(i)` chooses the hands of frame i (tracker flicker). */
function flicker(engine: GestureEngine, pick: (i: number) => HandObservation[], ms: number, framed?: boolean[], poses?: { x: number; y: number }[][]) {
  const events: GestureEvent[] = [];
  for (let i = 0, t = 0; t <= ms; i++, t += 66) events.push(...engine.update(frame(t, pick(i), poses, true, framed), IDLE));
  return events;
}

/** Feed identical frames at 15fps for `ms`. */
function hold(engine: GestureEngine, hands: HandObservation[], ms: number, allowed = IDLE, start = 0, poses?: { x: number; y: number }[][]) {
  const events = [];
  for (let t = start; t <= start + ms; t += 66) events.push(...engine.update(frame(t, hands, poses), allowed));
  return events;
}

describe("gesture engine", () => {
  it("fires double peace after a 600ms hold of two Victory hands", () => {
    const e = new GestureEngine();
    expect(hold(e, PEACE, 500)).toEqual([]);
    const events = hold(e, PEACE, 200, IDLE, 566);
    expect(events).toEqual([{ type: "double_peace", person: 0 }]);
  });

  it("still fills through tracker flicker (every other frame lost)", () => {
    const e = new GestureEngine();
    const events = flicker(e, (i) => (i % 2 === 0 ? PEACE : []), 1000);
    expect(events).toEqual([{ type: "double_peace", person: 0 }]);
  });

  it("keeps filling when one hand of the double peace keeps dropping out", () => {
    const e = new GestureEngine();
    const events = flicker(e, (i) => (i % 3 === 0 ? PEACE : [PEACE[1]]), 1000);
    expect(events).toEqual([{ type: "double_peace", person: 0 }]);
  });

  it("a quick flash of double peace does not scan", () => {
    const e = new GestureEngine();
    expect(flicker(e, (i) => (i < 3 ? PEACE : []), 1500)).toEqual([]);
    expect(e.currentProgress.value).toBe(0);
  });

  it("ignores low-confidence Victory and single hands", () => {
    const e = new GestureEngine();
    expect(hold(e, [hand("Victory", 0.4, "Left", 0.5), hand("Victory", 0.6, "Right", 0.5)], 1500)).toEqual([]);
    expect(hold(e, [hand("Victory", 0.5)], 1500, IDLE, 2000)).toEqual([]);
  });

  it("drains progress when the gesture is released", () => {
    const e = new GestureEngine();
    hold(e, PEACE, 250);
    expect(e.currentProgress.gesture).toBe("double_peace");
    expect(e.currentProgress.value).toBeGreaterThan(0.3);
    // Releasing mid-hold does not complete the scan and drains back to zero.
    expect(hold(e, [], 1000, IDLE, 316)).toEqual([]);
    expect(e.currentProgress.value).toBe(0);
    // Holding again from the drained value must not fire instantly.
    expect(hold(e, PEACE, 250, IDLE, 1400)).toEqual([]);
  });

  it("only scans a person whose whole fit is framed", () => {
    const e = new GestureEngine();
    const pose = [[{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }]];
    expect(flicker(e, () => PEACE, 1000, [false], pose)).toEqual([]);
    expect(e.debug.unframedPeople).toEqual([0]);
    const e2 = new GestureEngine();
    expect(flicker(e2, () => PEACE, 1000, [true], pose)).toEqual([{ type: "double_peace", person: 0 }]);
    expect(e2.debug.unframedPeople).toEqual([]);
  });

  it("does not fire gestures that the state does not allow", () => {
    const e = new GestureEngine();
    expect(hold(e, [hand("Thumb_Up", 0.5)], 2000, GREETING)).toEqual([]);
    expect(hold(e, [hand("Thumb_Up", 0.5)], 1200, RESULT, 3000)).toEqual([{ type: "thumb_up" }]);
  });

  it("thumbs down and open palm need a one second hold in RESULT", () => {
    const e = new GestureEngine();
    expect(hold(e, [hand("Thumb_Down", 0.5)], 900, RESULT)).toEqual([]);
    expect(hold(e, [hand("Thumb_Down", 0.5)], 200, RESULT, 900)).toEqual([{ type: "thumb_down" }]);
  });

  it("open palm (end session) needs a deliberate 1.5s hold and is not bridged", () => {
    const e = new GestureEngine();
    expect(hold(e, [hand("Open_Palm", 0.5)], 1300, RESULT)).toEqual([]);
    expect(hold(e, [hand("Open_Palm", 0.5)], 300, RESULT, 1366)).toEqual([{ type: "open_palm" }]);
    // Relaxed hands / waves that read as Open_Palm on and off never end the session.
    const e2 = new GestureEngine();
    const events: GestureEvent[] = [];
    for (let i = 0, t = 0; t <= 5000; i++, t += 66) events.push(...e2.update(frame(t, i % 2 === 0 ? [hand("Open_Palm", 0.5)] : []), RESULT));
    expect(events).toEqual([]);
  });

  it("only ends the session with a palm raised above the waist", () => {
    // Shoulders at 0.3, hips at 0.7: the waistline sits at 0.3 + 0.7 * 0.4 = 0.58.
    const palmAt = (wristY: number) => {
      const e = new GestureEngine();
      const events: GestureEvent[] = [];
      for (let t = 0; t <= 2000; t += 66) {
        events.push(
          ...e.update({ t, hands: [{ ...hand("Open_Palm", 0.5), wristY }], poses: [{ wrists: [{ x: 0.5, y: wristY }], shoulderY: 0.3, hipY: 0.7 }], mirrored: true }, RESULT),
        );
      }
      return events;
    };
    expect(palmAt(0.72)).toEqual([]); // hanging relaxed at the hips
    expect(palmAt(0.62)).toEqual([]); // just below the waist
    expect(palmAt(0.45)).toEqual([{ type: "open_palm" }]); // raised to the chest
    expect(palmAt(0.2)).toEqual([{ type: "open_palm" }]); // up high
  });

  it("enters a refractory period after firing", () => {
    const e = new GestureEngine();
    const hands = [hand("Victory", 0.4, "Left"), hand("Victory", 0.6, "Right")];
    const first = hold(e, hands, 1000);
    expect(first.filter((ev) => ev.type === "double_peace")).toHaveLength(1);
    const second = hold(e, hands, 1000, IDLE, 1000);
    expect(second).toEqual([]);
  });

  it("detects a battle when two people both hold double peace, assigning hands by nearest wrist", () => {
    const e = new GestureEngine();
    const poses = [
      [
        { x: 0.2, y: 0.5 },
        { x: 0.3, y: 0.5 },
      ],
      [
        { x: 0.7, y: 0.5 },
        { x: 0.8, y: 0.5 },
      ],
    ];
    const hands = [hand("Victory", 0.18, "Left"), hand("Victory", 0.32, "Right"), hand("Victory", 0.68, "Left"), hand("Victory", 0.82, "Right")];
    const events = hold(e, hands, 1000, IDLE, 0, poses);
    expect(events).toEqual([{ type: "battle" }]);
    expect(e.debug.personCount).toBe(2);
    expect(e.debug.hands.map((h) => h.person)).toEqual([0, 0, 1, 1]);
  });

  it("detects a wave from three direction reversals with enough travel", () => {
    const e = new GestureEngine();
    const events: GestureEvent[] = [];
    // Wrist sweeps left-right-left-right over ~1s: 0.3 -> 0.5 -> 0.3 -> 0.5 -> 0.3
    const path = [0.3, 0.35, 0.4, 0.45, 0.5, 0.45, 0.4, 0.35, 0.3, 0.35, 0.4, 0.45, 0.5, 0.45, 0.4, 0.35, 0.3];
    path.forEach((x, i) => events.push(...e.update(frame(i * 66, [hand("Open_Palm", x, "Right", 0.8)]), IDLE)));
    const waves = events.filter((ev) => ev.type === "wave");
    expect(waves).toHaveLength(1);
    // Raw x 0.3 mirrored on screen = 0.7 -> right side.
    expect(waves[0]).toMatchObject({ type: "wave", side: "right" });
  });

  it("ignores jitter below the travel threshold and reports the unmirrored side", () => {
    const e = new GestureEngine();
    const events: GestureEvent[] = [];
    const jitter = [0.5, 0.51, 0.5, 0.51, 0.5, 0.51, 0.5, 0.51, 0.5, 0.51, 0.5, 0.51];
    jitter.forEach((x, i) => events.push(...e.update(frame(i * 66, [hand("Open_Palm", x)], [], false), IDLE)));
    expect(events).toEqual([]);
    const e2 = new GestureEngine();
    const path = [0.2, 0.3, 0.2, 0.3, 0.2, 0.3, 0.2];
    const ev2: GestureEvent[] = [];
    path.forEach((x, i) => ev2.push(...e2.update(frame(i * 100, [hand("Open_Palm", x)], [], false), IDLE)));
    expect(ev2[0]).toMatchObject({ type: "wave", side: "left" });
  });

  it("waves even when classification flickers to None and handedness flips", () => {
    const engine = new GestureEngine();
    const allowed = new Set<EngineGesture>(["wave"]);
    const xs = [0.3, 0.36, 0.42, 0.36, 0.3, 0.36, 0.42, 0.36, 0.3, 0.36, 0.42];
    const events: GestureEvent[] = [];
    xs.forEach((x, i) => {
      const hand = {
        gesture: i % 3 === 1 ? "None" : "Open_Palm",
        score: i % 3 === 1 ? 0 : 0.9,
        wristX: x,
        wristY: 0.5,
        handedness: i % 2 === 0 ? "Left" : "Right",
      };
      events.push(...engine.update({ t: 1000 + i * 100, hands: [hand], poses: [], mirrored: false }, allowed));
    });
    expect(events.filter((ev) => ev.type === "wave")).toHaveLength(1);
  });

  it("needs both battlers framed, and never falls back to a single scan", () => {
    const poses = [
      [{ x: 0.2, y: 0.5 }, { x: 0.3, y: 0.5 }],
      [{ x: 0.7, y: 0.5 }, { x: 0.8, y: 0.5 }],
    ];
    const hands = [hand("Victory", 0.18, "Left"), hand("Victory", 0.32, "Right"), hand("Victory", 0.68, "Left"), hand("Victory", 0.82, "Right")];
    const e = new GestureEngine();
    expect(flicker(e, () => hands, 1500, [true, false], poses)).toEqual([]);
    expect(e.debug.unframedPeople).toEqual([1]);
    const e2 = new GestureEngine();
    expect(flicker(e2, () => hands, 1000, [true, true], poses)).toEqual([{ type: "battle" }]);
  });

  describe("battle participation", () => {
    const FISTS_A = [hand("Closed_Fist", 0.18, "Left"), hand("Closed_Fist", 0.32, "Right")];
    const PEACE_B = [hand("Victory", 0.68, "Left"), hand("Victory", 0.82, "Right")];
    const FISTS_B = [hand("Closed_Fist", 0.68, "Left"), hand("Closed_Fist", 0.82, "Right")];
    const twoPeople = (b: { framed?: boolean; facing?: boolean } = {}): PoseObservation[] => [
      { wrists: [{ x: 0.2, y: 0.5 }, { x: 0.3, y: 0.5 }], framed: true, facing: true },
      { wrists: [{ x: 0.7, y: 0.5 }, { x: 0.8, y: 0.5 }], framed: b.framed ?? true, facing: b.facing ?? true },
    ];
    const run = (hands: HandObservation[], poses: PoseObservation[], ms = 1500) => {
      const e = new GestureEngine();
      const events: GestureEvent[] = [];
      for (let t = 0; t <= ms; t += 66) events.push(...e.update({ t, hands, poses, mirrored: true }, IDLE));
      return { e, events };
    };

    it("clowns one person holding two fists with nobody else in frame (no battle)", () => {
      const solo = [hand("Closed_Fist", 0.4, "Left"), hand("Closed_Fist", 0.6, "Right")];
      const { events } = run(solo, [{ wrists: [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }], framed: true, facing: true }]);
      expect(events).toEqual([{ type: "solo_battle" }]);
    });

    it("starts a battle only when both people hold a battle sign", () => {
      expect(run([...FISTS_A, ...FISTS_B], twoPeople()).events).toEqual([{ type: "battle" }]);
      // Fists vs double peace also counts: both obviously want in.
      expect(run([...FISTS_A, ...PEACE_B], twoPeople()).events).toEqual([{ type: "battle" }]);
    });

    it("waits (no battle, no scan, no solo roast) when the other person is not in on it", () => {
      const { e, events } = run(FISTS_A, twoPeople());
      expect(events).toEqual([]);
      expect(e.debug.battleWaiting).toBe(true);
    });

    it("never drags in someone with their back turned or half out of frame", () => {
      expect(run([...FISTS_A, ...FISTS_B], twoPeople({ facing: false })).events).toEqual([]);
      expect(run([...FISTS_A, ...PEACE_B], twoPeople({ framed: false })).events).toEqual([]);
    });
  });

  describe("waving needs a raised open palm", () => {
    const sweep = [0.3, 0.38, 0.46, 0.38, 0.3, 0.38, 0.46, 0.38, 0.3, 0.38, 0.46];
    /** shoulderY null: no pose detected for the hand. */
    const wave = (wristY: number, gesture = "Open_Palm", shoulderY: number | null = 0.4) => {
      const e = new GestureEngine();
      const events: GestureEvent[] = [];
      sweep.forEach((x, i) => {
        const h = { gesture, score: gesture === "None" ? 0 : 0.9, wristX: x, wristY, handedness: "Right" };
        const poses = shoulderY === null ? [] : [{ wrists: [{ x, y: wristY }], shoulderY }];
        events.push(...e.update({ t: i * 100, hands: [h], poses, mirrored: false }, IDLE));
      });
      return events.filter((ev) => ev.type === "wave");
    };

    it("counts a raised hand swinging side to side", () => {
      expect(wave(0.3)).toHaveLength(1);
    });

    it("ignores relaxed or chest-height hands, even with a palm out", () => {
      expect(wave(0.55)).toEqual([]);
      expect(wave(0.45)).toEqual([]);
    });

    it("never starts a wave from blurred None frames alone", () => {
      expect(wave(0.3, "None")).toEqual([]);
    });

    it("skips the height check when the pose is unknown", () => {
      expect(wave(0.55, "Open_Palm", null)).toHaveLength(1);
    });

    it("ignores small swings", () => {
      const e = new GestureEngine();
      const events: GestureEvent[] = [];
      [0.3, 0.34, 0.3, 0.34, 0.3, 0.34, 0.3, 0.34].forEach((x, i) =>
        events.push(...e.update({ t: i * 100, hands: [hand("Open_Palm", x)], poses: [], mirrored: false }, IDLE)),
      );
      expect(events).toEqual([]);
    });
  });

  it("does not wave while palms are not allowed (result states)", () => {
    const e = new GestureEngine();
    const events: GestureEvent[] = [];
    const path = [0.2, 0.3, 0.2, 0.3, 0.2, 0.3, 0.2];
    path.forEach((x, i) => events.push(...e.update(frame(i * 100, [hand("Open_Palm", x)]), RESULT)));
    expect(events.filter((ev) => ev.type === "wave")).toEqual([]);
  });
  it("a long wave never fills the open palm (the always-on end session)", () => {
    // READY takes both the wave and the palm: 3 s of waving must only wave.
    const READY = allowedGestures(gesturesForState("READY"), true);
    const e = new GestureEngine();
    const events: GestureEvent[] = [];
    const sweep = [0.3, 0.35, 0.4, 0.45, 0.5, 0.45, 0.4, 0.35];
    for (let i = 0; i * 66 <= 3000; i++) events.push(...e.update(frame(i * 66, [hand("Open_Palm", sweep[i % sweep.length], "Right", 0.8)]), READY));
    expect(events.some((ev) => ev.type === "wave")).toBe(true);
    expect(events.filter((ev) => ev.type === "open_palm")).toEqual([]);
    // A still, raised palm afterwards still ends the session.
    const still = hold(e, [hand("Open_Palm", 0.4, "Right", 0.8)], 1800, READY, 5600);
    expect(still).toEqual([{ type: "open_palm" }]);
  });
});
