import type { EngineGesture } from "./gestureEngine";
import type { GestureId, KioskEvent, KioskState } from "./types";

/** What the lobby looks like right now (the only session facts transitions depend on). */
export interface TransitionContext {
  /** Every lobby slot has a capture. */
  lobbyFull?: boolean;
  /** Enough players to start (duel: 2, squad: 2+). */
  lobbyCanStart?: boolean;
  /** The squad countdown is still calling places (no card until it is done). */
  revealing?: boolean;
}

/** From the mode select (idle, ready, greeting): open the battle lobby or capture two at once. */
function modeSelect(event: KioskEvent): KioskState | null {
  switch (event.type) {
    case "OPEN_LOBBY":
      return "LOBBY";
    case "BATTLE":
      // Two people asked together: one countdown captures both of them.
      return "LOBBY_COUNTDOWN";
    default:
      return null;
  }
}

/**
 * Pure kiosk state machine. Returns the next state, or null when the event is
 * not valid in the current state (the caller ignores it).
 */
export function transition(state: KioskState, event: KioskEvent, ctx: TransitionContext = {}): KioskState | null {
  if (event.type === "RESET") return state === "BOOT" ? null : "SPINNING";

  switch (state) {
    case "BOOT":
      return event.type === "BOOT_DONE" ? "SPINNING" : null;

    case "SPINNING":
      switch (event.type) {
        case "WAVE":
          return "LOCKING";
        case "SCAN":
          return "CHARGING";
        case "SOLO_BATTLE":
          return "SPINNING"; // clowned for pulling up alone
        case "TIMEOUT":
          return "ATTRACT";
        default:
          return modeSelect(event);
      }

    case "ATTRACT":
      switch (event.type) {
        case "WAVE":
          return "LOCKING";
        case "SCAN":
          return "CHARGING";
        case "SOLO_BATTLE":
          return "ATTRACT";
        case "PERSON_SEEN":
          return "SPINNING";
        default:
          return modeSelect(event);
      }

    case "LOCKING":
      return event.type === "LOCK_DONE" ? "GREETING" : null;

    case "GREETING":
      switch (event.type) {
        case "GREETING_DONE":
          return "POSE_FOR_FANS";
        case "SCAN":
          return "CHARGING";
        default:
          return modeSelect(event);
      }

    case "POSE_FOR_FANS":
      switch (event.type) {
        case "POSE_DONE":
          return "READY";
        case "SCAN":
          return "CHARGING";
        default:
          return modeSelect(event);
      }

    case "READY":
      switch (event.type) {
        case "SCAN":
          return "CHARGING";
        case "SOLO_BATTLE":
          return "READY";
        case "WAVE":
        case "MELTDOWN":
          return "READY"; // small wave back / escalating annoyance, no new voice
        case "SULK":
          return "SULKING";
        case "TIMEOUT":
          return "SPINNING";
        default:
          return modeSelect(event);
      }

    case "CHARGING":
      switch (event.type) {
        case "CHARGE_DONE":
          return "COUNTDOWN";
        case "CHARGE_CANCEL":
          return "READY";
        default:
          return null;
      }

    case "COUNTDOWN":
      return event.type === "COUNTDOWN_DONE" ? "ANALYZING" : null;

    case "ANALYZING":
      switch (event.type) {
        case "ANALYSIS_DONE":
          return "RESULT";
        case "ANALYSIS_FAILED":
          return "READY";
        default:
          return null;
      }

    case "RESULT":
      switch (event.type) {
        case "THUMB_UP":
          return "NAME_ENTRY"; // joining the leaderboard: type a name first
        case "THUMB_DOWN":
        case "ROAST_READY":
          return "RESULT"; // extra roast, score unchanged
        case "OPEN_PALM":
          return "BOOT"; // quick reboot, then back to spinning
        case "TIMEOUT":
          return "SPINNING";
        default:
          return null;
      }

    case "NAME_ENTRY":
      switch (event.type) {
        case "NAME_SUBMIT":
          return "CLAIM";
        case "NAME_CANCEL":
          return "RESULT";
        case "TIMEOUT":
          return "SPINNING";
        default:
          return null;
      }

    case "CLAIM":
      switch (event.type) {
        case "CARD_READY":
        case "CARD_FAILED":
        case "PRINTING":
        case "BADGE":
        case "COMMENTARY":
          return "CLAIM";
        case "OPEN_PALM":
          return "BOOT";
        case "TIMEOUT":
          return "SPINNING";
        default:
          return null;
      }

    case "LOBBY":
      switch (event.type) {
        case "SCAN":
          // The next player's double peace: their countdown (unless every slot is taken).
          return ctx.lobbyFull ? null : "LOBBY_COUNTDOWN";
        case "START_BATTLE":
          return ctx.lobbyCanStart ? "BATTLE_INTRO" : null;
        case "SLOT_SCORED":
        case "SLOT_FAILED":
          return "LOBBY";
        case "OPEN_PALM":
          return "BOOT";
        case "TIMEOUT":
          // A squad that waited long enough just starts; a lonely duel ends.
          return ctx.lobbyCanStart ? "BATTLE_INTRO" : "SPINNING";
        default:
          return null;
      }

    case "LOBBY_COUNTDOWN":
      switch (event.type) {
        case "SLOT_CAPTURED":
          // Full lobby goes straight into the VS intro (ctx reflects the lobby AFTER the capture).
          return ctx.lobbyFull ? "BATTLE_INTRO" : "LOBBY";
        case "CAPTURE_FAILED":
          return "LOBBY";
        case "SLOT_SCORED":
        case "SLOT_FAILED":
          return "LOBBY_COUNTDOWN";
        default:
          return null;
      }

    case "BATTLE_INTRO":
      switch (event.type) {
        case "SLOT_SCORED":
          return "BATTLE_INTRO";
        case "SLOT_FAILED":
        case "ANALYSIS_FAILED":
          return "LOBBY"; // that player steps up again
        case "BATTLE_ANALYSIS_DONE":
          return "BATTLE_RESULT";
        default:
          return null;
      }

    case "BATTLE_RESULT":
      switch (event.type) {
        case "THUMB_UP":
          return ctx.revealing ? null : "CLAIM";
        case "COMMENTARY":
        case "REVEAL_STEP":
          return "BATTLE_RESULT";
        case "OPEN_PALM":
          return "BOOT";
        case "TIMEOUT":
          return "SPINNING";
        default:
          return null;
      }

    case "SULKING":
      switch (event.type) {
        case "SULK_DONE":
          return "READY";
        case "SCAN":
          return "CHARGING";
        case "WAVE":
          return "SULKING"; // still ignoring you
        default:
          return null;
      }
  }
}

