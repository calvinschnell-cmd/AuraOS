import { ATTRACT_LINES } from "@/lib/copy";
import type { KioskState, SessionState } from "./types";

/** Terminal lines to print when the kiosk enters `state`. */
export function terminalLinesFor(state: KioskState, session: SessionState): string[] {
  switch (state) {
    case "BOOT":
      return [];
    case "SPINNING":
      return ["> SELECTING YOUR GUY..."];
    case "LOCKING":
      return ["> FIT LOCKED."];
    case "GREETING":
      return ["> HELLO."];
    case "POSE_FOR_FANS":
      return ["> POSE FOR THE FANS."];
    case "READY":
      return ["> DOUBLE PEACE TO SCAN YOUR AURA."];
    case "CHARGING":
      return ["> CHARGING AURA SENSORS..."];
    case "COUNTDOWN":
      return ["> HANDS DOWN, STRIKE A POSE!"];
    case "ANALYZING":
      return ["> FRAME CAPTURED.", "> ANALYZING DRIP..."];
    case "RESULT":
      return session.errorMessage
        ? [`> ${session.errorMessage}`]
        : ["> ANALYSIS COMPLETE.", "> THUMBS UP TO JOIN THE LEADERBOARD."];
    case "NAME_ENTRY":
      return ["> TYPE YOUR NAME FOR THE LEADERBOARD.", "> ENTER TO JOIN. ESC TO GO BACK."];
    case "CLAIM":
      return ["> FILING YOUR CLAIM...", "> SAVING CARD..."];
    case "LOBBY": {
      const lobby = session.lobby;
      if (!lobby) return [];
      if (lobby.slots.length === 0) return [lobby.mode === "duel" ? "> AURA BATTLE LOBBY OPEN. 1V1." : "> SQUAD LOBBY OPEN. UP TO 5.", "> PLAYER 1, STEP UP. DOUBLE PEACE TO CAPTURE."];
      if (lobby.next < lobby.capacity) return [`> PLAYER ${lobby.next + 1}, STEP UP.`];
      return ["> LOBBY FULL."];
    }
    case "LOBBY_COUNTDOWN":
      return session.lobby?.pair ? ["> AURA BATTLE INITIATED.", "> BOTH OF YOU: STRIKE A POSE!"] : [`> PLAYER ${(session.lobby?.next ?? 0) + 1}: STRIKE A POSE. POSE IS SCORED.`];
    case "BATTLE_INTRO":
      return ["> LOBBY LOCKED.", "> COMPUTING AURA DIFFERENTIAL..."];
    case "BATTLE_RESULT":
      return ["> BATTLE COMPLETE.", "> THUMBS UP TO SAVE THE BATTLE CARD."];
    case "SULKING":
      return ["> TALK TO THE HAND."];
    case "ATTRACT":
      return [`> ${ATTRACT_LINES[0]}`];
  }
}
