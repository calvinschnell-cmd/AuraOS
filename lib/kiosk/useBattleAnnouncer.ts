"use client";

import { useEffect, useRef, useState } from "react";
import { parseSquadCommentary } from "@/lib/battle/commentary";
import { countdownScript, type RevealPlayer } from "@/lib/battle/reveal";
import type { VoicePrompt } from "@/lib/copy/voicePrompts";
import { formatAura } from "@/lib/scoring";
import type { Announcer } from "./announcer";
import { isIdleState } from "./machine";
import type { BattleResult, KioskEvent, KioskState, SessionState } from "./types";

/** How long the countdown waits for the streamed gut reactions before using canned ones. */
const COMMENTARY_WAIT_MS = 6_000;
/** A countdown step that never got its cue (voice stuck) is forced after this. */
const STEP_WATCHDOG_MS = 15_000;
/** The beat of silence between "In dead last....." and the name. */
const CALLOUT_PAUSE_MS = 650;

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Duel winner call, a little different every time so the host sounds alive. */
function duelCall(b: BattleResult): string[] {
  if (b.winnerSlot === null) return [pick(["It's a dead tie.", "Dead even. I can't split them.", "A tie! Nobody go home."]), pick(["The aura is shared.", "Split the aura."])];
  const w = `Player ${b.winnerSlot + 1}`;
  const gap = formatAura(b.gap);
  const lines = [
    pick([`${w} takes it, by ${gap} aura.`, `And the winner is... ${w}! By ${gap}.`, `${w} cooked. ${gap} aura clear.`, `That's game. ${w}, by ${gap} aura.`, `${w} wins it. ${gap} aura, not even close.`]),
  ];
  if (b.decidedBy === "pose") lines.push(pick(["And it came down to the pose.", "The pose did that.", "Won it on the pose. Respect."]));
  return lines;
}

function revealPlayers(b: BattleResult): RevealPlayer[] {
  return b.players.map((p) => ({ slot: p.slot, place: p.place, total: p.total, nickname: p.nickname, modifiers: p.scan.breakdown.modifiers.map((m) => m.label) }));
}

/**
 * The battle result, out loud. A duel: the winner call right away, then the
 * streamed commentary. A squad: a countdown from dead last to first ("In dead
 * last....." beat "Player 3! Dogshit fit."), each place revealed on screen
 * the moment it is called (REVEAL_STEP on the voice cue), then the vibe line.
 */
export function useBattleAnnouncer(opts: {
  state: KioskState;
  session: SessionState;
  announcer: Announcer;
  sound: { hit: () => void };
  pickPrompt: (key: VoicePrompt) => string;
  send: (event: KioskEvent) => void;
}): void {
  const { state, session, announcer, sound, pickPrompt, send } = opts;
  const battle = session.battle;
  const reveal = session.reveal;

  // Entering the result: the duel call, or the squad countdown's intro.
  const calledFor = useRef<string | null>(null);
  useEffect(() => {
    if (state !== "BATTLE_RESULT" || !battle || calledFor.current === battle.id) return;
    calledFor.current = battle.id;
    sound.hit();
    if (battle.mode === "squad") {
      const intro = countdownScript(revealPlayers(battle), { groupAura: battle.squad?.score ?? 0, opener: null, lines: {}, rand: Math.random }).intro;
      announcer.sayPremium([intro], 400);
    } else {
      announcer.sayPremium(duelCall(battle), 400);
    }
  }, [state, battle, announcer, sound]);

  // Duel: read the commentary once it has streamed in.
  const commentarySpoken = useRef<string | null>(null);
  useEffect(() => {
    if (!battle || battle.mode === "squad" || !session.commentaryDone || commentarySpoken.current === battle.id || !battle.commentary) return;
    commentarySpoken.current = battle.id;
    announcer.sayPremium([battle.commentary]);
    announcer.sayPremium([pickPrompt("battleResultActions")]);
  }, [battle, session.commentaryDone, announcer, pickPrompt]);

  // Squad: the countdown, once the gut reactions are in (or we stop waiting for them).
  const [waitOverFor, setWaitOverFor] = useState<string | null>(null);
  useEffect(() => {
    if (state !== "BATTLE_RESULT" || !battle || !reveal || session.commentaryDone) return;
    const id = window.setTimeout(() => setWaitOverFor(reveal.battleId), Math.max(0, COMMENTARY_WAIT_MS - (Date.now() - reveal.at)));
    return () => window.clearTimeout(id);
  }, [state, battle, reveal, session.commentaryDone]);

  const countdownFor = useRef<string | null>(null);
  const counting = useRef(false);
  useEffect(() => {
    if (state !== "BATTLE_RESULT" || !battle || !reveal || reveal.battleId !== battle.id || countdownFor.current === battle.id) return;
    if (!session.commentaryDone && waitOverFor !== battle.id) return;
    countdownFor.current = battle.id;
    counting.current = true;
    const parsed = battle.commentary ? parseSquadCommentary(battle.commentary) : { opener: "", lines: {} };
    const script = countdownScript(revealPlayers(battle), { groupAura: battle.squad?.score ?? 0, opener: parsed.opener || null, lines: parsed.lines, rand: Math.random });
    const id = battle.id;
    script.steps.forEach((step, i) => {
      announcer.sayPremium([step.callout], 380, { onStart: () => send({ type: "REVEAL_STEP", battleId: id, step: i, callout: step.callout }) });
      announcer.sayPremium([step.reveal], 380, { pauseMs: CALLOUT_PAUSE_MS, onStart: () => send({ type: "REVEAL_STEP", battleId: id, step: i + 1 }) });
    });
    if (script.outro) announcer.sayPremium([script.outro], 380, { pauseMs: 500 });
    announcer.sayPremium([pickPrompt("battleResultActions")]);
  }, [state, battle, reveal, session.commentaryDone, waitOverFor, announcer, pickPrompt, send]);

  // Safety net: a step whose voice cue never fired still lands.
  useEffect(() => {
    if (state !== "BATTLE_RESULT" || !reveal || reveal.shown >= reveal.total) return;
    const id = window.setTimeout(() => send({ type: "REVEAL_STEP", battleId: reveal.battleId, step: reveal.shown + 1 }), STEP_WATCHDOG_MS);
    return () => window.clearTimeout(id);
  }, [state, reveal, send]);

  // Walked away (or rebooted) mid-countdown: stop calling places to an empty room.
  useEffect(() => {
    if (!counting.current || !(isIdleState(state) || state === "BOOT")) return;
    counting.current = false;
    announcer.stop();
  }, [state, announcer]);
}