/** States with no active session (mannequin keeps re-rolling). */
export const IDLE_STATES: readonly KioskState[] = ["SPINNING", "ATTRACT"];

export function isIdleState(state: KioskState): boolean {
  return IDLE_STATES.includes(state);
}

/** Aura Battles screens (lobby through the result). */
export function isBattleState(state: KioskState): boolean {
  return state === "LOBBY" || state === "LOBBY_COUNTDOWN" || state === "BATTLE_INTRO" || state === "BATTLE_RESULT";
}

/** Where the mode select (BATTLE / SOLO SCAN / SQUAD) is on screen. */
export function showsModeSelect(state: KioskState): boolean {
  return isIdleState(state) || state === "READY";
}

/** Lobby countdown length (the capture fires when it ends). */
export const LOBBY_COUNTDOWN_MS = 3000;
/** The VS intro runs at least this long, so the scoring hides under an animation, not a spinner. */
export const BATTLE_INTRO_MIN_MS = 1400;

/** Automatic transitions: after `ms` in the state, send `event`. */
export const STATE_TIMEOUTS: Partial<Record<KioskState, { ms: number; event: KioskEvent }>> = {
  LOCKING: { ms: 1600, event: { type: "LOCK_DONE" } },
  GREETING: { ms: 2400, event: { type: "GREETING_DONE" } },
  POSE_FOR_FANS: { ms: 2200, event: { type: "POSE_DONE" } },
  CHARGING: { ms: 700, event: { type: "CHARGE_DONE" } },
  COUNTDOWN: { ms: 3000, event: { type: "COUNTDOWN_DONE" } },
  RESULT: { ms: 30_000, event: { type: "TIMEOUT" } },
  NAME_ENTRY: { ms: 60_000, event: { type: "TIMEOUT" } },
  CLAIM: { ms: 30_000, event: { type: "TIMEOUT" } },
  LOBBY: { ms: 75_000, event: { type: "TIMEOUT" } },
  // Safety net only: the intro normally ends as soon as the battle is computed.
  BATTLE_INTRO: { ms: 45_000, event: { type: "ANALYSIS_FAILED", message: "AURA SENSORS OVERHEATED. TRY AGAIN IN A MINUTE." } },
  BATTLE_RESULT: { ms: 40_000, event: { type: "TIMEOUT" } },
  READY: { ms: 90_000, event: { type: "TIMEOUT" } },
  // SPINNING -> ATTRACT after 60s with no person is driven by the gesture runtime.
};

