"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { parseSquadCommentary } from "@/lib/battle/commentary";
import { playerLabel } from "@/lib/battle/score";
import type { FeedDetail } from "@/lib/feed/types";
import { historyPath } from "@/lib/players";
import { formatAura } from "@/lib/scoring";
import { beatThisLine } from "@/lib/share/caption";
import { IdentityForm, useIdentity } from "./Identity";
import { Reactions } from "./Reactions";

const noSubscribe = () => () => {};

const KIND_LABEL = { scan: "SOLO SCAN", battle: "AURA BATTLE", squad: "SQUAD BATTLE" } as const;

/**
 * The page a card's QR lands a friend on: that exact battle / scan full-size,
 * the "beat this score" CTA as a real button (joins the kiosk's challenger
 * queue), share with a ready caption, reactions, and "this was me".
 */
export function ResultScreen({ detail }: { detail: FeedDetail }) {
  const { entry, battle, scan, children } = detail;
  const [player, setPlayer] = useIdentity();
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<number | null>(null);
  const [askName, setAskName] = useState<"beat" | "claim" | null>(null);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const filename = `aura-${entry.kind}-${entry.id.slice(0, 8)}.png`;
  // Browser-only capability: false on the server render, then the real answer (no hydration mismatch).
  const canShare = useSyncExternalStore(noSubscribe, () => typeof navigator.share === "function", () => false);

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
        const res = await fetch(`/api/feed/${entry.id}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, slot }) });
        const body = (await res.json()) as { error?: string };
        setClaimMsg(res.ok ? "CLAIMED. IT COUNTS FOR YOUR STREAKS AND RIVALRIES NOW." : (body.error ?? "COULD NOT CLAIM."));
      } finally {
        setBusy(false);
      }
    },
    [entry.id],
  );

  const download = useCallback(async () => {
    try {
      const blob = await (await fetch(entry.imageUrl)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      window.open(entry.imageUrl, "_blank");
    }
  }, [entry.imageUrl, filename]);

  const share = useCallback(async () => {
    try {
      const blob = await (await fetch(entry.imageUrl)).blob();
      const file = new File([blob], filename, { type: "image/png" });
      const data: ShareData = { title: "AURA OS", text: entry.caption ?? beatThisLine(entry.target), url: window.location.href };
      if (navigator.canShare?.({ files: [file] })) data.files = [file];
      await navigator.share(data);
    } catch {
      // cancelled or unsupported
    }
  }, [entry.imageUrl, entry.caption, entry.target, filename]);

  const copyCaption = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${entry.caption ?? beatThisLine(entry.target)} ${window.location.href}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [entry.caption, entry.target]);

  const squadLines = battle?.mode === "squad" && battle.commentary ? parseSquadCommentary(battle.commentary) : null;
  // Squad member cards already know their slot; battle cards ask which player you were.
  const claimSlots = battle ? (entry.slot !== null ? [entry.slot] : battle.players.filter((p) => !p.handle).map((p) => p.slot)) : [];
  const canClaim = battle ? claimSlots.length > 0 : scan !== null && !scan.handle;

  return (
    <main className="companion aura-grid-bg">
      <header className="top-bar">
        <span className="font-heading text-[11px] uppercase tracking-[0.2em]">AURA OS · {KIND_LABEL[entry.kind]}</span>
        <Link href="/feed" className="font-heading text-[10px] uppercase">
          [FEED]
        </Link>
      </header>

      <div className="companion__col">
        <section className="os-window os-window--dark">
          <header className="os-window__title">
            <span>{entry.kind === "scan" ? "AURA_CARD.PNG" : entry.kind === "battle" ? "AURA_BATTLE_CARD.PNG" : "SQUAD_BATTLE_CARD.PNG"}</span>
            <span>x</span>
          </header>
          <div className="os-window__body companion__card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.imageUrl} alt={`${KIND_LABEL[entry.kind]} card: ${entry.title}`} className="card-page__img" />
            <Reactions cardId={entry.id} initial={entry.reactions} />
          </div>
        </section>

        <section className="os-window os-window--dark">
          <header className="os-window__title">
            <span>BEAT_THIS_SCORE.EXE</span>
            <span>x</span>
          </header>
          <div className="os-window__body companion__cta">
            <div className="companion__target font-number aura-text-glow">{formatAura(entry.target)}</div>
            <div className="font-heading text-xs uppercase">{beatThisLine(entry.target)}</div>
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
              <button type="button" className="companion__big-btn" disabled={busy} onClick={() => (player ? void beat(player.name) : setAskName("beat"))}>
                [BEAT THIS SCORE]
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
              {canShare && (
                <button type="button" className="card-page__button" onClick={share}>
                  [SHARE]
                </button>
              )}
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
      </div>
    </main>
  );
}
