"use client";

import { useEffect, useRef, useState } from "react";
import { GREETINGS } from "@/lib/copy";
import type { Framing } from "@/lib/kiosk/framing";
import type { BadgeStatus, CardInfo, LeaderboardSnapshot, SessionState } from "@/lib/kiosk/types";
import { registerPlayer } from "@/lib/kiosk/api";
import { HANDLE_CODE_LENGTH, parseHandle } from "@/lib/players";
import { PLAYER_NAME_MAX, checkPlayerName } from "@/lib/profanity";
import { OsWindow } from "./OsWindow";

/** 3-2-1 countdown, large VT323 digits. */
export function CountdownOverlay({ enteredAt, totalMs = 3000 }: { enteredAt: number; totalMs?: number }) {
  const [remaining, setRemaining] = useState(3);
  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsed = Date.now() - enteredAt;
      setRemaining(Math.max(1, Math.ceil((totalMs - elapsed) / 1000)));
    }, 60);
    return () => window.clearInterval(id);
  }, [enteredAt, totalMs]);
  return (
    <div className="countdown" aria-live="assertive">
      <div key={remaining} className="countdown__digit font-number">
        {remaining}
      </div>
      <div className="countdown__label font-heading">STRIKE A POSE</div>
    </div>
  );
}

export function GreetingWindow({ session }: { session: SessionState }) {
  const line = session.greetingIndex === null ? null : GREETINGS[session.greetingIndex];
  if (!line) return null;
  return (
    <OsWindow title="ANNOUNCER.EXE" className="max-w-md">
      <p className="font-mono text-sm uppercase leading-snug">{line}</p>
    </OsWindow>
  );
}

/** Thumbs down: the extra roast, typed out. */
export function RoastWindow({ text }: { text: string | null }) {
  return (
    <OsWindow title="ROAST.EXE" className="w-[min(92vw,26rem)]">
      <div className="font-heading text-[10px] uppercase opacity-70">EXTRA ROAST · SCORE UNCHANGED</div>
      <div className="mt-1 font-mono text-sm uppercase leading-snug">
        {text ?? (
          <span>
            LOADING ROAST<span className="analyzing__dots" />
          </span>
        )}
      </div>
    </OsWindow>
  );
}

/**
 * Thumbs up on a result: type a leaderboard name. Enter joins (empty keeps the
 * generated nickname), Esc goes back to the result. A new name gets an AURA ID
 * (NAME#CODE) for their history; typing an existing AURA ID continues it. The
 * input keeps focus so stray keys never reach the operator hotkeys.
 */
