"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { LeaderboardEntry, LeaderboardSnapshot } from "@/lib/kiosk/types";
import { handleName, rivalryLine } from "@/lib/leaderboard/narrative";
import { formatAura } from "@/lib/scoring";

/** Stagger for rows sliding in (capped so long lists do not wait). */
export const stagger = (i: number): CSSProperties => ({ "--i": Math.min(i, 8) }) as CSSProperties;

/** Where the scan happened: a small marker on every row. */
function SourceMark({ source }: { source: LeaderboardEntry["source"] }) {
  const phone = source === "mobile";
  return (
    <span className={`source-mark ${phone ? "source-mark--phone" : ""}`} title={phone ? "Scanned on a phone" : "Scanned at the mirror"} aria-label={phone ? "phone scan" : "mirror scan"}>
      {phone ? "📱" : "🪞"}
    </span>
  );
}

function Row({ e, rank, snapshot, you, style }: { e: LeaderboardEntry; rank: number; snapshot: LeaderboardSnapshot; you: boolean; style?: CSSProperties }) {
  const narrative = snapshot.narrative;
  const streak = e.handle ? narrative?.streaks[e.handle] : undefined;
  const up = e.handle ? narrative?.improved[e.handle] : undefined;
  const href = e.cardId ? `/r/${e.cardId}` : e.handle ? `/u/${encodeURIComponent(e.handle)}` : null;
  const body = (
    <>
      <span className={`standings__rank font-number ${rank <= 3 ? "standings__rank--podium" : ""}`}>{rank}</span>
      <span className="standings__who">
        <span className="standings__nick font-heading">
          {you && <span className="standings__you">YOU</span>}
          {e.nickname}
        </span>
        <span className="standings__sub font-mono">
          <SourceMark source={e.source} /> {e.handle ? handleName(e.handle) : e.standout ? e.standout : " "}
          {streak ? ` · 🔥${streak}` : ""}
          {up ? ` · ↑${formatAura(up)}` : ""}
        </span>
      </span>
      <span className={`standings__aura font-number ${e.aura < 0 ? "standings__aura--neg" : ""}`}>{formatAura(e.aura, true)}</span>
      {href && <span className="standings__go" aria-hidden>›</span>}
    </>
  );
  const cls = `standings__row ${you ? "standings__row--you" : ""}`;
  return (
    <li className="rise" style={style}>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/**
 * Live leaderboard rows: tap one to open that card. `you` is the viewer's own
 * best entry and rank (matched by this phone or its AURA ID): highlighted in
 * the list, or pinned under it when it is outside the top.
 */
export function Standings({
  snapshot,
  squadCardId = null,
  limit = 10,
  emptyNote = "NOBODY ON THE BOARD YET. SCAN AT THE MIRROR OR ON YOUR PHONE.",
}: {
  snapshot: LeaderboardSnapshot | null;
  squadCardId?: string | null;
  limit?: number;
  emptyNote?: string;
}) {
  if (!snapshot)
    return (
      <ol className="standings__list" aria-label="Loading the standings">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="standings__row skeleton" style={stagger(i)}>
            <span className="skeleton__block skeleton__block--rank" />
            <span className="skeleton__block" />
            <span className="skeleton__block skeleton__block--score" />
          </li>
        ))}
      </ol>
    );
  const { top, narrative } = snapshot;
  const you = snapshot.you ?? null;
  if (top.length === 0) return <p className="companion__note">{emptyNote}</p>;
  // On a single board, only its own story: the squad champion on GROUPS, the rivalry on DUOS.
  const board = snapshot.board;
  const champ = !board || board === "squad" ? (narrative?.squadChampion ?? null) : null;
  const rivalry = !board || board === "duo" ? (narrative?.rivalry ?? null) : null;
  const shown = top.slice(0, limit);
  const youShown = you !== null && shown.some((e) => e.id === you.entry.id);
  return (
    <div className="standings">
      {champ && (
        <Link href={squadCardId ? `/r/${squadCardId}` : "#"} className={`standings__special ${squadCardId ? "" : "standings__special--static"}`}>
          <span className="font-heading">👑 SQUAD CHAMPION</span>
          <span className="standings__special-body">
            {champ.vibe.toUpperCase()} · {champ.players} PLAYERS · <span className="font-number">{formatAura(champ.score)}</span>
          </span>
        </Link>
      )}
      {rivalry && (
        <div className="standings__special standings__special--static">
          <span className="font-heading">⚔️ RIVALRY OF THE DAY</span>
          <span className="standings__special-body">{rivalryLine(rivalry)}</span>
        </div>
      )}
      <ol className="standings__list">
        {shown.map((e, i) => (
          <Row key={e.id} e={e} rank={i + 1} snapshot={snapshot} you={you !== null && e.id === you.entry.id} style={stagger(i)} />
        ))}
      </ol>
      {you && !youShown && (
        <>
          <div className="standings__gap font-heading" aria-hidden>
            ⋮
          </div>
          <ol className="standings__list" aria-label="Your best">
            <Row e={you.entry} rank={you.rank} snapshot={snapshot} you />
          </ol>
        </>
      )}
    </div>
  );
}
