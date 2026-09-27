"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { outfitFromAnalysis } from "@/lib/clothing/fromAnalysis";
import { generateOutfit, type GenerateOptions } from "@/lib/clothing/generator";
import { SLOTS, type Outfit } from "@/lib/clothing/types";
import { costumeAnimation } from "@/lib/costumePoses";
import { isBattleState, isIdleState } from "@/lib/kiosk/machine";
import { revealedSlots, slotsAtStep } from "@/lib/battle/reveal";
import type { BattlePlayerScore } from "@/lib/battle/types";
import type { BattleResult, KioskState, ScreenSide, SessionState } from "@/lib/kiosk/types";
import {
  ANTICIPATION_ANIM,
  CELEBRATE_ANIM,
  CROSS_ARMS_TAP_ANIM,
  IDLE_ANIM,
  PRESENT_ANIM,
  SLUMP_ANIM,
  STRIKE_POSE_ANIM,
  SULK_ENTER_ANIM,
  SULK_EXIT_ANIM,
  FIGHT_STANCE_ANIM,
  THINKING_ANIM,
  THUMBS_UP_ANIM,
  TYPING_ANIM,
  boredWaveAnimation,
  idolAnimation,
  mirrorAnimation,
  waveAnimation,
  waveBoredom,
  type Animation,
  type Side,
} from "@/lib/poses";
import { randomSeed } from "@/lib/prng";
import type { MannequinScene } from "./scene";

const REROLL_MS = 500;
/** Spinning rolls never show a costume: it only appears once the fit locks. */
const SPIN_OPTIONS: GenerateOptions = { costume: "none" };
const SPIN_SPEED = 1.15;
const ATTRACT_SPIN_SPEED = 0.55;
const LOCK_FACE_MS = 1000;
/** Turning to face the player when a scan or lobby starts mid-spin. */
const FACE_FRONT_MS = 700;
const LOCK_SLOT_STAGGER_MS = 170;
const LOCK_FIRST_SLOT_MS = 250;

/** Screen side of the person's waving hand -> mannequin arm on that same side. */
export function armForScreenSide(side: ScreenSide | null): Side {
  return side === "left" ? "R" : "L";
}

/** Idle loop for an outfit: the costume's own animation, or plain idle. */
/**
 * The battle line-up: one figure per player wearing the outfit the judge
 * detected on them. In the lobby a figure appears as soon as that player's
 * capture is scored; on the result every player stands in slot order.
 */
export function crewOutfits(state: KioskState, session: SessionState): Outfit[] | null {
  if (session.battle && (state === "BATTLE_RESULT" || state === "CLAIM")) {
    return session.battle.players.map((p) => outfitFromAnalysis(p.scan.analysis, p.scan.id));
  }
  if (state === "LOBBY" || state === "LOBBY_COUNTDOWN" || state === "BATTLE_INTRO") {
    const scored = (session.lobby?.slots ?? []).filter((s) => s.scan);
    return scored.length > 0 ? scored.map((s) => outfitFromAnalysis(s.scan!.analysis, s.scan!.id)) : null;
  }
  return null;
}

/** How a battle figure reacts to its result: the winner celebrates, dead last slumps, the rest shrug it off. */
function resultAnimation(b: BattleResult, player: BattlePlayerScore | undefined): Animation {
  if (!player || b.winnerSlot === null) return THUMBS_UP_ANIM;
  if (player.slot === b.winnerSlot) return CELEBRATE_ANIM;
  if (player.place === Math.max(...b.players.map((p) => p.place))) return SLUMP_ANIM;
  return THUMBS_UP_ANIM;
}

/** States in which a costume plays its loop as the idle. */
const loopStates = new Set<KioskState>(["SPINNING", "ATTRACT", "GREETING", "READY"]);

export function idleFor(outfit: Outfit): Animation {
  return costumeAnimation(outfit.costume, outfit.mascot) ?? IDLE_ANIM;
}

export interface DirectorCallbacks {
  /** Flash the figure (DOM overlay) when the fit locks. */
  onFlash?: () => void;
  /** Slot-machine tick as each slot locks. */
  onSlotLock?: (index: number) => void;
}

/**
 * Maps kiosk state + session to mannequin behaviour. Shared by both layouts:
 * the scene is presentation only, this decides what it does.
 */
