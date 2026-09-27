"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { parseSquadCommentary } from "@/lib/battle/commentary";
import { clientId } from "@/lib/companion/identity";
import { playerLabel } from "@/lib/battle/score";
import type { FeedDetail } from "@/lib/feed/types";
import { historyPath } from "@/lib/players";
import { formatAura } from "@/lib/scoring";
import { beatThisLine } from "@/lib/share/caption";
import { AppShell } from "./AppShell";
import { DecodeNumber } from "./DecodeNumber";
import { IdentityForm, useIdentity } from "./Identity";
import { Reactions } from "./Reactions";

const KIND_LABEL = { scan: "SOLO SCAN", battle: "AURA BATTLE", squad: "SQUAD BATTLE" } as const;

/**
 * The page a card's QR lands a friend on: that exact battle / scan full-size,
 * the "beat this score" CTA as a real button (joins the kiosk's challenger
 * queue), share with a ready caption, reactions, and "this was me".
 */
export function ResultScreen({ detail, timingMs = null }: { detail: FeedDetail; timingMs?: number | null }) {
  const { entry, battle, scan, children } = detail;
  /** This phone scanned (or claimed) it: challenge a friend instead of "scan yours". */
  const [mine, setMine] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cards/${entry.id}/mine`, { headers: { "X-Device-Id": clientId() }, cache: "no-store" })
      .then((r) => r.json() as Promise<{ mine?: boolean }>)
      .then((b) => {
        if (!cancelled) setMine(Boolean(b.mine));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entry.id]);
  const [player, setPlayer] = useIdentity();
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<number | null>(null);
  const [askName, setAskName] = useState<"beat" | "claim" | null>(null);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Mirror cards are PNG, phone cards JPEG: the extension follows the bytes. */
  const fileName = useCallback((blob: Blob) => `aura-${entry.kind}-${entry.id.slice(0, 8)}.${blob.type.includes("jpeg") ? "jpg" : "png"}`, [entry.kind, entry.id]);

  // Removed by an admin while open: the page says so on its next check.
  const [removed, setRemoved] = useState(false);
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/feed/${entry.id}`, { cache: "no-store" });
        if (res.status === 404) setRemoved(true);
      } catch {
        // offline: keep showing it
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, [entry.id]);

  const beat = useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        const res = await fetch("/api/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, cardId: entry.id }) });
        const body = (await res.json()) as { position?: number };
        if (body.position) setQueued(body.position);
      } finally {
        setBusy(false);
      }
    },
    [entry.id],
  );

  const claim = useCallback(
    async (handle: string, slot: number | null) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/feed/${entry.id}/claim`, { method: "POST", headers: { "Content-Type": "application/json", "X-Device-Id": clientId() }, body: JSON.stringify({ handle, slot }) });
        const body = (await res.json()) as { error?: string };
        setClaimMsg(res.ok ? "CLAIMED. IT COUNTS FOR YOUR STREAKS AND RIVALRIES NOW." : (body.error ?? "COULD NOT CLAIM."));
        if (res.ok && !battle) setMine(true);
      } finally {
        setBusy(false);
      }
    },
    [entry.id, battle],
  );

  const download = useCallback(async () => {
    try {
      const blob = await (await fetch(entry.imageUrl)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      window.open(entry.imageUrl, "_blank");
    }
  }, [entry.imageUrl, fileName]);

  const pageLink = useCallback(() => `${window.location.origin}/r/${entry.id}`, [entry.id]);

  /** The native share sheet with the card image; else copy the link (the download button sits below). */
  const share = useCallback(async () => {
    setShareNote(null);
    const text = entry.caption ?? beatThisLine(entry.target);
    if (typeof navigator.share === "function") {
      try {
        const blob = await (await fetch(entry.imageUrl)).blob();
        const file = new File([blob], fileName(blob), { type: blob.type || "image/jpeg" });
        const data: ShareData = { title: "AURA OS", text, url: pageLink() };
        if (navigator.canShare?.({ files: [file] })) data.files = [file];
        await navigator.share(data);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // they closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${pageLink()}`);
      setShareNote("LINK COPIED. PASTE IT ANYWHERE, OR SAVE THE CARD BELOW.");
    } catch {
      setShareNote(pageLink());
    }
  }, [entry.imageUrl, entry.caption, entry.target, fileName, pageLink]);

  const copyCaption = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${entry.caption ?? beatThisLine(entry.target)} ${pageLink()}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [entry.caption, entry.target, pageLink]);

  const squadLines = battle?.mode === "squad" && battle.commentary ? parseSquadCommentary(battle.commentary) : null;
  // Squad member cards already know their slot; battle cards ask which player you were.
  const claimSlots = battle ? (entry.slot !== null ? [entry.slot] : battle.players.filter((p) => !p.handle).map((p) => p.slot)) : [];
  const canClaim = battle ? claimSlots.length > 0 : scan !== null && !scan.handle;

  if (removed) {
    return (
      <AppShell title="REMOVED" tab="feed">
        <div className="result-removed">
          <p className="companion__note">THIS CARD WAS TAKEN DOWN.</p>
          <Link href="/feed" className="card-page__button">
            [BACK TO THE FEED]
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={KIND_LABEL[entry.kind]} tab="feed">
        <section className="os-window os-window--dark">
          <header className="os-window__title">
            <span>{entry.kind === "scan" ? "AURA_CARD.PNG" : entry.kind === "battle" ? "AURA_BATTLE_CARD.PNG" : "SQUAD_BATTLE_CARD.PNG"}</span>
            <span>x</span>
          </header>
          <div className="os-window__body companion__card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.imageUrl} alt={`${KIND_LABEL[entry.kind]} card: ${entry.title}`} className="card-page__img" />
            <div className="result-meta font-heading">
              <span className={`source-chip source-chip--${entry.source}`}>{entry.source === "mobile" ? "PHONE SCAN" : "MIRROR SCAN"}</span>
              {timingMs !== null && <span className="result-timing">PHOTO → CARD IN {(timingMs / 1000).toFixed(1)} S</span>}
            </div>
            <button type="button" className="companion__big-btn" onClick={() => void share()}>
              [SHARE YOUR CARD]
            </button>
            {shareNote && <p className="companion__note result-share-note">{shareNote}</p>}
            <Reactions cardId={entry.id} initial={entry.reactions} />
          </div>
        </section>

        <section className="os-window os-window--dark">
          <header className="os-window__title">
            <span>BEAT_THIS_SCORE.EXE</span>
            <span>x</span>
          </header>
          <div className="os-window__body companion__cta">
            <DecodeNumber value={entry.target} className="companion__target font-number aura-text-glow" />
            <div className="font-heading text-xs uppercase">{beatThisLine(entry.target)}</div>
            {mine ? (
              <p className="companion__note">THIS ONE&apos;S YOURS. SEND IT TO A FRIEND AND SEE IF THEY CAN BEAT IT.</p>
            ) : (
              <Link href="/scan" className="companion__big-btn companion__link-btn">
                [SCAN YOURS]
              </Link>
            )}
            {queued !== null ? (
              <p className="companion__note">
                YOU&apos;RE #{queued} IN LINE. HEAD TO THE AURA OS MIRROR AND THROW TWO FISTS (OR DOUBLE PEACE) WHEN IT&apos;S FREE.
              </p>
            ) : askName === "beat" ? (
              <IdentityForm
                cta="JOIN THE QUEUE"
                onDone={(p) => {
                  setPlayer(p);
                  setAskName(null);
                  void beat(p.name);
                }}
              />
            ) : (
              <button type="button" className="card-page__button" disabled={busy} onClick={() => (player ? void beat(player.name) : setAskName("beat"))}>
                [BEAT IT AT THE MIRROR: JOIN THE LINE]
              </button>
            )}
          </div>
        </section>

        {battle && (
          <section className="os-window os-window--dark">
            <header className="os-window__title">
              <span>{battle.mode === "squad" ? "SQUAD_RESULT.EXE" : "BATTLE_RESULT.EXE"}</span>
              <span>x</span>
            </header>
            <div className="os-window__body">
              {battle.squad && (
                <div className="companion__squad font-heading uppercase">
                  {battle.squad.vibe} · SYNERGY {battle.squad.synergy} · GROUP {formatAura(battle.squad.score)}
                </div>
              )}
              <ol className="companion__players">
                {battle.players.map((p) => (
                  <li key={p.slot} className={battle.winnerSlot === p.slot ? "companion__player--winner" : ""}>
                    <span className="font-heading">
                      {playerLabel(p.slot)}
                      {battle.winnerSlot === p.slot ? " · WINNER" : ""}
                    </span>
                    <span className="companion__nick">{p.nickname.toUpperCase()}</span>
                    <span className="companion__stats font-mono">
                      FIT {formatAura(p.fitAura, true)} · POSE {p.pose.score}
                      {p.pose.archetype !== "unknown" ? ` (${p.pose.label}, ${p.pose.match}% MATCH)` : ""} · TOTAL {formatAura(p.total, true)}
                    </span>
                    {squadLines?.lines[p.slot] && <span className="companion__line">{squadLines.lines[p.slot]}</span>}
                    {p.handle && (
                      <a className="companion__handle" href={historyPath(p.handle)}>
                        {p.handle}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
              {battle.commentary && <p className="companion__commentary">&gt; {squadLines ? squadLines.opener : battle.commentary}</p>}
            </div>
          </section>
        )}

        {scan && (
          <section className="os-window os-window--dark">
            <header className="os-window__title">
              <span>ANALYSIS.TXT</span>
              <span>x</span>
            </header>
            <div className="os-window__body">
              <div className="font-heading uppercase">{scan.nickname}</div>
              <div className="companion__stats font-mono uppercase">{scan.styles}</div>
              <dl className="result-stats font-mono">
                <div>
                  <dt>FIT VALUE</dt>
                  <dd>${scan.stats.fitValue.toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt>UNIQUENESS</dt>
                  <dd>{scan.stats.uniqueness}</dd>
                </div>
                <div>
                  <dt>COHESION</dt>
                  <dd>{scan.stats.cohesion}</dd>
                </div>
                <div>
                  <dt>STATEMENT PIECES</dt>
                  <dd>{scan.stats.statements}</dd>
                </div>
              </dl>
              {scan.modifiers.length > 0 && (
                <ul className="result-mods font-mono uppercase">
                  {scan.modifiers.map((m) => (
                    <li key={m.label}>
                      <span aria-hidden>{m.emoji}</span> {m.label}
                    </li>
                  ))}
                </ul>
              )}
              <p className="companion__commentary">&gt; {scan.verdict}</p>
              {scan.handle && (
                <a className="companion__handle" href={historyPath(scan.handle)}>
                  {scan.handle}
                </a>
              )}
            </div>
          </section>
        )}

        {children.length > 0 && (
          <section className="os-window os-window--dark">
            <header className="os-window__title">
              <span>SQUAD_MEMBER_CARDS/</span>
              <span>x</span>
            </header>
            <div className="os-window__body companion__children">
              {children.map((c) => (
                <Link key={c.id} href={`/r/${c.id}`} className="companion__child">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt={c.title} />
                  <span className="font-heading">{c.slot !== null ? playerLabel(c.slot) : c.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="os-window os-window--dark">
          <header className="os-window__title">
            <span>SHARE.EXE</span>
            <span>x</span>
          </header>
          <div className="os-window__body companion__share">
            {entry.caption && <p className="companion__caption">{entry.caption}</p>}
            <div className="card-page__actions">
              <button type="button" className="card-page__button" onClick={copyCaption}>
                [{copied ? "COPIED" : "COPY CAPTION"}]
              </button>
              <button type="button" className="card-page__button" onClick={download}>
                [DOWNLOAD]
              </button>
            </div>
          </div>
        </section>

        {canClaim && (
          <section className="os-window os-window--dark">
            <header className="os-window__title">
              <span>THIS_WAS_ME.EXE</span>
              <span>x</span>
            </header>
            <div className="os-window__body companion__claim">
              {claimMsg ? (
                <p className="companion__note">{claimMsg}</p>
              ) : !player || askName === "claim" ? (
                <>
                  <p className="companion__note">PUT YOUR NAME ON IT: STREAKS, RIVALRIES AND YOUR HISTORY COUNT IT.</p>
                  <IdentityForm
                    cta="THAT'S ME"
                    onDone={(p) => {
                      setPlayer(p);
                      setAskName(null);
                      if (!battle) void claim(p.handle, null);
                      else if (claimSlots.length === 1) void claim(p.handle, claimSlots[0]);
                    }}
                  />
                </>
              ) : battle ? (
                <div className="card-page__actions">
                  {claimSlots.map((slot) => (
                    <button key={slot} type="button" className="card-page__button" disabled={busy} onClick={() => void claim(player.handle, slot)}>
                      [I WAS {playerLabel(slot)}]
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" className="card-page__button" disabled={busy} onClick={() => void claim(player.handle, null)}>
                  [THIS WAS ME · {player.handle}]
                </button>
              )}
            </div>
          </section>
        )}

        <p className="card-page__note">AURA OS · AURA BATTLES. PHOTOS ARE NEVER STORED, ONLY THIS FACE-BLURRED CARD.</p>
    </AppShell>
  );
}
