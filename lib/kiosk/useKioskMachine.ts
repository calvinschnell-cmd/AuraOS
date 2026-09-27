"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { generateOutfit, generateUniqueOutfit, type GenerateOptions } from "@/lib/clothing/generator";
import { GREETINGS, SOLO_BATTLE_ROASTS, helloTier } from "@/lib/copy";
import type { PoseSnapshot } from "@/lib/pose/landmarks";
import type { PoseResult } from "@/lib/pose/score";
import { IDOL_POSES } from "@/lib/poses";
import { randomSeed } from "@/lib/prng";
import { formatAura } from "@/lib/scoring";
import { revealOrder } from "@/lib/battle/reveal";
import { allScored, canStart, isFull, newLobby, withCaptured, withFailed, withScored } from "./lobby";
import { BATTLE_INTRO_MIN_MS, LOBBY_COUNTDOWN_MS, STATE_TIMEOUTS, isIdleState, transition, type TransitionContext } from "./machine";
import { terminalLinesFor } from "./terminal";
import type { BattleResult, CapturedImage, KioskEvent, KioskState, Lobby, LobbySlot, ScanResult, SessionState, SquadReveal, TerminalEntry } from "./types";

const MAX_TERMINAL_ENTRIES = 40;

export interface MachineSnapshot {
  state: KioskState;
  session: SessionState;
  enteredAt: number;
  terminal: TerminalEntry[];
  scansToday: number;
  bootCount: number;
  /** True while a session-end reboot is on screen (fast boot sequence). */
  quickBoot: boolean;
  lastEvent: KioskEvent["type"] | null;
}

interface Internal extends MachineSnapshot {
  nextTerminalId: number;
  lastGreetingIndex: number | null;
  lastIdolIndex: number | null;
}

interface GenContext {
  options: GenerateOptions;
  /** Recent fit signatures for the anti-repeat check. */
  recent: string[][];
}

type Action =
  | { kind: "event"; event: KioskEvent; now: number; seed: string; rand: number; gen: GenContext }
  | { kind: "reboot"; now: number; seed: string };

export function freshSession(id: number, seed: string): SessionState {
  return {
    id,
    outfit: generateOutfit(seed, { costume: "none" }),
    locked: false,
    waveSide: null,
    waveTick: 0,
    hello: { count: 0, line: null, index: null, tick: 0 },
    idolPoseIndex: null,
    greetingIndex: null,
    scan: null,
    roastCount: 0,
    roast: null,
    errorMessage: null,
    lobby: null,
    battle: null,
    commentaryDone: false,
    reveal: null,
    playerName: null,
    playerHandle: null,
    resultShown: false,
    card: null,
    badge: null,
    cardError: null,
    printing: false,
    meltdown: "none",
    apologyTick: 0,
    soloRoastTick: 0,
    soloRoastIndex: null,
  };
}

/** Pick an index in [0, n) that differs from `previous` (when n > 1). */
function pickDifferent(rand: number, n: number, previous: number | null): number {
  if (n <= 1) return 0;
  const candidates = previous === null ? n : n - 1;
  let idx = Math.floor(rand * candidates);
  if (previous !== null && idx >= previous) idx += 1;
  return idx;
}

function appendTerminal(ms: Internal, lines: string[]): Internal {
  if (lines.length === 0) return ms;
  let id = ms.nextTerminalId;
  const entries = lines.map((text) => ({ id: id++, text }));
  return { ...ms, nextTerminalId: id, terminal: [...ms.terminal, ...entries].slice(-MAX_TERMINAL_ENTRIES) };
}

function initial(now: number, seed: string): Internal {
  return {
    state: "BOOT",
    session: freshSession(1, seed),
    enteredAt: now,
    terminal: [],
    scansToday: 0,
    bootCount: 1,
    quickBoot: false,
    lastEvent: null,
    nextTerminalId: 1,
    lastGreetingIndex: null,
    lastIdolIndex: null,
  };
}

