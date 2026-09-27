"use client";

import { useEffect, useMemo, useRef } from "react";
import { GREETINGS } from "@/lib/copy";
import { VOICE_PROMPTS, type VoicePrompt } from "@/lib/copy/voicePrompts";
import type { Announcer } from "./announcer";
import type { Framing } from "./framing";
import { isIdleState } from "./machine";
import type { KioskState, SessionState } from "./types";

/** A nudge must hold this long before it is spoken (tracking flickers)... */
const NUDGE_SETTLE_MS = 1_200;
/** ...and nudges are at least this far apart, so the mirror never nags. */
const NUDGE_COOLDOWN_MS = 15_000;

/** Random variant per prompt, never the same one twice in a row. */
export function createPromptPicker(random: () => number = Math.random): (key: VoicePrompt) => string {
  const last = new Map<VoicePrompt, number>();
  return (key) => {
    const lines = VOICE_PROMPTS[key];
    let i = Math.floor(random() * lines.length);
    if (lines.length > 1 && i === last.get(key)) i = (i + 1) % lines.length;
    last.set(key, i);
    return lines[i];
  };
}

/** Which spoken nudge the current tracking calls for (idle / ready only). */
export function nudgeFor(state: KioskState, framing: Framing, battleWaiting: boolean): VoicePrompt | null {
  if (!isIdleState(state) && state !== "READY") return null;
  if (battleWaiting) return "battleWaiting";
  if (framing === "step_back") return "stepBack";
  if (framing === "step_closer") return "comeCloser";
  return null;
}

/**
 * Speaks what people should do next, in the premium (ElevenLabs) voice:
 * "yo wassup, give me a wave", the greeting, "show me some deuces", "hands
 * down, strike a pose", the name prompt, "scan the QR", battle calls, and
 * nudges (step back, come closer, opponent fists up). Returns the picker so
 * the verdict flow can append its "thumbs up / thumbs down" line in order.
 */
export function useVoicePrompts(opts: {
  state: KioskState;
  session: SessionState;
  framing: Framing;
  battleWaiting: boolean;
  announcer: Announcer;
}): (key: VoicePrompt) => string {
  const { state, session, framing, battleWaiting, announcer } = opts;
  const pick = useMemo(() => createPromptPicker(), []);

  // Step prompts on state changes.
  const prev = useRef(state);
  useEffect(() => {
    const from = prev.current;
    prev.current = state;
    if (from === state) return;
    // The session ended (reset, [REBOOT], open palm, timeout): whatever it was saying stops now.
    const ended = (state === "BOOT" && from !== "BOOT") || (isIdleState(state) && !isIdleState(from) && from !== "BOOT");
    if (ended) announcer.stop();
    const say = (key: VoicePrompt) => announcer.sayPremium([pick(key)]);
    if (from === "ATTRACT" && state === "SPINNING") say("personSeen");
    if (state === "GREETING" && session.greetingIndex !== null) announcer.sayPremium([GREETINGS[session.greetingIndex]]);
    if (state === "READY") say("ready");
    if (state === "CHARGING") say("strikePose");
    if (state === "NAME_ENTRY") say("nameEntry");
    if (state === "LOBBY" && from !== "LOBBY_COUNTDOWN" && from !== "BATTLE_INTRO") say(session.lobby?.mode === "squad" ? "squadLobby" : "battleLobby");
    else if (state === "LOBBY" && session.lobby && session.lobby.next < session.lobby.capacity) say(session.lobby.mode === "squad" && session.lobby.slots.length >= 2 ? "squadReady" : "nextPlayer");
    if (state === "LOBBY_COUNTDOWN") say(session.lobby?.pair ? "battleStart" : "battlePose");
    if (state === "BATTLE_INTRO") say("battleIntro");
  }, [state, session.greetingIndex, session.lobby, announcer, pick]);

  // Repeat waves: a "hi" back, less enthusiastic every time (lib/copy/greetings.ts WAVE_HELLOS).
  const { tick: helloTick, line: helloLine } = session.hello;
  const lastHelloTick = useRef(helloTick);
  useEffect(() => {
    if (helloTick === lastHelloTick.current) return;
    lastHelloTick.current = helloTick;
    if (helloLine) announcer.sayPremium([helloLine]);
  }, [helloTick, helloLine, announcer]);

  // Card saved: point them at the QR.
  const cardId = session.card?.id ?? null;
  useEffect(() => {
    if (cardId) announcer.sayPremium([pick("claim")]);
  }, [cardId, announcer, pick]);

  // Nudges from tracking (settled, rate-limited).
  const nudge = nudgeFor(state, framing, battleWaiting);
  const lastNudgeAt = useRef(0);
  useEffect(() => {
    if (!nudge) return;
    const id = window.setTimeout(() => {
      if (Date.now() - lastNudgeAt.current < NUDGE_COOLDOWN_MS) return;
      lastNudgeAt.current = Date.now();
      announcer.sayPremium([pick(nudge)]);
    }, NUDGE_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [nudge, announcer, pick]);

  return pick;
}
