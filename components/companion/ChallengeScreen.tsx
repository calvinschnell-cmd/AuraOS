"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clientId } from "@/lib/companion/identity";
import type { DuelBattleView, DuelView } from "@/lib/duels/types";
import { formatAura } from "@/lib/scoring";
import { AppShell } from "./AppShell";

/** Results show up here on their own (another friend accepting, the challenger watching). */
const POLL_MS = 6_000;

/**
 * The challenger's card with the score blacked out: the aura block and the
 * "beat X?" line sit at fixed spots on the one card template.
 */
function HiddenScoreCard({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="duel-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="card-page__img" />
      <span className="duel-card__redact duel-card__redact--hero font-heading">
        AURA
        <br />
        ???,???
      </span>
      <span className="duel-card__redact duel-card__redact--cta font-heading">SCORE HIDDEN TILL YOU SCAN</span>
    </div>
  );
}

function BattleResult({ b, challengerName, challengerImage, highlight }: { b: DuelBattleView; challengerName: string; challengerImage: string; highlight: boolean }) {
  const side = (who: "challenger" | "friend") => {
    const won = b.winner === who;
    const name = who === "challenger" ? challengerName : b.friend.name;
    const total = who === "challenger" ? b.challengerTotal : b.friendTotal;
    const img = who === "challenger" ? challengerImage : b.friend.imageUrl;
    const href = who === "challenger" ? null : `/r/${b.friend.cardId}`;
    const body = (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={`${name}'s card`} />
        {won && <span className="duel-side__win font-heading">WINNER</span>}
        <span className="duel-side__name font-heading">{name}</span>
        <span className="duel-side__total font-number">{formatAura(total, true)}</span>
      </>
    );
    return href ? (
      <Link href={href} className={`duel-side ${won ? "duel-side--won" : ""}`}>
        {body}
      </Link>
    ) : (
      <div className={`duel-side ${won ? "duel-side--won" : ""}`}>{body}</div>
    );
  };
  return (
    <section className={`os-window os-window--dark duel-result ${highlight ? "duel-result--mine" : ""}`}>
      <header className="os-window__title">
        <span>{highlight ? "YOUR_BATTLE.EXE" : "BATTLE_RESULT.EXE"}</span>
        <span>x</span>
      </header>
      <div className="os-window__body">
        <div className="duel-sides">
          {side("challenger")}
          <span className="duel-vs font-heading" aria-hidden>
            VS
          </span>
          {side("friend")}
        </div>
        <div className="duel-verdict font-heading">{b.winner === "tie" ? "DEAD TIE" : `${b.winner === "challenger" ? challengerName : b.friend.name} WINS BY ${formatAura(b.gap)}`}</div>
        {b.commentary ? <p className="companion__commentary">&gt; {b.commentary}</p> : <p className="companion__note">THE JUDGES ARE STILL TALKING...</p>}
      </div>
    </section>
  );
}

/**
 * /c/[id]: a challenge link. Friends see who sent it and their card with the
 * score hidden, then scan to battle (same /scan flow and limits). After
 * scanning, and for the challenger, every result: both cards, the winner and
 * the commentary. Anyone can accept; each accept is its own battle.
 */
export function ChallengeScreen({ initial, highlightAccept = null }: { initial: DuelView; highlightAccept?: string | null }) {
  const [view, setView] = useState(initial);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/duels/${initial.id}`, { headers: { "X-Device-Id": clientId() }, cache: "no-store" });
        if (res.ok && !cancelled) setView((await res.json()) as DuelView);
      } catch {
        // offline: keep what we have
      }
    };
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [initial.id]);

  const c = view.challenger;
  const mine = view.battles.filter((b) => b.mine);
  const others = view.battles.filter((b) => !b.mine);
  const scanHref = `/scan?c=${encodeURIComponent(view.id)}`;

  const shareLink = async () => {
    const url = `${window.location.origin}/c/${view.id}`;
    const text = `I got ${c.aura !== null ? formatAura(c.aura) : "a big number"} aura on AURA OS. Think you can beat me?`;
    setNote(null);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "AURA OS CHALLENGE", text, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setNote("LINK COPIED. SEND IT TO A FRIEND.");
    } catch {
      setNote(url);
    }
  };

  return (
    <AppShell title="CHALLENGE" tab={null}>
      <div className="wordmark">
        <h1 className="wordmark__title font-heading uppercase">{view.role === "challenger" ? "YOUR CHALLENGE" : `${c.name} CHALLENGES YOU`}</h1>
        <p className="wordmark__sub font-mono uppercase">
          {view.count === 0 ? "NOBODY HAS TAKEN IT ON YET" : `${view.count} ${view.count === 1 ? "FRIEND HAS" : "FRIENDS HAVE"} TAKEN IT ON`}
          {c.handle ? ` · ${c.handle}` : ""}
        </p>
      </div>

      {mine.map((b) => (
        <BattleResult key={b.acceptId} b={b} challengerName={c.name} challengerImage={c.imageUrl} highlight={b.acceptId === highlightAccept || mine.length === 1} />
      ))}

      <section className="os-window os-window--dark">
        <header className="os-window__title">
          <span>{view.role === "visitor" ? "CHALLENGER.PNG" : "THE_CARD_TO_BEAT.PNG"}</span>
          <span>x</span>
        </header>
        <div className="os-window__body companion__cta">
          {view.role === "visitor" ? (
            <HiddenScoreCard src={c.imageUrl} alt={`${c.name}'s card, score hidden`} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.imageUrl} alt={`${c.name}'s card`} className="card-page__img" />
          )}
          {c.aura !== null && <div className="companion__target font-number aura-text-glow">{formatAura(c.aura)}</div>}
          {view.role === "challenger" ? (
            <>
              <button type="button" className="companion__big-btn" onClick={() => void shareLink()}>
                [SEND THE LINK]
              </button>
              {note && <p className="companion__note result-share-note">{note}</p>}
              <p className="companion__note">EVERY FRIEND WHO SCANS GETS THEIR OWN BATTLE AGAINST THIS CARD. RESULTS SHOW UP HERE.</p>
            </>
          ) : (
            <>
              <Link href={scanHref} className="companion__big-btn companion__link-btn">
                [{view.role === "friend" ? "RUN IT BACK: SCAN AGAIN" : "SCAN YOUR FIT TO ACCEPT"}]
              </Link>
              <p className="companion__note">
                {view.role === "friend" ? "NEW FIT, NEW BATTLE." : "SNAP YOUR FIT. THE JUDGES SCORE YOU BOTH AND ROAST THE RESULT."}
              </p>
            </>
          )}
        </div>
      </section>

      {others.length > 0 && (
        <>
          <h2 className="duel-heading font-heading">{view.role === "challenger" ? "EVERYONE WHO TOOK IT ON" : "OTHER BATTLES"}</h2>
          {others.map((b) => (
            <BattleResult key={b.acceptId} b={b} challengerName={c.name} challengerImage={c.imageUrl} highlight={false} />
          ))}
        </>
      )}
    </AppShell>
  );
}
