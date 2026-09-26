export interface StatRow {
  label: string;
  value: string;
  /** Highlight (e.g. the stat that decided a battle). */
  hot?: boolean;
}

/**
 * The result screen's stat rows (label / value grid). The solo reveal uses it
 * full size; battle columns reuse it compact under each mannequin.
 */
export function StatRows({ rows, compact = false, className = "" }: { rows: StatRow[]; compact?: boolean; className?: string }) {
  return (
    <dl className={`reveal-grid ${compact ? "reveal-grid--compact" : ""} ${className}`}>
      {rows.map((r) => (
        <div key={r.label} className={`reveal-grid__row ${r.hot ? "reveal-grid__row--hot" : ""}`}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
