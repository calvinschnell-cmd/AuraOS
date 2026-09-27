"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedEntry } from "@/lib/feed/types";
import { formatAura } from "@/lib/scoring";
import { AppShell } from "./AppShell";
import { DecodeNumber } from "./DecodeNumber";
import { IdentityBar } from "./Identity";
import { Reactions } from "./Reactions";
import { stagger } from "./Standings";

const KIND_CHIP: Record<string, string> = { scan: "SOLO", battle: "1V1", squad: "SQUAD", challenge: "CHALLENGE" };
const HEADLINE_LABEL: Record<string, string> = { scan: "AURA", battle: "WON BY", squad: "GROUP AURA", challenge: "WON BY" };
/** New cards (and removals) show up without a refresh. */
const FEED_POLL_MS = 8_000;

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}S AGO`;
  if (s < 3600) return `${Math.round(s / 60)}M AGO`;
  if (s < 86_400) return `${Math.round(s / 3600)}H AGO`;
  return `${Math.round(s / 86_400)}D AGO`;
};

/** Where to open an entry: its card page, or its challenge page. */
export const entryHref = (e: FeedEntry) => (e.challengeId ? `/c/${e.challengeId}` : `/r/${e.id}`);

function Source({ entry }: { entry: FeedEntry }) {
  return <span className={`feed__chip feed__chip--src ${entry.source === "mobile" ? "feed__chip--phone" : ""}`}>{entry.source === "mobile" ? "📱 PHONE" : "🪞 MIRROR"}</span>;
}

/** The newest card, big: the thing everyone just watched. */
function JustScanned({ entry, fresh }: { entry: FeedEntry; fresh: boolean }) {
  return (
    <section className={`feed-hero ${fresh ? "feed-hero--fresh" : ""}`} aria-label="Most recent scan">
      <div className="feed-hero__label font-heading">
        <span className="feed-hero__live" aria-hidden />
        JUST IN · {ago(entry.createdAt)}
      </div>
      <Link href={entryHref(entry)} className="feed-hero__card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={entry.imageUrl} alt={entry.title} className="feed-hero__img" />
      </Link>
      <div className="feed-hero__row">
        <div className="min-w-0">
          <div className="feed__title font-heading">
            <span className="feed__chip">{KIND_CHIP[entry.kind] ?? "CARD"}</span> <Source entry={entry} /> {entry.title}
          </div>
          {entry.handle && <div className="feed__handle font-mono">{entry.handle}</div>}
          {entry.verdict && <div className="feed-hero__verdict">{entry.verdict}</div>}
        </div>
        <div className="feed-hero__score">
          <span className="font-heading">{HEADLINE_LABEL[entry.kind] ?? "AURA"}</span>
          <DecodeNumber value={entry.headline} className="font-number" />
        </div>
      </div>
      <Reactions cardId={entry.id} initial={entry.reactions} />
    </section>
  );
}

function FeedList({ entries }: { entries: FeedEntry[] }) {
  return (
    <ol className="feed">
      {entries.map((e, i) => (
        <li key={e.id} className="rise" style={stagger(i)}>
          <Link href={entryHref(e)} className="feed__row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.imageUrl} alt="" className="feed__thumb" loading="lazy" />
            <div className="feed__body">
              <div className="feed__meta font-heading">
                <span className="feed__chip">{KIND_CHIP[e.kind] ?? "CARD"}</span>
                <Source entry={e} />
                <span>{ago(e.createdAt)}</span>
              </div>
              <div className="feed__title font-heading">{e.title}</div>
              {e.handle && <div className="feed__handle font-mono">{e.handle}</div>}
              <div className="feed__score">
                <span className="font-heading">{HEADLINE_LABEL[e.kind] ?? "AURA"}</span> <span className="font-number">{formatAura(e.headline)}</span>
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

/**
 * /feed: every result from the mirror and from phones, newest first (face
 * blurred cards only, never photos). New cards and admin removals apply on
 * their own; scrolling to the bottom loads older cards. Read-only apart from
 * the existing reactions.
 */
export function FeedScreen({ initial, initialNext }: { initial: FeedEntry[]; initialNext: string | null }) {
  const [entries, setEntries] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // New cards: merge the newest page in on top (keeps what was already loaded below); drop removed ones.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch("/api/feed", { cache: "no-store" });
        const body = (await res.json()) as { entries?: FeedEntry[]; removed?: string[] };
        const removed = new Set(body.removed ?? []);
        const known = new Set(entriesRef.current.map((e) => e.id));
        const added = (body.entries ?? []).filter((e) => !known.has(e.id) && !removed.has(e.id));
        if (removed.size > 0 && entriesRef.current.some((e) => removed.has(e.id))) setEntries((old) => old.filter((e) => !removed.has(e.id)));
        if (added.length === 0) return;
        setFreshId(added[0].id);
        setEntries((old) => [...added.filter((a) => !old.some((o) => o.id === a.id)), ...old]);
        if (window.scrollY > 240) setUnseen((n) => n + added.length);
      } catch {
        // offline: keep what we have
      }
    }, FEED_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // The pill goes away once you are back at the top.
  useEffect(() => {
    if (unseen === 0) return;
    const onScroll = () => {
      if (window.scrollY < 120) setUnseen(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [unseen]);

  const more = useCallback(async () => {
    if (!next || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?before=${encodeURIComponent(next)}`);
      const body = (await res.json()) as { entries: FeedEntry[]; next: string | null };
      setEntries((e) => [...e, ...body.entries.filter((n) => !e.some((o) => o.id === n.id))]);
      setNext(body.next);
    } catch {
      // try again on the next scroll / tap
    } finally {
      setLoading(false);
    }
  }, [next, loading]);

  // Infinite scroll: load older cards as the bottom comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting)) void more();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [next, more]);

  const [hero, ...rest] = entries;

  return (
    <AppShell
      title="FEED"
      tab="feed"
      action={
        <Link href="/scan" className="font-heading">
          SCAN ↗
        </Link>
      }
    >
      {unseen > 0 && (
        <button type="button" className="new-pill font-heading" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          ↑ {unseen} NEW {unseen === 1 ? "CARD" : "CARDS"}
        </button>
      )}
      <div className="wordmark">
        <h1 className="wordmark__title font-heading uppercase">AURA BATTLES</h1>
        <p className="wordmark__sub wordmark__sub--caret font-mono uppercase">LIVE FROM THE MIRROR + PHONES · HACKGT 13</p>
      </div>
      <IdentityBar />
      {hero ? (
        <JustScanned key={hero.id} entry={hero} fresh={hero.id === freshId} />
      ) : (
        <div className="empty-state">
          <span className="empty-state__glyph font-number" aria-hidden>
            [ _ ]
          </span>
          <p className="companion__note">NO CARDS YET. SCAN AT THE MIRROR, OR FROM YOUR PHONE.</p>
          <Link href="/scan" className="companion__big-btn companion__link-btn">
            [SCAN YOUR FIT]
          </Link>
        </div>
      )}
      <FeedList entries={rest} />
      <div ref={sentinel} aria-hidden />
      {next && (
        <button type="button" className="card-page__button" onClick={() => void more()} disabled={loading}>
          [{loading ? "LOADING..." : "LOAD MORE"}]
        </button>
      )}
      {!next && entries.length > 0 && <p className="companion__note feed__end">THAT&apos;S EVERY CARD SO FAR.</p>}
    </AppShell>
  );
}