export function NameEntryWindow({ suggestion, onSubmit, onCancel }: { suggestion: string; onSubmit: (name: string | null, handle: string | null) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus on open, and again after a lookup (the input is disabled while checking).
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  const submit = async () => {
    if (busy) return;
    const returning = parseHandle(value);
    const check = checkPlayerName(returning ? returning.name : value);
    if (!check.ok) return setError(check.error);
    if (!check.name) return onSubmit(null, null);
    setBusy(true);
    const player = await registerPlayer(returning ? { handle: returning.handle } : { name: check.name });
    setBusy(false);
    if (player === "unknown") return setError("AURA ID NOT FOUND. CHECK THE CODE, OR TYPE JUST YOUR NAME FOR A NEW ONE.");
    // Registry offline: still join the board, just without a history link.
    onSubmit(player?.name ?? check.name, player?.handle ?? null);
  };

  return (
    <OsWindow title="JOIN_LEADERBOARD.EXE" variant="light" className="w-[min(92vw,26rem)]">
      <form
        className="name-entry"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="player-name" className="font-heading text-xs uppercase">
          TYPE YOUR NAME FOR THE LEADERBOARD
        </label>
        <input
          id="player-name"
          ref={inputRef}
          className="name-entry__input"
          value={value}
          maxLength={PLAYER_NAME_MAX + HANDLE_CODE_LENGTH + 1}
          placeholder={suggestion.toUpperCase()}
          disabled={busy}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby="player-name-hint"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          onBlur={() => requestAnimationFrame(() => inputRef.current?.focus())}
        />
        <div className="name-entry__meta font-mono text-[10px] uppercase">
          <span id="player-name-hint" className={error ? "name-entry__error" : "opacity-70"}>
            {error ?? (busy ? "CHECKING IN..." : "ENTER TO JOIN · ESC TO GO BACK · BEEN HERE BEFORE? TYPE YOUR AURA ID (NAME#CODE)")}
          </span>
        </div>
      </form>
    </OsWindow>
  );
}

/** After the name: the QR code to the saved share card. */
export function ClaimWindow({ card, error, printing, badge = null }: { card: CardInfo | null; error: string | null; printing: boolean; badge?: BadgeStatus | null }) {
  return (
    <OsWindow title="CLAIM_CARD.EXE" variant="light" className="w-[min(92vw,22rem)]">
      <div className="flex flex-col items-center gap-3 text-center">
        {card ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.qrDataUrl} alt="QR code to your aura card" className="claim-qr" />
            <div className="font-heading text-xs uppercase">SCAN TO GET YOUR CARD</div>
            <div className="font-mono text-[9px] uppercase opacity-60 break-all">{card.pageUrl.replace(/^https?:\/\//, "")}</div>
          </>
        ) : error ? (
          <>
            <div className="font-number text-4xl leading-none">!</div>
            <div className="font-heading text-xs uppercase">{error}</div>
          </>
        ) : (
          <>
            <div className="qr-placeholder" aria-hidden />
            <div className="font-heading text-xs uppercase">
              SAVING CARD<span className="analyzing__dots" />
            </div>
            <div className="font-mono text-[10px] uppercase opacity-60">FACE BLURRED. PHOTO NOT STORED.</div>
          </>
        )}
        {printing && <div className="font-mono text-[10px] uppercase opacity-70">PRINTING CERTIFICATE...</div>}
        {badge?.status === "minting" && (
          <div className="font-mono text-[10px] uppercase opacity-70">
            MINTING YOUR AURA BADGE ON SOLANA<span className="analyzing__dots" />
          </div>
        )}
        {badge?.status === "minted" && <div className="font-heading text-[10px] uppercase">✓ AURA BADGE MINTED ON SOLANA (DEVNET)</div>}
      </div>
    </OsWindow>
  );
}

/** One person holds up two fists, but the other person in frame is not in on the battle yet. */
export function BattleWaitingWindow({ waiting }: { waiting: boolean }) {
  if (!useSettled(waiting)) return null;
  return (
    <OsWindow title="AURA_BATTLE.EXE" variant="light" className="w-[min(92vw,24rem)]">
      <div className="font-heading text-lg uppercase">WAITING FOR AN OPPONENT</div>
      <div className="mt-1 font-mono text-[10px] uppercase opacity-70">YOUR OPPONENT HAS TO PUT THEIR FISTS UP (OR DOUBLE PEACE) TOO. BOTH OF YOU FACE THE MIRROR.</div>
    </OsWindow>
  );
}

/** How long the solo-battle roast stays up. */
const SOLO_ROAST_MS = 4500;

/** Two fists with nobody else in frame. Remount with key={tick} to show it again. */
export function SoloBattleWindow({ text }: { text: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(false), SOLO_ROAST_MS);
    return () => window.clearTimeout(id);
  }, []);
  if (!shown) return null;
  return (
    <OsWindow title="AURA_BATTLE.EXE" variant="light" className="w-[min(92vw,26rem)]">
      <div className="font-heading text-lg uppercase">OPPONENT NOT FOUND</div>
      <div className="mt-2 font-heading text-xs uppercase">{text}</div>
    </OsWindow>
  );
}

export function BattleWindow({ phase }: { phase: "countdown" | "result" }) {
  return (
    <OsWindow title="AURA_BATTLE.EXE" variant="light" className="w-[min(92vw,26rem)]">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="font-heading text-base uppercase">{phase === "countdown" ? "AURA BATTLE" : "BATTLE COMPLETE"}</div>
        <div className="font-mono text-[10px] uppercase opacity-60">{phase === "countdown" ? "BOTH OF YOU: STRIKE A POSE" : "THUMBS UP TO CLAIM THE BATTLE CARD"}</div>
      </div>
    </OsWindow>
  );
}

