import { OVERHEATED_MESSAGE } from "@/lib/analyze";
import { compactSnapshot, snapshotArea, type PoseSnapshot } from "@/lib/pose/landmarks";
import type { PoseResult } from "@/lib/pose/score";
import { captureFrame, sha256Hex } from "./capture";
import type { AnalyzeContext } from "./api";
import type { LobbyCapture } from "./useKioskMachine";
import type { BattleCreateResponse, BattleResult, BattleScanResponse, CapturedImage, Lobby, ScanResult } from "./types";

/** Normalized bounding box of a detected person in the upright, unmirrored frame. */
export interface PoseBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface BattleCaptureContext extends AnalyzeContext {
  /** Latest live poses from the gesture runtime (upright, unmirrored frame). */
  poses: () => PoseSnapshot[];
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

export function boxOf(s: PoseSnapshot): PoseBox {
  let xmin = 1, ymin = 1, xmax = 0, ymax = 0;
  for (const [x, y] of s.landmarks) {
    xmin = Math.min(xmin, x);
    xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  }
  return { xmin, ymin, xmax, ymax };
}

/** A pose box as it appears in the captured (possibly mirrored) photo, with a margin. */
export function screenBox(b: PoseBox, mirrored: boolean, margin = 0.08): PoseBox {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const m = mirrored ? { xmin: 1 - b.xmax, xmax: 1 - b.xmin, ymin: b.ymin, ymax: b.ymax } : b;
  return { xmin: clamp(m.xmin - margin), xmax: clamp(m.xmax + margin), ymin: clamp(m.ymin - margin), ymax: clamp(m.ymax + margin) };
}

const usable = (b: PoseBox) => b.xmax - b.xmin > 0.1 && b.ymax - b.ymin > 0.2;

/** Two crops for a two-person duel: by the people's pose boxes (left to right on screen), else halves. */
export function battleCropBoxes(poseBoxes: PoseBox[], mirrored: boolean): [PoseBox, PoseBox] {
  const boxes = poseBoxes
    .map((b) => screenBox(b, mirrored))
    .filter(usable)
    .sort((a, b) => a.xmin - b.xmin);
  if (boxes.length >= 2) return [boxes[0], boxes[boxes.length - 1]];
  return [
    { xmin: 0, ymin: 0, xmax: 0.5, ymax: 1 },
    { xmin: 0.5, ymin: 0, xmax: 1, ymax: 1 },
  ];
}

async function crop(img: HTMLImageElement, box: PoseBox, placeholder: boolean): Promise<CapturedImage> {
  const sx = Math.round(box.xmin * img.width);
  const sy = Math.round(box.ymin * img.height);
  const sw = Math.max(16, Math.round((box.xmax - box.xmin) * img.width));
  const sh = Math.max(16, Math.round((box.ymax - box.ymin) * img.height));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("crop failed"))), "image/jpeg", 0.85));
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: sw, height: sh, hash: await sha256Hex(blob), placeholder };
}

/**
 * Capture for the lobby. One player: the person stepping up (the largest /
 * closest body when several are in frame, cropped so a previous player in the
 * background is not judged too). Pair: one frame split into both people, left
 * then right on screen, each with their own landmarks.
 */
export async function captureLobby(ctx: BattleCaptureContext, pair: boolean): Promise<LobbyCapture[]> {
  const frame = await captureFrame(ctx.video, { flip: ctx.flip, rotation: ctx.rotation });
  const image: CapturedImage = { dataUrl: frame.dataUrl, width: frame.width, height: frame.height, hash: frame.hash, placeholder: frame.placeholder };
  const poses = frame.placeholder ? [] : ctx.poses();

  if (pair) {
    const img = await loadImage(frame.dataUrl);
    // Order people left-to-right as the players see them.
    const people = poses
      .map((p) => ({ pose: p, box: screenBox(boxOf(p), ctx.flip) }))
      .filter((p) => usable(p.box))
      .sort((a, b) => a.box.xmin - b.box.xmin);
    const [boxA, boxB] = battleCropBoxes(poses.map(boxOf), ctx.flip);
    const [a, b] = await Promise.all([crop(img, boxA, frame.placeholder), crop(img, boxB, frame.placeholder)]);
    const pa = people.length >= 2 ? people[0].pose : null;
    const pb = people.length >= 2 ? people[people.length - 1].pose : null;
    return [
      { image: a, pose: pa },
      { image: b, pose: pb },
    ];
  }

  if (poses.length === 0) return [{ image, pose: null }];
  const main = [...poses].sort((a, b) => snapshotArea(b) - snapshotArea(a))[0];
  if (poses.length === 1) return [{ image, pose: main }];
  const box = screenBox(boxOf(main), ctx.flip, 0.1);
  if (!usable(box)) return [{ image, pose: main }];
  return [{ image: await crop(await loadImage(frame.dataUrl), box, frame.placeholder), pose: main }];
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body || typeof body.error === "string") throw new Error(body?.error ?? OVERHEATED_MESSAGE);
  return body;
}

/** One capture through the single-judge pipeline + its pose sub-score. */
export async function scoreCapture(capture: LobbyCapture, onUsage?: AnalyzeContext["onUsage"]): Promise<{ scan: ScanResult; pose: PoseResult }> {
  const form = new FormData();
  form.append("image", dataUrlToBlob(capture.image.dataUrl), "capture.jpg");
  if (capture.pose) form.append("pose", JSON.stringify(compactSnapshot(capture.pose)));
  let res: Response;
  try {
    res = await fetch("/api/battle/scan", { method: "POST", body: form });
  } catch (err) {
    throw new Error(OVERHEATED_MESSAGE, { cause: err });
  }
  const body = await readJson<BattleScanResponse>(res);
  onUsage?.(body.usage);
  const s = body.scan;
  return {
    scan: { id: s.id, analysis: s.analysis, aura: s.aura, breakdown: s.breakdown, rank: s.rank, capturedAt: Date.now(), image: capture.image, cached: s.cached, mock: s.mock },
    pose: body.pose,
  };
}

/** Lock the lobby in: the server computes and stores the battle. */
export async function createBattle(lobby: Lobby): Promise<BattleResult> {
  const slots = lobby.slots.filter((s) => s.scan);
  const res = await fetch("/api/battle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: lobby.mode, players: slots.map((s) => ({ slot: s.slot, scanId: s.scan!.id, pose: s.pose ? compactSnapshot(s.pose) : null })) }),
  }).catch((err: unknown) => {
    throw new Error(OVERHEATED_MESSAGE, { cause: err });
  });
  const { battle } = await readJson<BattleCreateResponse>(res);
  return {
    ...battle,
    players: battle.players.map((p) => ({ ...p, scan: slots.find((s) => s.slot === p.slot)!.scan! })),
    capturedAt: Date.now(),
  };
}

/** Read the commentary stream, reporting the text so far as tokens arrive. */
export async function streamCommentary(battleId: string, onText: (text: string) => void): Promise<string> {
  const res = await fetch(`/api/battle/${battleId}/commentary`, { method: "POST" });
  if (!res.ok || !res.body) throw new Error("commentary unavailable");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  text += decoder.decode();
  return text.trim();
}

/** Pre-flight connection warm-up (boot + idle gaps). Fire and forget. */
export function warmUp(): void {
  void fetch("/api/warmup", { method: "POST" }).catch(() => undefined);
}