/** The lobby as it will be after this event (transitions look at it). */
function lobbyAfter(lobby: Lobby | null, event: KioskEvent): Lobby | null {
  switch (event.type) {
    case "OPEN_LOBBY":
      return newLobby(event.mode);
    case "BATTLE":
      return newLobby("duel", true);
    case "SLOT_CAPTURED":
      return lobby ? withCaptured(lobby, event.slots) : lobby;
    case "SLOT_SCORED":
      return lobby ? withScored(lobby, event.captureId, event.scan, event.pose) : lobby;
    case "SLOT_FAILED":
      return lobby ? withFailed(lobby, event.captureId, event.message) : lobby;
    case "CAPTURE_FAILED":
      return lobby ? { ...lobby, error: event.message, pair: false } : lobby;
    default:
      return lobby;
  }
}

function contextFor(lobby: Lobby | null, reveal: SquadReveal | null): TransitionContext {
  const revealing = reveal !== null && reveal.shown < reveal.total;
  return lobby ? { lobbyFull: isFull(lobby), lobbyCanStart: canStart(lobby), revealing } : { revealing };
}

function reduce(ms: Internal, action: Action): Internal {
  if (action.kind === "reboot") {
    // [REBOOT]: the quick boot (4x), not the ~10 s first-launch sequence (a long black screen).
    return { ...initial(action.now, action.seed), bootCount: ms.bootCount + 1, scansToday: ms.scansToday, quickBoot: true };
  }
  const { event, now, seed, rand, gen } = action;
  const nextLobby = lobbyAfter(ms.session.lobby, event);
  const next = transition(ms.state, event, contextFor(nextLobby, ms.session.reveal));
  if (next === null) return ms;

  let out: Internal = { ...ms, lastEvent: event.type };
  let session: SessionState = nextLobby === ms.session.lobby ? ms.session : { ...ms.session, lobby: nextLobby };

  // Event side effects
  switch (event.type) {
    case "WAVE": {
      session = { ...session, waveSide: event.side, waveTick: session.waveTick + 1 };
      // A repeat wave while waiting: say hi back, a little less hyped each time
      // (sulking gets the silent treatment; the first wave is the greeting).
      const tier = ms.state === "READY" && event.count ? helloTier(event.count) : null;
      if (tier) {
        const sameTier = session.hello.count > 0 && helloTier(session.hello.count) === tier;
        const index = pickDifferent(rand, tier.length, sameTier ? session.hello.index : null);
        session = { ...session, hello: { count: event.count!, line: tier[index], index, tick: session.hello.tick + 1 } };
        out = appendTerminal(out, [`> "${tier[index].toUpperCase()}"`]);
      }
      break;
    }
    case "THUMB_DOWN":
      if (session.roastCount >= 1) return ms; // one extra roast per scan
      session = { ...session, roastCount: session.roastCount + 1 };
      out = appendTerminal(out, ["> ROAST REQUESTED. SCORE UNCHANGED."]);
      break;
    case "ROAST_READY":
      session = { ...session, roast: event.text };
      out = appendTerminal(out, [`> ${event.text.toUpperCase()}`]);
      break;
    case "ANALYSIS_DONE":
      session = { ...session, scan: event.scan, errorMessage: null };
      out = { ...out, scansToday: out.scansToday + 1 };
      break;
    case "OPEN_LOBBY":
    case "BATTLE":
      session = { ...session, errorMessage: null, battle: null, commentaryDone: false, scan: null };
      break;
    case "SLOT_CAPTURED":
      out = appendTerminal(
        out,
        event.slots.map((s) => `> PLAYER ${s.slot + 1} LOCKED IN. SCORING...`),
      );
      break;
    case "SLOT_SCORED": {
      const slot = session.lobby?.slots.find((s) => s.captureId === event.captureId);
      if (slot) out = appendTerminal(out, [`> PLAYER ${slot.slot + 1}: FIT ${formatAura(event.scan.aura, true)} · POSE ${event.pose.score}`]);
      out = { ...out, scansToday: out.scansToday + 1 };
      break;
    }
    case "SLOT_FAILED":
    case "CAPTURE_FAILED":
      out = appendTerminal(out, [`> ${session.lobby?.error ?? event.message}`]);
      break;
    case "BATTLE_ANALYSIS_DONE": {
      // Squads get the countdown (last place first); a duel shows at once.
      const squad = event.battle.mode === "squad";
      const reveal = squad ? { battleId: event.battle.id, shown: 0, total: revealOrder(event.battle.players).length, at: now, callout: null } : null;
      session = { ...session, battle: event.battle, commentaryDone: false, errorMessage: null, reveal };
      break;
    }
    case "REVEAL_STEP": {
      const r = session.reveal;
      if (!r || r.battleId !== event.battleId) return ms;
      const shown = Math.max(r.shown, Math.min(r.total, event.step));
      if (shown === r.shown && event.callout === undefined) return ms;
      session = { ...session, reveal: { ...r, shown, at: now, callout: event.callout ?? r.callout } };
      break;
    }
    case "ANALYSIS_FAILED":
      session = { ...session, errorMessage: event.message, lobby: session.lobby ? { ...session.lobby, error: event.message } : null };
      break;
    case "COMMENTARY":
      if (session.battle?.id !== event.battleId) return ms;
      session = { ...session, battle: { ...session.battle, commentary: event.text }, commentaryDone: event.done };
      break;
    case "SCAN":
      session = { ...session, errorMessage: null };
      break;
    case "NAME_SUBMIT":
      session = { ...session, playerName: event.name, playerHandle: event.handle };
      out = appendTerminal(out, [
        event.name ? `> WELCOME TO THE BOARD, ${event.name.toUpperCase()}.` : "> JOINING UNDER YOUR FIT NICKNAME.",
        ...(event.handle ? [`> YOUR AURA ID: ${event.handle}`] : []),
      ]);
      break;
    case "CARD_READY":
      session = { ...session, card: event.card, cardError: null };
      out = appendTerminal(out, ["> CARD SAVED. SCAN THE QR CODE."]);
      break;
    case "CARD_FAILED":
      session = { ...session, cardError: event.message };
      out = appendTerminal(out, [`> ${event.message.toUpperCase()}`]);
      break;
    case "BADGE":
      session = { ...session, badge: event.badge };
      if (event.badge.status === "minted") out = appendTerminal(out, ["> AURA BADGE MINTED ON SOLANA (DEVNET)."]);
      break;
    case "PRINTING":
      session = { ...session, printing: true };
      out = appendTerminal(out, ["> PRINTING CERTIFICATE..."]);
      break;
    case "MELTDOWN":
      if (session.meltdown === event.level) return ms;
      session = { ...session, meltdown: event.level };
      if (event.level === "annoyed") out = appendTerminal(out, ["> OK. WE GET IT."]);
      break;
    case "SOLO_BATTLE": {
      const idx = pickDifferent(rand, SOLO_BATTLE_ROASTS.length, session.soloRoastIndex);
      session = { ...session, soloRoastTick: session.soloRoastTick + 1, soloRoastIndex: idx };
      out = appendTerminal(out, ["> OPPONENT NOT FOUND.", `> ${SOLO_BATTLE_ROASTS[idx].toUpperCase()}`]);
      break;
    }
    case "SULK_DONE":
      session = { ...session, meltdown: "none", apologyTick: session.apologyTick + 1 };
      out = appendTerminal(out, ["> APOLOGY ACCEPTED."]);
      break;
    default:
      break;
  }

  if (next !== ms.state) {
    // A duel lobby that timed out with one player: clowned for pulling up alone.
    const aloneInLobby = ms.state === "LOBBY" && event.type === "TIMEOUT" && (ms.session.lobby?.slots.length ?? 0) === 1;
    // A session ends whenever we return to an idle state from a non-idle one.
    if ((isIdleState(next) || next === "BOOT") && !isIdleState(ms.state)) {
      session = freshSession(session.id + 1, seed);
    }
    if (aloneInLobby) {
      const idx = pickDifferent(rand, SOLO_BATTLE_ROASTS.length, null);
      session = { ...session, soloRoastTick: session.soloRoastTick + 1, soloRoastIndex: idx };
      out = appendTerminal(out, ["> OPPONENT NOT FOUND.", `> ${SOLO_BATTLE_ROASTS[idx].toUpperCase()}`]);
    }
    // Open palm: the whole kiosk "reboots" quickly (layout remounts, terminal clears).
    if (next === "BOOT") {
      out = { ...out, bootCount: ms.bootCount + 1, quickBoot: true, terminal: [] };
    }
    if (ms.state === "BOOT") out = { ...out, quickBoot: false };
    // A session locks the moment we leave an idle state.
    if (!isIdleState(next) && isIdleState(ms.state)) {
      session = { ...session, locked: true, outfit: generateUniqueOutfit(seed, gen.recent, gen.options) };
    }
    if (next === "GREETING") {
      const idx = pickDifferent(rand, GREETINGS.length, ms.lastGreetingIndex);
      session = { ...session, greetingIndex: idx };
      out = { ...out, lastGreetingIndex: idx };
    }
    if (next === "POSE_FOR_FANS") {
      const idx = pickDifferent(rand, IDOL_POSES.length, ms.lastIdolIndex);
      session = { ...session, idolPoseIndex: idx };
      out = { ...out, lastIdolIndex: idx };
    }
    if (next === "NAME_ENTRY") session = { ...session, resultShown: true };
    if (next === "SULKING") session = { ...session, meltdown: "annoyed" };
    // Scanning (or battling) is what they came for: all is forgiven.
    if ((next === "CHARGING" || next === "LOBBY" || next === "LOBBY_COUNTDOWN") && session.meltdown !== "none") session = { ...session, meltdown: "none" };
    if (next === "READY" && ms.state === "SULKING" && event.type !== "SULK_DONE") session = { ...session, meltdown: "none" };
    out = { ...out, state: next, enteredAt: now, session };
    out = appendTerminal(out, terminalLinesFor(next, session));
    return out;
  }

  return { ...out, session };
}

