"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { parseSquadCommentary } from "@/lib/battle/commentary";
import { revealOrder, revealedSlots, slotsAtStep } from "@/lib/battle/reveal";
import { playerLabel } from "@/lib/battle/score";
import { canStart } from "@/lib/kiosk/lobby";
import type { BattlePlayerView, BattleResult, KioskState, Lobby, SquadReveal } from "@/lib/kiosk/types";
import { formatAura } from "@/lib/scoring";
import { OsWindow } from "./OsWindow";
import type { QueuedChallenger } from "@/lib/kiosk/useChallenges";
import type { ModeChoice } from "./props";
import { StatRows, type StatRow } from "./StatRows";
import { MockNotice } from "./StateWindows";

/** ms since `since`, updated every animation frame until `until`. */
function useElapsed(since: number, until: number): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const e = Date.now() - since;
      setElapsed(e);
      if (e < until) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [since, until]);
  return elapsed;
}

// ---------------------------------------------------------------- mode select

/**
 * AURA OS main menu: Aura Battles is the headline mode (big, primary), Solo
 * Scan is the quick warm-up, Squad takes up to five. Buttons work with touch
 * / mouse; the gestures on each button do the same thing.
 */
export function ModeSelectWindow({ onChoose, challengers = [] }: { onChoose: (choice: ModeChoice) => void; challengers?: QueuedChallenger[] }) {
  return (
    <OsWindow title="AURA_OS.EXE · SELECT MODE" className="mode-select" still>
      {challengers.length > 0 && (
        <div className="mode-select__queue">
          <span className="font-heading">UP NEXT</span>
          {challengers.slice(0, 3).map((c) => (
            <span key={c.id} className="mode-select__challenger font-mono">
              {c.name.toUpperCase()} · TO BEAT <span className="font-number">{formatAura(c.target)}</span>
            </span>
          ))}
        </div>
      )}
      <div className="mode-select__grid">
        <button type="button" className="mode-btn mode-btn--primary" onClick={() => onChoose("battle")}>
          <span className="mode-btn__emoji" aria-hidden>
            ✊✊
          </span>
          <span className="mode-btn__title">AURA BATTLE</span>
          <span className="mode-btn__sub">1V1 · FIT + POSE · TWO FISTS</span>
        </button>
        <button type="button" className="mode-btn" onClick={() => onChoose("solo")}>
          <span className="mode-btn__emoji" aria-hidden>
            ✌️✌️
          </span>
          <span className="mode-btn__title">SOLO SCAN</span>
          <span className="mode-btn__sub">QUICK WARM-UP · DOUBLE PEACE</span>
        </button>
        <button type="button" className="mode-btn" onClick={() => onChoose("squad")}>
          <span className="mode-btn__emoji" aria-hidden>
            👍
          </span>
          <span className="mode-btn__title">SQUAD</span>
          <span className="mode-btn__sub">2-5 PLAYERS · THUMBS UP</span>
        </button>
      </div>
    </OsWindow>
  );
}

// ---------------------------------------------------------------- lobby

function SlotCard({ lobby, index, state }: { lobby: Lobby; index: number; state: KioskState }) {
  const slot = lobby.slots.find((s) => s.slot === index);
  const up = !slot && lobby.next === index && (state === "LOBBY" || state === "LOBBY_COUNTDOWN");
  return (
    <div className={`lobby-slot ${slot ? "lobby-slot--locked" : ""} ${up ? "lobby-slot--up" : ""}`}>
      <div className="lobby-slot__photo">
        {slot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.image.dataUrl} alt={`${playerLabel(index)} capture`} />
        ) : (
          <span className="lobby-slot__empty font-number">P{index + 1}</span>
        )}
      </div>
      <div className="lobby-slot__label">{playerLabel(index)}</div>
      <div className="lobby-slot__status">
        {!slot && (up ? (state === "LOBBY_COUNTDOWN" ? "POSING..." : "STEP UP") : "OPEN")}
        {slot?.status === "scoring" && (
          <span>
            SCORING<span className="analyzing__dots" />
          </span>
        )}
        {slot?.status === "ready" && slot.poseResult && `✓ POSE ${slot.poseResult.score}`}
      </div>
    </div>
  );
}

