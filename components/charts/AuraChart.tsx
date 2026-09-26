import { formatAura } from "@/lib/scoring";

export interface AuraPoint {
  /** Short x label, e.g. "14:15". */
  label: string;
  value: number;
}

const W = 600;
const H = 200;
const PAD = { top: 16, right: 12, bottom: 26, left: 12 };
/** The y scale never shrinks below this, so a day of near-zero fits reads as flat, not dramatic. */
const MIN_SCALE = 25_000;

/**
 * Aura over time as a plain SVG line (no chart library): zero line, one dot
 * per point, the extremes labeled. Server- or client-rendered; colors follow
 * currentColor so it works on the kiosk, mirror and phone pages.
 */
export function AuraChart({ points, title }: { points: AuraPoint[]; title: string }) {
  if (points.length === 0) return <div className="aura-chart aura-chart--empty">NO DATA YET</div>;
  const scale = Math.max(MIN_SCALE, ...points.map((p) => Math.abs(p.value)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH / 2 - (v / scale) * (innerH / 2);
  const zeroY = y(0);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const maxI = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const minI = points.reduce((best, p, i) => (p.value < points[best].value ? i : best), 0);

  return (
    <svg className="aura-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} className="aura-chart__zero" />
      <polyline points={line} className="aura-chart__line" />
      {points.map((p, i) => (
        <rect key={i} x={x(i) - 3} y={y(p.value) - 3} width={6} height={6} className={p.value < 0 ? "aura-chart__dot aura-chart__dot--neg" : "aura-chart__dot"} />
      ))}
      <text x={x(maxI)} y={Math.max(12, y(points[maxI].value) - 8)} className="aura-chart__label" textAnchor="middle">
        {formatAura(points[maxI].value, true)}
      </text>
      {minI !== maxI && (
        <text x={x(minI)} y={Math.min(H - PAD.bottom - 2, y(points[minI].value) + 16)} className="aura-chart__label" textAnchor="middle">
          {formatAura(points[minI].value, true)}
        </text>
      )}
      <text x={PAD.left} y={H - 6} className="aura-chart__axis">
        {points[0].label}
      </text>
      {points.length > 1 && (
        <text x={W - PAD.right} y={H - 6} className="aura-chart__axis" textAnchor="end">
          {points[points.length - 1].label}
        </text>
      )}
    </svg>
  );
}
