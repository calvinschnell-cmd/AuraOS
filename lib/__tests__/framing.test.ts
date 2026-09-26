import { describe, expect, it } from "vitest";
import { assessFraming, assessPose, isFacingCamera } from "@/lib/kiosk/framing";

function body(opts: { top?: number; bottom?: number; ankleVis?: number; noseVis?: number } = {}) {
  const top = opts.top ?? 0.1;
  const bottom = opts.bottom ?? 0.9;
  const lm = Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: top + ((bottom - top) * i) / 32, visibility: 0.95 }));
  lm[0] = { x: 0.5, y: top, visibility: opts.noseVis ?? 0.95 };
  lm[27] = { x: 0.45, y: bottom, visibility: opts.ankleVis ?? 0.95 };
  lm[28] = { x: 0.55, y: bottom, visibility: opts.ankleVis ?? 0.95 };
  return lm;
}

describe("framing", () => {
  it("is none without a pose", () => {
    expect(assessFraming([])).toBe("none");
    expect(assessPose([])).toBe("none");
  });

  it("is full when head and both ankles are visible inside the frame", () => {
    expect(assessPose(body())).toBe("full");
  });

  it("asks to step back when the feet or head are cut off or not visible", () => {
    expect(assessPose(body({ bottom: 0.995 }))).toBe("step_back");
    expect(assessPose(body({ bottom: 0.98 }))).toBe("full");
    expect(assessPose(body({ ankleVis: 0.1 }))).toBe("step_back");
    expect(assessPose(body({ top: 0.01 }))).toBe("step_back");
    expect(assessPose(body({ noseVis: 0.1 }))).toBe("step_back");
  });

  it("asks to come closer when the body is tiny", () => {
    expect(assessPose(body({ top: 0.4, bottom: 0.6 }))).toBe("step_closer");
  });

  it("judges the tallest person and ignores a bystander at the edge", () => {
    expect(assessFraming([body({ top: 0.45, bottom: 0.995, ankleVis: 0.2 }), body()])).toBe("full");
  });
});

describe("facing the camera", () => {
  const person = (leftShoulderX: number, rightShoulderX: number, noseVis = 0.95) => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
    lm[0] = { x: 0.5, y: 0.2, visibility: noseVis };
    lm[11] = { x: leftShoulderX, y: 0.3, visibility: 0.95 };
    lm[12] = { x: rightShoulderX, y: 0.3, visibility: 0.95 };
    return lm;
  };

  it("faces the camera when the left shoulder is on the image's right and the face is visible", () => {
    expect(isFacingCamera(person(0.6, 0.4))).toBe(true);
  });

  it("is turned away when the shoulders swap sides or the face drops out", () => {
    expect(isFacingCamera(person(0.4, 0.6))).toBe(false);
    expect(isFacingCamera(person(0.6, 0.4, 0.1))).toBe(false);
    expect(isFacingCamera([])).toBe(false);
  });
});
