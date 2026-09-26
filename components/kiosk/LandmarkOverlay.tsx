"use client";

import type { FeedFit } from "@/lib/kiosk/types";
import type { GestureDebug } from "@/lib/kiosk/useGestures";
import { HAND_CONNECTIONS } from "@/lib/kiosk/vision";

/**
 * Debug overlay: hand landmarks, gesture labels and scores. The SVG uses the
 * upright detection frame as its viewBox and the same fit as the feed
 * (letterbox or crop), so points land on the hands they came from.
 */
export function LandmarkOverlay({ debug, mirrored, fit = "contain" }: { debug: GestureDebug; mirrored: boolean; fit?: FeedFit }) {
  if (debug.landmarks.length === 0) return null;
  const W = debug.frame.width || 100;
  const H = debug.frame.height || 100;
  const unit = Math.max(W, H) / 100;
  const sx = (x: number) => (mirrored ? 1 - x : x) * W;
  return (
    <svg className="landmark-overlay" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"} aria-hidden>
      {debug.landmarks.map((hand, i) => (
        <g key={i}>
          {HAND_CONNECTIONS.map(([a, b]) => {
            const pa = hand.points[a];
            const pb = hand.points[b];
            if (!pa || !pb) return null;
            return <line key={`${a}-${b}`} x1={sx(pa.x)} y1={pa.y * H} x2={sx(pb.x)} y2={pb.y * H} className="landmark-overlay__bone" />;
          })}
          {hand.points.map((p, j) => (
            <circle key={j} cx={sx(p.x)} cy={p.y * H} r={0.45 * unit} className="landmark-overlay__joint" />
          ))}
          {hand.points[0] && (
            <text x={sx(hand.points[0].x)} y={hand.points[0].y * H + 3.2 * unit} style={{ fontSize: 2 * unit, strokeWidth: 0.4 * unit }} className="landmark-overlay__label">
              {hand.handedness} {hand.gesture} {Math.round(hand.score * 100)}%
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
