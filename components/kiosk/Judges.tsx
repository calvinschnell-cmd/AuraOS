import { auraMagnitude, formatAura, judgeName, type ScoreBreakdown } from "@/lib/scoring";

/**
 * The judges that answered (two or three) side by side, named only JUDGE 1 /
 * JUDGE 2 / JUDGE 3 (the models behind them are never shown or spoken). When
 * they land far apart, the "JUDGES DISAGREE" banner is the reveal's payoff
 * moment. With a single judge, just its verdict.
 */
export function JudgesPanel({ breakdown, verdict }: { breakdown: ScoreBreakdown; verdict: string }) {
  const judges = breakdown.judges ?? [];
  if (judges.length < 2) {
    return (
      <div className="reveal-verdict">
        &quot;{verdict}&quot;
      </div>
    );
  }
  return (
    <div className={`judges ${breakdown.disagree ? "judges--disagree" : ""}`}>
      {breakdown.disagree ? (
        <div className="judges__banner" role="status">
          <span aria-hidden>⚠</span> THE JUDGES DISAGREE <span aria-hidden>⚠</span>
        </div>
      ) : (
        <div className="judges__agree">THE JUDGES AGREE</div>
      )}
      <div className={`judges__grid judges__grid--${judges.length}`}>
        {judges.map((j, i) => (
          <div key={j.judge} className={`judge judge--${j.judge}`}>
            <div className="judge__name">{judgeName(i)}</div>
            <div className={`judge__aura font-number judge__aura--${auraMagnitude(j.aura)}`}>{formatAura(j.aura, true)}</div>
            <div className="judge__meta">
              SPECIAL {j.specialness}/100 · {j.sentiment === "positive" ? "W" : "L"}
            </div>
            <div className="judge__verdict">&quot;{j.verdict}&quot;</div>
          </div>
        ))}
      </div>
      <div className="judges__official">OFFICIAL AURA (AVERAGE) {formatAura(breakdown.aura, true)}</div>
    </div>
  );
}

/** Spoken lines for the verdict step (announcer / ElevenLabs). */
export function judgesAnnouncement(breakdown: ScoreBreakdown, verdict: string): string[] {
  const judges = breakdown.judges ?? [];
  if (judges.length < 2) return [verdict];
  const lines = judges.map((j, i) => `Judge ${i + 1} says: ${j.verdict}`);
  return breakdown.disagree ? ["The judges disagree.", ...lines] : lines;
}
