import { GESTURE_LEGEND, legendForState } from "@/lib/kiosk/machine";
import type { KioskState } from "@/lib/kiosk/types";

/** Shows the gestures to advertise in the current state (only the wave before a session starts). */
export function GestureLegend({ state, suppressed = false }: { state: KioskState; suppressed?: boolean }) {
  const gestures = suppressed ? [] : legendForState(state);
  if (gestures.length === 0) {
    return <div className="gesture-legend gesture-legend--empty">HOLD STILL...</div>;
  }
  return (
    <div className="gesture-legend">
      {gestures.map((g) => (
        <span key={g} className="gesture-chip">
          <span className="gesture-chip__emoji" aria-hidden>
            {GESTURE_LEGEND[g].emoji}
          </span>
          <span>{GESTURE_LEGEND[g].label}</span>
        </span>
      ))}
    </div>
  );
}