export interface KioskMachine extends MachineSnapshot {
  send: (event: KioskEvent) => void;
  reboot: () => void;
}

export interface LobbyCapture {
  image: CapturedImage;
  pose: PoseSnapshot | null;
}

export interface MachineOptions {
  analyze: () => Promise<ScanResult>;
  /** Capture the player stepping up (pair: both people at once, left then right). */
  captureLobby: (pair: boolean) => Promise<LobbyCapture[]>;
  /** Single-judge score + pose sub-score for one capture. */
  scoreCapture: (capture: LobbyCapture) => Promise<{ scan: ScanResult; pose: PoseResult }>;
  /** Compute + store the battle from a fully scored lobby. */
  createBattle: (lobby: Lobby) => Promise<BattleResult>;
  /** Stream the commentary; onText receives the text so far. Resolves with the final text. */
  streamCommentary: (battleId: string, onText: (text: string) => void) => Promise<string>;
  generateOptions?: GenerateOptions;
  /** Recent fit signatures (anti-repeat); refreshed by the caller. */
  recentSignatures?: string[][];
  /** Called when a fit locks (persist its signature). */
  onFitLocked?: (session: SessionState) => void;
}

let captureCounter = 0;

export function useKioskMachine(opts: MachineOptions): KioskMachine {
  const [ms, dispatch] = useReducer(reduce, undefined, () => initial(Date.now(), randomSeed()));
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const send = useCallback((event: KioskEvent) => {
    const o = optsRef.current;
    dispatch({
      kind: "event",
      event,
      now: Date.now(),
      seed: randomSeed(),
      rand: Math.random(),
      gen: { options: o.generateOptions ?? {}, recent: o.recentSignatures ?? [] },
    });
  }, []);

  const reboot = useCallback(() => {
    dispatch({ kind: "reboot", now: Date.now(), seed: randomSeed() });
  }, []);

  // Automatic timeouts per state.
  const revealAt = ms.session.reveal?.at ?? null;
  useEffect(() => {
    const timeout = STATE_TIMEOUTS[ms.state];
    if (!timeout) return;
    // The squad countdown keeps the result up: the timeout counts from its last step.
    const since = ms.state === "BATTLE_RESULT" && revealAt !== null ? Math.max(ms.enteredAt, revealAt) : ms.enteredAt;
    const remaining = Math.max(0, timeout.ms - (Date.now() - since));
    const id = window.setTimeout(() => send(timeout.event), remaining);
    return () => window.clearTimeout(id);
  }, [ms.state, ms.enteredAt, revealAt, send]);

  // Solo scan: analysis call while ANALYZING.
  useEffect(() => {
    if (ms.state !== "ANALYZING") return;
    let cancelled = false;
    optsRef.current
      .analyze()
      .then((scan) => !cancelled && send({ type: "ANALYSIS_DONE", scan }))
      .catch((err: unknown) => {
        if (cancelled) return;
        send({ type: "ANALYSIS_FAILED", message: err instanceof Error ? err.message : "AURA SENSORS OVERHEATED. TRY AGAIN IN A MINUTE." });
      });
    return () => {
      cancelled = true;
    };
  }, [ms.state, ms.enteredAt, send]);

  // Lobby countdown: capture when it ends, then score each capture right away
  // (pipelined: player 1 is being judged while player 2 steps up).
  const lobbyRef = useRef(ms.session.lobby);
  useEffect(() => {
    lobbyRef.current = ms.session.lobby;
  }, [ms.session.lobby]);
  useEffect(() => {
    if (ms.state !== "LOBBY_COUNTDOWN") return;
    let cancelled = false;
    const remaining = Math.max(0, LOBBY_COUNTDOWN_MS - (Date.now() - ms.enteredAt));
    const id = window.setTimeout(async () => {
      const lobby = lobbyRef.current;
      if (!lobby || cancelled) return;
      const o = optsRef.current;
      let captures: LobbyCapture[];
      try {
        captures = await o.captureLobby(lobby.pair);
      } catch (err) {
        if (!cancelled) send({ type: "CAPTURE_FAILED", message: err instanceof Error ? err.message.toUpperCase() : "CAPTURE FAILED." });
        return;
      }
      if (cancelled) return;
      const slots: LobbySlot[] = captures.slice(0, lobby.pair ? 2 : 1).map((c, i) => ({
        slot: lobby.pair ? i : lobby.next,
        captureId: `cap-${Date.now()}-${++captureCounter}`,
        image: c.image,
        pose: c.pose,
        status: "scoring",
        scan: null,
        poseResult: null,
      }));
      send({ type: "SLOT_CAPTURED", slots });
      // Scoring outlives this state on purpose; results for an abandoned lobby are ignored by the reducer.
      for (const s of slots) {
        o.scoreCapture({ image: s.image, pose: s.pose })
          .then(({ scan, pose }) => send({ type: "SLOT_SCORED", captureId: s.captureId, scan, pose }))
          .catch((err: unknown) => send({ type: "SLOT_FAILED", captureId: s.captureId, message: err instanceof Error ? err.message : "AURA SENSORS OVERHEATED." }));
      }
    }, remaining);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [ms.state, ms.enteredAt, send]);

  // VS intro: at least BATTLE_INTRO_MIN_MS of animation, then (once every
  // capture is scored) the battle is computed. The wait hides under the intro.
  const introReady = ms.state === "BATTLE_INTRO" && ms.session.lobby !== null && allScored(ms.session.lobby);
  useEffect(() => {
    if (!introReady) return;
    let cancelled = false;
    const lobby = lobbyRef.current;
    if (!lobby) return;
    const wait = Math.max(0, BATTLE_INTRO_MIN_MS - (Date.now() - ms.enteredAt));
    const id = window.setTimeout(() => {
      optsRef.current
        .createBattle(lobby)
        .then((battle) => !cancelled && send({ type: "BATTLE_ANALYSIS_DONE", battle }))
        .catch((err: unknown) => !cancelled && send({ type: "ANALYSIS_FAILED", message: err instanceof Error ? err.message : "AURA SENSORS OVERHEATED." }));
    }, wait);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [introReady, ms.enteredAt, send]);

  // Commentary streams in once per battle, token by token.
  const battleId = ms.session.battle?.id ?? null;
  const streamedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!battleId || streamedFor.current === battleId) return;
    streamedFor.current = battleId;
    let last = 0;
    optsRef.current
      .streamCommentary(battleId, (text) => {
        // ~20 updates a second is plenty for a typing effect.
        const now = performance.now();
        if (now - last < 50) return;
        last = now;
        send({ type: "COMMENTARY", battleId, text, done: false });
      })
      .then((text) => send({ type: "COMMENTARY", battleId, text, done: true }))
      .catch(() => send({ type: "COMMENTARY", battleId, text: "THE AURA HAS SPOKEN.", done: true }));
  }, [battleId, send]);

  // Persist the locked fit's signature for anti-repeat.
  const lockedId = ms.session.locked ? ms.session.id : null;
  useEffect(() => {
    if (lockedId === null) return;
    optsRef.current.onFitLocked?.(ms.session);
    // Only when a new session locks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedId]);

  return {
    state: ms.state,
    session: ms.session,
    enteredAt: ms.enteredAt,
    terminal: ms.terminal,
    scansToday: ms.scansToday,
    bootCount: ms.bootCount,
    quickBoot: ms.quickBoot,
    lastEvent: ms.lastEvent,
    send,
    reboot,
  };
}