export const GESTURE_LEGEND: Record<GestureId, { emoji: string; label: string }> = {
  double_peace: { emoji: "✌️✌️", label: "DOUBLE PEACE: SOLO SCAN" },
  double_fist: { emoji: "✊✊", label: "TWO FISTS: AURA BATTLE" },
  wave: { emoji: "👋", label: "WAVE: SAY HI" },
  thumb_up: { emoji: "👍", label: "THUMBS UP: CLAIM CARD" },
  thumb_down: { emoji: "👎", label: "THUMBS DOWN: ROAST ME" },
  open_palm: { emoji: "✋", label: "RAISED PALM: END SESSION" },
};

/** State-specific wording for a legend chip (the same gesture means different things per screen). */
export function legendLabel(gesture: GestureId, state: KioskState): string {
  if (state === "LOBBY") {
    if (gesture === "double_peace") return "DOUBLE PEACE: STEP UP + CAPTURE";
    if (gesture === "thumb_up") return "THUMBS UP: START THE BATTLE";
  }
  if (state === "READY" && gesture === "thumb_up") return "THUMBS UP: SQUAD BATTLE";
  if (state === "BATTLE_RESULT" && gesture === "thumb_up") return "THUMBS UP: SAVE THE BATTLE CARD";
  return GESTURE_LEGEND[gesture].label;
}

/**
 * What the legend shows. Before anyone waves (spinning / attract) only the
 * wave is advertised (the mode select window lists the rest). The hidden
 * gestures still work (gesturesForState).
 */
export function legendForState(state: KioskState): GestureId[] {
  // After the greeting a wave only gets a (more bored) wave back: it works, but is not advertised.
  return isIdleState(state) ? ["wave"] : gesturesForState(state).filter((g) => g !== "wave");
}

/** Gestures that do something in the given state (drives what the engine allows). */
export function gesturesForState(state: KioskState): GestureId[] {
  switch (state) {
    case "SPINNING":
    case "ATTRACT":
      return ["wave", "double_peace", "double_fist", "thumb_up"];
    case "READY":
      return ["double_fist", "double_peace", "thumb_up", "wave"];
    case "GREETING":
    case "POSE_FOR_FANS":
      return ["double_peace", "double_fist"];
    case "SULKING":
      return ["double_peace"];
    case "RESULT":
      return ["thumb_up", "thumb_down"];
    case "LOBBY":
      return ["double_peace", "thumb_up"];
    case "BATTLE_RESULT":
      return ["thumb_up"];
    default:
      return [];
  }
}

/**
 * The kiosk event a recognized gesture sends in a state. The mode select
 * (idle / ready) reads two fists as AURA BATTLE (two people at once: an
 * instant duel) and a thumbs up as SQUAD; in the lobby both mean START.
 */
export function gestureEvent(gesture: EngineGesture, state: KioskState): KioskEvent | null {
  const inLobby = state === "LOBBY";
  const atModeSelect = showsModeSelect(state) || state === "GREETING" || state === "POSE_FOR_FANS";
  switch (gesture) {
    case "double_peace":
      return { type: "SCAN" };
    case "battle":
      return inLobby ? { type: "START_BATTLE" } : { type: "BATTLE" };
    case "solo_battle":
    case "double_fist":
      return inLobby ? { type: "START_BATTLE" } : { type: "OPEN_LOBBY", mode: "duel" };
    case "thumb_up":
      return inLobby ? { type: "START_BATTLE" } : atModeSelect ? { type: "OPEN_LOBBY", mode: "squad" } : { type: "THUMB_UP" };
    case "thumb_down":
      return { type: "THUMB_DOWN" };
    case "open_palm":
      return { type: "OPEN_PALM" };
    case "wave":
      return null; // carries a side: the runtime builds it
  }
}

/** Gestures are ignored while analyzing and during the reveal animation. */
export function gesturesIgnored(state: KioskState): boolean {
  return (
    state === "BOOT" ||
    state === "LOCKING" ||
    state === "CHARGING" ||
    state === "COUNTDOWN" ||
    state === "ANALYZING" ||
    state === "LOBBY_COUNTDOWN" ||
    state === "BATTLE_INTRO" ||
    state === "NAME_ENTRY" // typing: hands are on the keyboard
  );
}