/**
 * The lobby: one slot per player. Duel = two slots with the VS badge between
 * them (armed once both lock in); squad = up to five, START with 2+.
 */
export function LobbyWindow({ lobby, state, onStart }: { lobby: Lobby; state: KioskState; onStart: () => void }) {
  const filled = lobby.slots.length;
  const startable = lobby.mode === "squad" && canStart(lobby) && state === "LOBBY";
  const prompt =
    state === "BATTLE_INTRO"
      ? "LOCKED IN."
      : state === "LOBBY_COUNTDOWN"
        ? lobby.pair
          ? "BOTH OF YOU: STRIKE A POSE"
          : `${playerLabel(lobby.next)}: STRIKE A POSE`
        : lobby.next < lobby.capacity
          ? `${playerLabel(lobby.next)}, STEP UP`
          : "LOBBY FULL";
  const indexes = Array.from({ length: lobby.capacity }, (_, i) => i);
  return (
    <OsWindow title={lobby.mode === "duel" ? "AURA_BATTLE_LOBBY.EXE" : "SQUAD_LOBBY.EXE"} className="lobby-window" still>
      <div className="lobby__prompt font-heading">{prompt}</div>
      <div className="lobby__sub font-mono">
        {state === "LOBBY" && lobby.next < lobby.capacity ? "✌️✌️ DOUBLE PEACE TO CAPTURE · YOUR POSE IS SCORED TOO" : state === "LOBBY_COUNTDOWN" ? "WIDE STANCE, BIG ARMS, COMMIT TO IT." : " "}
      </div>
      <div className={`lobby__slots lobby__slots--${lobby.mode}`}>
        {lobby.mode === "duel" ? (
          <>
            <SlotCard lobby={lobby} index={0} state={state} />
            <div className={`lobby__vs font-number ${filled >= 2 ? "lobby__vs--armed" : ""}`}>VS</div>
            <SlotCard lobby={lobby} index={1} state={state} />
          </>
        ) : (
          indexes.map((i) => <SlotCard key={i} lobby={lobby} index={i} state={state} />)
        )}
      </div>
      {lobby.error && <div className="lobby__error font-heading">&gt; {lobby.error}</div>}
      {lobby.mode === "squad" && state === "LOBBY" && (
        <button type="button" className={`mode-btn mode-btn--start ${startable ? "" : "mode-btn--disabled"}`} disabled={!startable} onClick={onStart}>
          <span className="mode-btn__title">👍 START BATTLE</span>
          <span className="mode-btn__sub">{startable ? `${filled} PLAYERS · NOBODY WAITS FOR A FIFTH` : "NEEDS 2+ PLAYERS"}</span>
        </button>
      )}
    </OsWindow>
  );
}

