"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedEntry } from "@/lib/feed/types";
import type { LeaderboardSnapshot } from "@/lib/kiosk/types";
import { handleName, rivalryLine } from "@/lib/leaderboard/narrative";
import { formatAura } from "@/lib/scoring";
import { IdentityBar } from "./Identity";
import { Reactions } from "./Reactions";

const KIND_CHIP = { scan: "SOLO", battle: "1V1", squad: "SQUAD" } as const;
const HEADLINE_LABEL = { scan: "AURA", battle: "WON BY", squad: "GROUP AURA" } as const;
/** New cards and standings show up without a refresh. */
const FEED_POLL_MS = 8_000;
const STANDINGS_POLL_MS = 10_000;

export type FeedTab = "feed" | "standings";

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}S AGO`;
  if (s < 3600) return `${Math.round(s / 60)}M AGO`;
  return `${Math.round(s / 3600)}H AGO`;
};

/** The newest card, big: the thing everyone at the mirror just watched. */
function JustScanned({ entry, fresh }: { entry: FeedEntry; fresh: boolean }) {
  return (
    <section className={`feed-hero ${fresh ? "feed-hero--fresh" : ""}`} aria-label="Most recent scan">
      <div className="feed-hero__label font-heading">
        <span className="feed-hero__live" aria-hidden />
        JUST SCANNED · {ago(entry.createdAt)}
      </div>
      <Link href={`/r/${entry.id}`} className="feed-hero__card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={entry.imageUrl} alt={entry.title} className="feed-hero__img" />
      </Link>
      <div className="feed-hero__row">
        <div className="min-w-0">
          <div className="feed__title font-heading">
            <span className="feed__chip">{KIND_CHIP[entry.kind]}</span> {entry.title}
          </div>
          {entry.verdict && <div className="feed-hero__verdict">{entry.verdict}</div>}
        </div>
        <div className="feed-hero__score">
          <span className="font-heading">{HEADLINE_LABEL[entry.kind]}</span>
          <span className="font-number">{formatAura(entry.headline)}</span>
        </div>
      </div>
      <Reactions cardId={entry.id} initial={entry.reactions} />
    </section>
  );
}

function FeedList({ entries }: { entries: FeedEntry[] }) {
  return (
    <ol className="feed">
      {entries.map((e) => (
        <li key={e.id}>
          <Link href={`/r/${e.id}`} className="feed__row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.imageUrl} alt="" className="feed__thumb" loading="lazy" />
            <div className="feed__body">
              <div className="feed__meta font-heading">
                <span className="feed__chip">{KIND_CHIP[e.kind]}</span>
                <span>{ago(e.createdAt)}</span>
              </div>
              <div className="feed__title font-heading">{e.title}</div>
              <div className="feed__score">
                <span className="font-heading">{HEADLINE_LABEL[e.kind]}</span> <span className="font-number">{formatAura(e.headline)}</span>
              </div>
              {e.verdict && <div className="feed__verdict">{e.verdict}</div>}
              <Reactions cardId={e.id} initial={e.reactions} compact />
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** Live leaderboard: tap a row to open that player's card. */
function Standings({ snapshot, squadCardId }: { snapshot: LeaderboardSnapshot | null; squadCardId: string | null }) {
  if (!snapshot) return <p className="companion__note">LOADING THE STANDINGS...</p>;
  const { top, narrative } = snapshot;
  if (top.length === 0) return <p className="companion__note">NOBODY ON THE BOARD YET. SCAN AT THE MIRROR AND GIVE IT A THUMBS UP.</p>;
  const champ = narrative?.squadChampion ?? null;
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
      {narrative?.rivalry && (
        <div className="standings__special standings__special--static">
          <span className="font-heading">⚔️ RIVALRY OF THE DAY</span>
          <span className="standings__special-body">{rivalryLine(narrative.rivalry)}</span>
        </div>
      )}
      <ol className="standings__list">
        {top.slice(0, 30).map((e, i) => {
          const streak = e.handle ? narrative?.streaks[e.handle] : undefined;
          const up = e.handle ? narrative?.improved[e.handle] : undefined;
          const href = e.cardId ? `/r/${e.cardId}` : e.handle ? `/u/${encodeURIComponent(e.handle)}` : null;
          const body = (
            <>
              <span className={`standings__rank font-number ${i < 3 ? "standings__rank--podium" : ""}`}>{i + 1}</span>
              <span className="standings__who">
                <span className="standings__nick font-heading">{e.nickname}</span>
                <span className="standings__sub font-mono">
                  {e.handle ? handleName(e.handle) : e.standout ? e.standout : " "}
                  {streak ? ` · 🔥${streak}` : ""}
                  {up ? ` · ↑${formatAura(up)}` : ""}
                </span>
              </span>
              <span className={`standings__aura font-number ${e.aura < 0 ? "standings__aura--neg" : ""}`}>{formatAura(e.aura, true)}</span>
              {href && <span className="standings__go" aria-hidden>›</span>}
            </>
          );
          return <li key={e.id}>{href ? <Link href={href} className="standings__row">{body}</Link> : <div className="standings__row">{body}</div>}</li>;
        })}
      </ol>
    </div>
  );
}

/**
 * The phone side of the mirror: the card that was just scanned (react to it
 * live), then every card (FEED) or the live leaderboard (STANDINGS), where a
 * tap opens that player's card. New cards appear on their own.
 */
export function FeedScreen({ initial, initialNext, initialTab = "feed" }: { initial: FeedEntry[]; initialNext: string | null; initialTab?: FeedTab }) {
  const [entries, setEntries] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<FeedTab>(initialTab);
  const [standings, setStandings] = useState<LeaderboardSnapshot | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);

  // New cards: merge the newest page in on top (keeps what was already loaded below).
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch("/api/feed", { cache: "no-store" });
        const body = (await res.json()) as { entries?: FeedEntry[] };
        const known = new Set(entriesRef.current.map((e) => e.id));
        const added = (body.entries ?? []).filter((e) => !known.has(e.id));
        if (added.length === 0) return;
        setFreshId(added[0].id);
        setEntries((old) => [...added.filter((a) => !old.some((o) => o.id === a.id)), ...old]);
      } catch {
        // offline: keep what we have
      }
    }, FEED_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (tab !== "standings") return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as LeaderboardSnapshot;
        if (!cancelled) setStandings(body);
      } catch {
        // keep the last standings
      }
    };
    void load();
    const id = window.setInterval(load, STANDINGS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tab]);

  const chooseTab = (t: FeedTab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "feed" ? "/feed" : "/feed?tab=standings");
  };

  const more = useCallback(async () => {
    if (!next) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?before=${encodeURIComponent(next)}`);
      const body = (await res.json()) as { entries: FeedEntry[]; next: string | null };
      setEntries((e) => [...e, ...body.entries.filter((n) => !e.some((o) => o.id === n.id))]);
      setNext(body.next);
    } finally {
      setLoading(false);
    }
  }, [next]);

  const [hero, ...rest] = entries;
  const champ = standings?.narrative?.squadChampion ?? null;
  const squadCardId = champ ? (entries.find((e) => e.battleId === champ.battleId && e.kind === "squad")?.id ?? null) : null;

  return (
    <main className="companion aura-grid-bg">
      <header className="top-bar">
        <span className="font-heading text-[11px] uppercase tracking-[0.2em]">AURA OS · LIVE</span>
        <Link href="/leaderboard" className="font-heading text-[10px] uppercase">
          [BIG SCREEN]
        </Link>
      </header>
      <div className="companion__col">
        <div className="wordmark">
          <h1 className="wordmark__title font-heading uppercase">AURA BATTLES</h1>
          <p className="wordmark__sub font-mono uppercase">LIVE FROM THE MIRROR · HACKGT 13</p>
        </div>
        <IdentityBar />
        {hero ? <JustScanned key={hero.id} entry={hero} fresh={hero.id === freshId} /> : <p className="companion__note">NO CARDS YET. SCAN AT THE MIRROR AND GIVE IT A THUMBS UP.</p>}
        <div className="feed-tabs" role="tablist">
          {(["feed", "standings"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`feed-tabs__tab font-heading ${tab === t ? "feed-tabs__tab--on" : ""}`} onClick={() => chooseTab(t)}>
              {t === "feed" ? "FEED" : "STANDINGS"}
            </button>
          ))}
        </div>
        {tab === "feed" ? (
          <>
            <FeedList entries={rest} />
            {next && (
              <button type="button" className="card-page__button" onClick={more} disabled={loading}>
                [{loading ? "LOADING..." : "LOAD MORE"}]
              </button>
            )}
          </>
        ) : (
          <Standings snapshot={standings} squadCardId={squadCardId} />
        )}
      </div>
    </main>
  );
}