/** Cyan anger mark above the mannequin's head (wave meltdown). */
export function AngerSymbol() {
  return (
    <svg className="anger-symbol" viewBox="0 0 100 100" aria-hidden>
      {[0, 90, 180, 270].map((a) => (
        <path key={a} d="M50 8 A42 42 0 0 1 92 50" transform={`rotate(${a} 50 50)`} className="anger-symbol__arc" />
      ))}
    </svg>
  );
}

/** Asks the person to step back (scan gestures are held) or come closer. */
/** How long a tracking-driven prompt must hold before it shows or hides, so flicker never blinks it. */
const PROMPT_SETTLE_MS = 500;

/** `value` once it has stayed the same for `ms` (the previous settled value until then). */
function useSettled<T>(value: T, ms = PROMPT_SETTLE_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, settled, ms]);
  return settled;
}

export function FramingWindow({ framing }: { framing: Framing }) {
  const shown = useSettled(framing === "step_back" || framing === "step_closer" ? framing : null);
  if (!shown) return null;
  const back = shown === "step_back";
  return (
    <OsWindow title="FRAMING.EXE" variant="light" className="w-[min(92vw,24rem)]">
      <div className="font-heading text-xl uppercase">{back ? "STEP BACK" : "COME CLOSER"}</div>
      <div className="mt-1 font-mono text-[10px] uppercase opacity-70">
        {back ? "GET YOUR WHOLE FIT IN FRAME, HEAD TO SHOES, THEN DOUBLE PEACE." : "FILL THE FRAME SO THE FIT IS READABLE."}
      </div>
    </OsWindow>
  );
}

/** Shown on every mock result so a sample fit is never mistaken for a real read. */
export function MockNotice() {
  return <div className="mock-notice">MOCK MODE: NO OPENAI_API_KEY SET. THIS IS A SAMPLE FIT, NOT YOURS.</div>;
}

export function SystemErrorWindow({ message }: { message: string }) {
  return (
    <OsWindow title="SYSTEM_ERROR.EXE" variant="light" className="w-[min(92vw,26rem)]">
      <div className="flex items-start gap-3">
        <span className="font-number text-4xl leading-none">!</span>
        <div>
          <div className="font-heading text-xs uppercase">&gt; {message}</div>
          <div className="mt-1 font-mono text-[10px] uppercase opacity-60">RETURNING TO READY.</div>
        </div>
      </div>
    </OsWindow>
  );
}

/** Live top 5 + total scans today. Flashes when a new #1 arrives. */
export function TideChartWindow({
  snapshot,
  kingTick,
  className = "",
}: {
  snapshot: LeaderboardSnapshot | null;
  kingTick: number;
  className?: string;
}) {
  const top = snapshot?.top.slice(0, 5) ?? [];
  return (
    <OsWindow title="TIDE_CHART.EXE" className={`${className} ${kingTick > 0 ? "tide-chart--king" : ""}`} still>
      <div key={kingTick} className={kingTick > 0 ? "tide-chart__flash" : ""}>
        <div className="flex items-baseline justify-between">
          <span className="font-heading text-[10px] uppercase opacity-80">TOP FITS</span>
          <span className="font-mono text-[10px] uppercase opacity-70">{snapshot ? `${snapshot.totalToday} SCANS TODAY` : "..."}</span>
        </div>
        {snapshot && snapshot.store === "memory" && (
          <div className="mt-1 font-mono text-[9px] uppercase opacity-50">LOCAL ONLY · SET TIGER_DATABASE_URL TO PERSIST</div>
        )}
        <ol className="tide-list mt-2 font-mono text-[11px] uppercase">
          {[0, 1, 2, 3, 4].map((i) => {
            const e = top[i];
            return (
              <li key={e?.id ?? i} className={i === 0 && e ? "tide-list__king" : ""}>
                <span className="opacity-50">#{i + 1}</span>
                <span className="tide-list__nick">{e ? e.nickname.toUpperCase() : "--------"}</span>
                <span className="tide-list__aura">{e ? e.aura.toLocaleString("en-US") : ""}</span>
              </li>
            );
          })}
        </ol>
        {kingTick > 0 && <div className="mt-2 font-heading text-[10px] uppercase aura-text-glow">NEW AURA KING</div>}
      </div>
    </OsWindow>
  );
}