/** The VS intro: the locked-in players face off while the last scores land (masks the wait). */
export function VsIntro({ lobby }: { lobby: Lobby }) {
  const thumbs = (slots: Lobby["slots"]) =>
    slots.map((s) => (
      <div key={s.captureId} className="vs-intro__thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.image.dataUrl} alt={playerLabel(s.slot)} />
        <span className="font-heading">{playerLabel(s.slot)}</span>
      </div>
    ));
  const half = Math.ceil(lobby.slots.length / 2);
  return (
    <div className="vs-intro" aria-live="assertive">
      <div className="vs-intro__row">
        <div className="vs-intro__side vs-intro__side--left">{thumbs(lobby.slots.slice(0, half))}</div>
        <div className="vs-intro__badge font-number">{lobby.mode === "duel" ? "VS" : `${lobby.slots.length}-WAY`}</div>
        <div className="vs-intro__side vs-intro__side--right">{thumbs(lobby.slots.slice(half))}</div>
      </div>
      <div className="vs-intro__label font-heading">{lobby.mode === "duel" ? "AURA BATTLE" : "SQUAD AURA BATTLE"}</div>
      <div className="vs-intro__sub font-mono">
        COMPUTING AURA DIFFERENTIAL<span className="analyzing__dots" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- result

const COUNT_MS = 1600;

/** The squad countdown is still calling places. */
function counting(reveal: SquadReveal | null): reveal is SquadReveal {
  return reveal !== null && reveal.shown < reveal.total;
}

/** "#5 · DEAD LAST" style place chip for the countdown. */
function placeChip(place: number, last: number): string {
  if (place === last) return `#${place} · DEAD LAST`;
  return `#${place}`;
}

/** The large center number: the score gap (duel) or the group Aura (squad). */
export function BattleHero({ battle, reveal = null, enteredAt }: { battle: BattleResult; reveal?: SquadReveal | null; enteredAt: number }) {
  const elapsed = useElapsed(enteredAt, COUNT_MS + 200);
  const k = Math.min(1, elapsed / COUNT_MS);
  const eased = 1 - Math.pow(1 - k, 3);
  const squad = battle.squad;
  const value = squad ? squad.score : battle.gap;
  const winner = battle.winnerSlot === null ? null : battle.players.find((p) => p.slot === battle.winnerSlot);
  const label = squad ? "GROUP AURA" : battle.winnerSlot === null ? "DEAD TIE" : "AURA GAP";
  return (
    <div className={`battle-hero ${k >= 1 ? "battle-hero--done" : ""}`}>
      <div className="battle-hero__label font-heading">{label}</div>
      <div className="battle-hero__value font-number aura-text-glow">{formatAura(Math.round(value * eased))}</div>
      {counting(reveal) && reveal.callout && (
        <div key={reveal.callout} className="battle-hero__callout font-number aura-text-glow">
          {reveal.callout.toUpperCase()}
        </div>
      )}
      {k >= 1 && !counting(reveal) && (
        <div className="battle-hero__line font-heading">
          {squad
            ? `${squad.vibe.toUpperCase()} · SYNERGY ${squad.synergy}`
            : winner
              ? `${playerLabel(winner.slot)} WINS${battle.decidedBy === "pose" ? " · DECIDED BY THE POSE" : battle.decidedBy === "fit" ? " · DECIDED BY THE FIT" : ""}`
              : "THE AURA IS SHARED"}
        </div>
      )}
    </div>
  );
}

function statRows(p: BattlePlayerView, battle: BattleResult, full: boolean): StatRow[] {
  const decided = battle.winnerSlot === p.slot ? battle.decidedBy : null;
  const b = p.scan.breakdown;
  const rows: StatRow[] = [
    { label: "FIT", value: formatAura(p.fitAura, true), hot: decided === "fit" },
    { label: "POSE", value: `${p.pose.score}${p.pose.archetype !== "unknown" ? ` · ${p.pose.label}` : ""}`, hot: decided === "pose" },
    { label: "TOTAL", value: formatAura(p.total, true) },
  ];
  if (!full) return rows;
  return [
    ...rows,
    { label: "STYLE", value: (p.scan.analysis.style_mix[0]?.style ?? "—").toUpperCase() },
    { label: "COHESION", value: String(b.cohesionScore) },
    { label: "UNIQ", value: String(Math.round(b.avgUniqueness)) },
    { label: "PRICE", value: `$${b.fitValue.toLocaleString("en-US")}` },
  ];
}

/** Stat rows under each mannequin, the winner glowing (placed by the figures' screen positions). */
export function BattleStrip({ battle, reveal = null, xs, enteredAt }: { battle: BattleResult; reveal?: SquadReveal | null; xs: number[]; enteredAt: number }) {
  const elapsed = useElapsed(enteredAt, COUNT_MS + 200);
  const n = battle.players.length;
  // Squad countdown: only the places called so far show; the one just called is in the spotlight.
  const shown = reveal ? revealedSlots(battle.players, reveal.shown) : null;
  const spotlight = reveal && reveal.shown > 0 ? new Set(slotsAtStep(battle.players, reveal.shown - 1)) : new Set<number>();
  const lastPlace = Math.max(...battle.players.map((p) => p.place));
  const allIn = !shown || shown.size === n;
  const settled = elapsed >= COUNT_MS && allIn;
  const squadLines = battle.mode === "squad" && battle.commentary ? parseSquadCommentary(battle.commentary).lines : {};
  // Columns sit under their figure, as wide as the gap to the neighbours allows, never off screen.
  const pos = battle.players.map((_, i) => (xs[i] ?? (i + 0.5) / n) * 100);
  const gap = n > 1 ? Math.min(...pos.slice(1).map((x, i) => x - pos[i])) : 100;
  const width = Math.max(14, Math.min(n <= 2 ? 40 : 96 / n, gap - 1.5));
  const left = (x: number) => Math.max(width / 2, Math.min(100 - width / 2, x));
  return (
    <div className="battle-strip">
      {battle.players.map((p, i) => {
        const hidden = shown !== null && !shown.has(p.slot);
        const called = shown !== null && !hidden;
        const winner = battle.winnerSlot === p.slot && (called || settled);
        const classes = [
          "battle-col",
          winner ? "battle-col--winner" : "",
          settled && battle.winnerSlot !== null && !winner ? "battle-col--other" : "",
          hidden ? "battle-col--hidden" : "",
          spotlight.has(p.slot) ? "battle-col--spotlight" : "",
        ];
        return (
          <div key={p.slot} className={classes.join(" ")} style={{ left: `${left(pos[i])}%`, width: `${width}%` } as CSSProperties}>
            <div className="battle-col__chips">
              <span className="battle-col__label font-heading">{playerLabel(p.slot)}</span>
              {winner && <span className="battle-col__winner font-heading">WINNER</span>}
              {!winner && n > 2 && (called || settled) && <span className="battle-col__place font-heading">{placeChip(p.place, lastPlace)}</span>}
            </div>
            <div className="battle-col__nick font-heading">{p.nickname.toUpperCase()}</div>
            {hidden ? (
              <div className="battle-col__sealed font-heading">SEALED</div>
            ) : (
              <>
                <StatRows rows={statRows(p, battle, n <= 2)} compact />
                {squadLines[p.slot] && <div className="battle-col__line font-mono">{squadLines[p.slot]}</div>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Head-to-head commentary, streamed in token by token. */
export function CommentaryWindow({ battle, reveal = null, done }: { battle: BattleResult; reveal?: SquadReveal | null; done: boolean }) {
  const text = battle.commentary ?? "";
  const squad = battle.mode === "squad" ? parseSquadCommentary(text) : null;
  // Squad countdown: lines appear in the order places are called (last first); the vibe line comes last.
  const called = revealOrder(battle.players)
    .slice(0, reveal ? reveal.shown : undefined)
    .flatMap((step) => step.players);
  const countdownDone = !reveal || reveal.shown >= reveal.total;
  const mock = battle.players.some((p) => p.scan.mock);
  return (
    <OsWindow title="COMMENTARY.EXE" className="commentary-window" still>
      {mock && <MockNotice />}
      <div className="commentary__text">
        {squad ? (
          <>
            {reveal && reveal.shown === 0 && <p className="opacity-70">COUNTING IT DOWN FROM THE BOTTOM...</p>}
            {called.map((p) =>
              squad.lines[p.slot] ? (
                <p key={p.slot} className="commentary__player">
                  <span className="font-heading">
                    #{p.place} {playerLabel(p.slot)}:
                  </span>{" "}
                  {squad.lines[p.slot]}
                </p>
              ) : null,
            )}
            {countdownDone && squad.opener && <p>{squad.opener}</p>}
          </>
        ) : (
          <p>{text}</p>
        )}
        {!done && <span className="terminal__cursor" aria-hidden />}
        {!text && !done && <span className="opacity-70">THE BOOTH IS WARMING UP</span>}
      </div>
      {done && battle.decidedBy === "pose" && <div className="commentary__stamp font-heading">DECIDED BY THE POSE</div>}
    </OsWindow>
  );
}
