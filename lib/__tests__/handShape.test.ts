import { describe, expect, it } from "vitest";
import { classifyHandShape, handExtent } from "@/lib/kiosk/handShape";

type F = "ext" | "curl";

/** Synthetic upright hand: wrist at the bottom, fingers pointing up (-y). */
function hand(fingers: [F, F, F, F], thumb: "tucked" | "up" | "down" | "out" = "tucked") {
  const pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
  pts[0] = { x: 0.5, y: 0.8 };
  const xs = [0.44, 0.5, 0.56, 0.62];
  const bases = [
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ];
  fingers.forEach((f, i) => {
    const [mcp, pip, dip, tip] = bases[i];
    const x = xs[i];
    pts[mcp] = { x, y: 0.6 };
    if (f === "ext") {
      pts[pip] = { x, y: 0.5 };
      pts[dip] = { x, y: 0.42 };
      pts[tip] = { x, y: 0.35 };
    } else {
      pts[pip] = { x, y: 0.55 };
      pts[dip] = { x, y: 0.58 };
      pts[tip] = { x, y: 0.62 };
    }
  });
  pts[1] = { x: 0.45, y: 0.75 };
  pts[2] = { x: 0.42, y: 0.7 };
  pts[3] = { x: 0.4, y: 0.66 };
  pts[4] = thumb === "tucked" ? { x: 0.5, y: 0.66 } : thumb === "up" ? { x: 0.35, y: 0.45 } : thumb === "down" ? { x: 0.35, y: 1.0 } : { x: 0.25, y: 0.72 };
  return pts;
}

describe("hand shape", () => {
  it("reads a peace sign", () => {
    expect(classifyHandShape(hand(["ext", "ext", "curl", "curl"]))).toBe("Victory");
  });

  it("reads an open palm", () => {
    expect(classifyHandShape(hand(["ext", "ext", "ext", "ext"], "out"))).toBe("Open_Palm");
  });

  it("reads a fist and thumbs up / down", () => {
    expect(classifyHandShape(hand(["curl", "curl", "curl", "curl"], "tucked"))).toBe("Closed_Fist");
    expect(classifyHandShape(hand(["curl", "curl", "curl", "curl"], "up"))).toBe("Thumb_Up");
    expect(classifyHandShape(hand(["curl", "curl", "curl", "curl"], "down"))).toBe("Thumb_Down");
  });

  it("is None for mixed or missing fingers", () => {
    expect(classifyHandShape(hand(["ext", "curl", "ext", "curl"]))).toBe("None");
    expect(classifyHandShape([])).toBe("None");
  });

  it("measures the hand extent in long-side units", () => {
    expect(handExtent(hand(["ext", "ext", "ext", "ext"]), 360, 640)).toBeCloseTo(0.45);
  });
});