export function useMannequinDirector(
  sceneRef: RefObject<MannequinScene | null>,
  ready: boolean,
  state: KioskState,
  session: SessionState,
  callbacks: DirectorCallbacks = {},
  generateOptions: GenerateOptions = {},
): void {
  const callbacksRef = useRef(callbacks);
  const sessionRef = useRef(session);
  const genRef = useRef(generateOptions);
  const lastWaveTick = useRef(session.waveTick);
  const lastApology = useRef(session.apologyTick);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    genRef.current = generateOptions;
  }, [generateOptions]);

  const inBattle = isBattleState(state) || (state === "CLAIM" && session.battle !== null);

  // Main state -> behaviour mapping.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const current = sessionRef.current;
    const costumed = current.outfit.costume !== "none";

    // Costume loops (cat paws, swimming, floating...) are the figure's idle
    // while it spins, greets and waits in READY. In every other state the base
    // is cleared so a finished one-shot (typing, thumbs up, slump...) holds
    // instead of snapping back into the costume loop.
    const loopFor = (outfit: Outfit) => (loopStates.has(state) ? costumeAnimation(outfit.costume, outfit.mascot) : null);
    const wear = (outfit: Outfit) => {
      scene.setOutfit(outfit);
      const loop = loopFor(outfit);
      scene.setBaseAnimation(loop);
      scene.play(loop ?? IDLE_ANIM, loop ? 350 : 200);
    };
    const ensureWearing = () => {
      if (scene.currentOutfit?.seed !== current.outfit.seed) wear(current.outfit);
    };

    scene.setLaptop(state === "CLAIM" && !inBattle);
    scene.setTextBand(isIdleState(state), state === "ATTRACT" ? 0.6 : 0.35);
    if (!inBattle) scene.setCrew(null);

    if (isIdleState(state)) {
      scene.spin(state === "ATTRACT" ? ATTRACT_SPIN_SPEED : SPIN_SPEED);
      scene.setIdle(1);
      wear(generateOutfit(randomSeed(), SPIN_OPTIONS));
      const interval = window.setInterval(() => wear(generateOutfit(randomSeed(), SPIN_OPTIONS)), REROLL_MS);
      return () => {
        window.clearInterval(interval);
        timers.forEach((t) => window.clearTimeout(t));
      };
    }

    scene.setIdle(state === "READY" || state === "GREETING" || state === "NAME_ENTRY" || state === "CLAIM" || state === "LOBBY" ? 1 : 0.35);
    // A remounted scene (layout switch, reboot) starts undressed: always wear the session fit.
    // In a battle the line-up effect below dresses every figure instead.
    if (state !== "LOCKING" && !inBattle) ensureWearing();

    switch (state) {
      case "LOCKING": {
        scene.faceFront(LOCK_FACE_MS);
        scene.setBaseAnimation(null);
        scene.play(IDLE_ANIM);
        const final = sessionRef.current.outfit;
        const locked = new Set<string>();
        const interval = window.setInterval(() => {
          const roll = generateOutfit(randomSeed(), SPIN_OPTIONS);
          for (const slot of SLOTS) if (!locked.has(slot)) scene.setSlot(slot, roll);
        }, 120);
        SLOTS.forEach((slot, i) => {
          later(() => {
            locked.add(slot);
            const last = i === SLOTS.length - 1;
            if (last && final.costume !== "none") wear(final);
            else scene.setSlot(slot, final);
            callbacksRef.current.onSlotLock?.(i);
            if (last) {
              window.clearInterval(interval);
              later(() => callbacksRef.current.onFlash?.(), 120);
            }
          }, LOCK_FIRST_SLOT_MS + i * LOCK_SLOT_STAGGER_MS);
        });
        return () => {
          window.clearInterval(interval);
          timers.forEach((t) => window.clearTimeout(t));
          wear(sessionRef.current.outfit);
        };
      }
      case "GREETING":
        scene.faceFront(FACE_FRONT_MS);
        ensureWearing();
        if (costumed) scene.play(idleFor(current.outfit), 300);
        else scene.play(waveAnimation(armForScreenSide(current.waveSide)));
        break;
      case "POSE_FOR_FANS":
        scene.play(idolAnimation(current.idolPoseIndex ?? 0));
        break;
      case "READY":
        if (current.meltdown === "annoyed") {
          scene.setBaseAnimation(CROSS_ARMS_TAP_ANIM);
          scene.play(CROSS_ARMS_TAP_ANIM, 300);
        } else {
          scene.setBaseAnimation(loopFor(current.outfit));
          scene.play(idleFor(current.outfit));
        }
        break;
      case "CHARGING":
        // Solo scan can start straight from the idle spin: turn to face the player.
        scene.faceFront(FACE_FRONT_MS);
        ensureWearing();
        scene.setBaseAnimation(null);
        scene.play(ANTICIPATION_ANIM);
        break;
      case "COUNTDOWN":
        scene.play(STRIKE_POSE_ANIM);
        break;
      case "ANALYZING":
        scene.play(THINKING_ANIM, 300);
        break;
      case "RESULT": {
        const scan = current.scan;
        const aura = scan?.aura ?? null;
        const rank = scan?.rank ?? null;
        const topFifth = rank !== null && rank.total > 0 && rank.position / rank.total <= 0.2;
        if (aura !== null && aura < 0) scene.play(SLUMP_ANIM);
        else if (topFifth) scene.play(CELEBRATE_ANIM);
        else scene.play(THUMBS_UP_ANIM);
        break;
      }
      case "CLAIM":
        if (!current.battle) scene.play(TYPING_ANIM, 320);
        break;
      case "LOBBY":
      case "LOBBY_COUNTDOWN":
      case "BATTLE_INTRO":
      case "BATTLE_RESULT":
        scene.faceFront(FACE_FRONT_MS);
        scene.setBaseAnimation(null);
        break;
      case "SULKING":
        scene.setBaseAnimation(null);
        scene.play(SULK_ENTER_ANIM, 300);
        break;
      default:
        break;
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [sceneRef, ready, state, inBattle]);

  // Battle line-up: dress one figure per player, then pose them for the moment.
  // Keyed on the lobby and the battle id: streamed commentary must not re-dress anyone.
  const battleKey = session.battle?.id ?? null;
  const lobby = session.lobby;
  const crew = useMemo(
    () => crewOutfits(state, session),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, lobby, battleKey],
  );
  const crewKey = crew?.map((o) => o.seed).join("|") ?? "";
  const crewRef = useRef(crew);
  useEffect(() => {
    crewRef.current = crew;
  }, [crew]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready || !inBattle) return;
    const outfits = crewRef.current;
    const current = sessionRef.current;
    if (!outfits) {
      // Empty lobby: the host stands ready (or strikes a pose on the first countdown).
      scene.setCrew(null);
      if (scene.currentOutfit?.seed !== current.outfit.seed) scene.setOutfit(current.outfit);
      scene.play(state === "LOBBY_COUNTDOWN" ? STRIKE_POSE_ANIM : IDLE_ANIM, 300);
      return;
    }
    scene.setCrew(outfits);
    const n = outfits.length;
    // Figures on the right half face the left half (mirrored animations).
    const facing = (i: number, anim: Animation) => (n > 1 && i >= n / 2 ? mirrorAnimation(anim) : anim);
    // Squad countdown: nobody reacts until their place is called (the reveal effect below).
    const r = current.reveal;
    const called = r && current.battle && r.battleId === current.battle.id ? revealedSlots(current.battle.players, r.shown) : null;
    for (let i = 0; i < n; i++) {
      let anim: Animation = IDLE_ANIM;
      if (state === "BATTLE_INTRO") anim = FIGHT_STANCE_ANIM;
      else if (state === "BATTLE_RESULT" || state === "CLAIM") {
        const player = current.battle?.players[i];
        anim = current.battle ? resultAnimation(current.battle, player) : THUMBS_UP_ANIM;
        if (state === "BATTLE_RESULT" && called && player && !called.has(player.slot)) anim = IDLE_ANIM;
        if (state === "CLAIM" && anim !== CELEBRATE_ANIM) anim = IDLE_ANIM;
      }
      scene.playCrew(i, facing(i, anim), 300);
    }
  }, [sceneRef, ready, state, inBattle, crewKey]);

  // Squad countdown: each figure reacts the moment its place is called.
  const revealShown = session.reveal?.shown ?? 0;
  useEffect(() => {
    const scene = sceneRef.current;
    const current = sessionRef.current;
    const b = current.battle;
    if (!scene || !ready || state !== "BATTLE_RESULT" || !b || revealShown === 0) return;
    const n = b.players.length;
    for (const slot of slotsAtStep(b.players, revealShown - 1)) {
      const i = b.players.findIndex((p) => p.slot === slot);
      if (i < 0) continue;
      const anim = resultAnimation(b, b.players[i]);
      scene.playCrew(i, n > 1 && i >= n / 2 ? mirrorAnimation(anim) : anim, 250);
    }
  }, [sceneRef, ready, state, revealShown]);

  // Meltdown escalation while READY (no state change).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready || state !== "READY") return;
    if (session.meltdown === "annoyed") {
      scene.setBaseAnimation(CROSS_ARMS_TAP_ANIM);
      scene.play(CROSS_ARMS_TAP_ANIM, 350);
    } else if (session.meltdown === "none" && scene.player.animationName === CROSS_ARMS_TAP_ANIM.name) {
      scene.setBaseAnimation(costumeAnimation(session.outfit.costume, session.outfit.mascot));
      scene.play(idleFor(session.outfit), 400);
    }
  }, [sceneRef, ready, state, session.meltdown, session.outfit]);

  // Printing: proud presenting pose.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready || state !== "CLAIM" || !session.printing) return;
    scene.play(PRESENT_ANIM, 350);
    const id = window.setTimeout(() => scene.play(TYPING_ANIM, 400), 4000);
    return () => window.clearTimeout(id);
  }, [sceneRef, ready, state, session.printing]);

  // Apology accepted: stand up, turn around, dust off.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready) return;
    if (session.apologyTick === lastApology.current) return;
    lastApology.current = session.apologyTick;
    // Back in READY after the sulk: the costume loop is the idle again.
    scene.setBaseAnimation(costumeAnimation(session.outfit.costume, session.outfit.mascot));
    scene.play(SULK_EXIT_ANIM, 250);
  }, [sceneRef, ready, session.apologyTick, session.outfit]);

  // Repeated waves after the greeting: it always waves back, more bored every
  // time (lower arm, slower, slouching, head drooping). Any scan resets it.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready) return;
    if (session.waveTick === lastWaveTick.current) return;
    lastWaveTick.current = session.waveTick;
    if (state === "READY") {
      scene.play(boredWaveAnimation(armForScreenSide(session.waveSide), waveBoredom(session.hello.count)));
    }
  }, [sceneRef, ready, state, session.waveTick, session.waveSide, session.hello.count]);
}
