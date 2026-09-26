import { describe, expect, it } from "vitest";
import { frameDistance, handCropRect, mapCropPoint, poseHandAnchors } from "@/lib/kiosk/handCrops";

describe("hand crops", () => {
  it("reads both wrists and index fingers from a pose", () => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    lm[15] = { x: 0.3, y: 0.6, visibility: 0.8 };
    lm[19] = { x: 0.28, y: 0.55, visibility: 0.8 };
    lm[16] = { x: 0.7, y: 0.6, visibility: 0.2 };
    const anchors = poseHandAnchors(lm);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toMatchObject({ wrist: { x: 0.3, y: 0.6 }, index: { x: 0.28, y: 0.55 }, visibility: 0.8 });
    expect(anchors[1].visibility).toBe(0.2);
  });

  it("crops a square around the hand, never smaller than 12% of the long side", () => {
    const r = handCropRect({ wrist: { x: 0.5, y: 0.5 }, index: { x: 0.5, y: 0.48 }, visibility: 1 }, 360, 640);
    expect(r.size).toBe(Math.round(640 * 0.12));
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy).toBeGreaterThanOrEqual(0);
  });

  it("scales the crop with the hand and clamps it inside the frame", () => {
    const r = handCropRect({ wrist: { x: 0.98, y: 0.02 }, index: { x: 0.98, y: 0.2 }, visibility: 1 }, 360, 640);
    expect(r.sx + r.size).toBeLessThanOrEqual(360);
    expect(r.sy).toBe(0);
    expect(r.size).toBeGreaterThan(640 * 0.12);
  });

  it("maps crop landmarks back to frame coordinates", () => {
    const r = { sx: 100, sy: 200, size: 50 };
    const p = mapCropPoint({ x: 0.5, y: 1, z: 3 }, r, 400, 800);
    expect(p).toEqual({ x: 125 / 400, y: 250 / 800, z: 3 });
  });

  it("measures distance in long-side units", () => {
    expect(frameDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, 360, 640)).toBeCloseTo(360 / 640);
    expect(frameDistance({ x: 0, y: 0 }, { x: 0, y: 1 }, 360, 640)).toBeCloseTo(1);
  });
});
