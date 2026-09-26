/**
 * Volume readout after + / -: ten pixel blocks and the percent, then it fades
 * out on its own (CSS). Re-mounted (keyed) on every press so it restarts.
 */
export function VolumeOsd({ volume, muted }: { volume: number; muted: boolean }) {
  const lit = Math.round(volume * 10);
  return (
    <div className="volume-osd" role="status" aria-live="polite">
      <span className="volume-osd__label">{muted ? "MUTED" : "VOLUME"}</span>
      <span className="volume-osd__bar" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`volume-osd__block ${i < lit && !muted ? "volume-osd__block--on" : ""}`} />
        ))}
      </span>
      <span className="volume-osd__pct">{muted ? "--" : `${lit * 10}%`}</span>
    </div>
  );
}
