"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { FeedEntry } from "@/lib/feed/types";
import { formatAura } from "@/lib/scoring";
import { IdentityBar } from "./Identity";
import { Reactions } from "./Reactions";

const KIND_CHIP = { scan: "SOLO", battle: "1V1", squad: "SQUAD" } as const;
const HEADLINE_LABEL = { scan: "AURA", battle: "WON BY", squad: "GROUP AURA" } as const;

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}S AGO`;
  if (s < 3600) return `${Math.round(s / 60)}M AGO`;
  return `${Math.round(s / 3600)}H AGO`;
};

/** The public feed: every saved card (scans, battles, squads), newest first. */
export function FeedScreen({ initial, initialNext }: { initial: FeedEntry[]; initialNext: string | null }) {
  const [entries, setEntries] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);

  const more = useCallback(async () => {
    if (!next) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?before=${encodeURIComponent(next)}`);
      const body = (await res.json()) as { entries: FeedEntry[]; next: string | null };
      setEntries((e) => [...e, ...body.entries]);
      setNext(body.next);
    } finally {
      setLoading(false);
    }
  }, [next]);

  return (
    <main className="companion aura-grid-bg">
      <header className="top-bar">
        <span className="font-heading text-[11px] uppercase tracking-[0.2em]">AURA OS · FEED</span>
        <Link href="/leaderboard" className="font-heading text-[10px] uppercase">
          [LEADERBOARD]
        </Link>
      </header>
      <div className="companion__col">
        <div className="wordmark">
          <h1 className="wordmark__title font-heading uppercase">AURA BATTLES</h1>
          <p className="wordmark__sub font-mono uppercase">EVERY CARD FROM THE MIRROR, LIVE</p>
        </div>
        <IdentityBar />
        {entries.length === 0 && <p className="companion__note">NO CARDS YET. BATTLE SOMEONE AT THE MIRROR AND GIVE IT A THUMBS UP.</p>}
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
        {next && (
          <button type="button" className="card-page__button" onClick={more} disabled={loading}>
            [{loading ? "LOADING..." : "LOAD MORE"}]
          </button>
        )}
      </div>
    </main>
  );
}
