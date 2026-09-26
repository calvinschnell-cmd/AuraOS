import { describe, expect, it } from "vitest";
import { GESTURE_LEGEND, gestureEvent, gesturesForState, gesturesIgnored, legendForState, transition } from "@/lib/kiosk/machine";
import { KIOSK_STATES, type KioskState } from "@/lib/kiosk/types";

describe("kiosk state machine", () => {
  it("boots into SPINNING and locks on a wave", () => {
    expect(transition("BOOT", { type: "BOOT_DONE" })).toBe("SPINNING");
    expect(transition("SPINNING", { type: "WAVE", side: "left" })).toBe("LOCKING");
    expect(transition("LOCKING", { type: "LOCK_DONE" })).toBe("GREETING");
    expect(transition("GREETING", { type: "GREETING_DONE" })).toBe("POSE_FOR_FANS");
    expect(transition("POSE_FOR_FANS", { type: "POSE_DONE" })).toBe("READY");
  });

  it("runs the scan pipeline", () => {
    expect(transition("READY", { type: "SCAN" })).toBe("CHARGING");
    expect(transition("CHARGING", { type: "CHARGE_DONE" })).toBe("COUNTDOWN");
    expect(transition("COUNTDOWN", { type: "COUNTDOWN_DONE" })).toBe("ANALYZING");
    const scan = { id: "x" } as never;
    expect(transition("ANALYZING", { type: "ANALYSIS_DONE", scan })).toBe("RESULT");
    expect(transition("ANALYZING", { type: "ANALYSIS_FAILED", message: "boom" })).toBe("READY");
  });

  it("handles result gestures", () => {
    expect(transition("RESULT", { type: "THUMB_UP" })).toBe("NAME_ENTRY");
    expect(transition("RESULT", { type: "THUMB_DOWN" })).toBe("RESULT");
    expect(transition("RESULT", { type: "ROAST_READY", text: "x" })).toBe("RESULT");
    expect(transition("RESULT", { type: "OPEN_PALM" })).toBe("BOOT");
    expect(transition("BOOT", { type: "BOOT_DONE" })).toBe("SPINNING");
    expect(transition("CLAIM", { type: "TIMEOUT" })).toBe("SPINNING");
  });

  it("only advertises the wave before a session starts, but still allows scan and battle", () => {
    expect(legendForState("SPINNING")).toEqual(["wave"]);
    expect(legendForState("ATTRACT")).toEqual(["wave"]);
    expect(gesturesForState("SPINNING")).toContain("double_peace");
    expect(legendForState("READY")).toEqual(gesturesForState("READY"));
  });

  it("clowns a solo battle in place without starting one", () => {
    expect(transition("SPINNING", { type: "SOLO_BATTLE" })).toBe("SPINNING");
    expect(transition("ATTRACT", { type: "SOLO_BATTLE" })).toBe("ATTRACT");
    expect(transition("READY", { type: "SOLO_BATTLE" })).toBe("READY");
    expect(transition("RESULT", { type: "SOLO_BATTLE" })).toBeNull();
    expect(transition("ANALYZING", { type: "SOLO_BATTLE" })).toBeNull();
  });

  it("thumbs up asks for a leaderboard name before claiming", () => {
    expect(transition("NAME_ENTRY", { type: "NAME_SUBMIT", name: "Calvin", handle: "CALVIN#K7QX" })).toBe("CLAIM");
    expect(transition("NAME_ENTRY", { type: "NAME_SUBMIT", name: null, handle: null })).toBe("CLAIM");
    expect(transition("NAME_ENTRY", { type: "NAME_CANCEL" })).toBe("RESULT");
    expect(transition("NAME_ENTRY", { type: "TIMEOUT" })).toBe("SPINNING");
    // Hands are on the keyboard: no gesture reaches the machine while typing.
    expect(gesturesIgnored("NAME_ENTRY")).toBe(true);
    expect(transition("NAME_ENTRY", { type: "OPEN_PALM" })).toBeNull();
    expect(transition("NAME_ENTRY", { type: "THUMB_UP" })).toBeNull();
    // Battles have no leaderboard entry: straight to the card.
    expect(transition("BATTLE_RESULT", { type: "THUMB_UP" })).toBe("CLAIM");
  });

  it("maps mode-select gestures to battle events", () => {
    expect(gestureEvent("solo_battle", "SPINNING")).toEqual({ type: "OPEN_LOBBY", mode: "duel" });
    expect(gestureEvent("thumb_up", "READY")).toEqual({ type: "OPEN_LOBBY", mode: "squad" });
    expect(gestureEvent("battle", "READY")).toEqual({ type: "BATTLE" });
    expect(gestureEvent("thumb_up", "LOBBY")).toEqual({ type: "START_BATTLE" });
    expect(gestureEvent("thumb_up", "RESULT")).toEqual({ type: "THUMB_UP" });
    expect(gestureEvent("double_peace", "LOBBY")).toEqual({ type: "SCAN" });
  });

  it("opens the battle lobby from the mode select and steps players up one by one", () => {
    for (const s of ["SPINNING", "ATTRACT", "READY", "GREETING", "POSE_FOR_FANS"] as KioskState[]) {
      expect(transition(s, { type: "OPEN_LOBBY", mode: "duel" })).toBe("LOBBY");
      expect(transition(s, { type: "OPEN_LOBBY", mode: "squad" })).toBe("LOBBY");
    }
    // Two people together skip the lobby: one countdown captures both.
    expect(transition("READY", { type: "BATTLE" })).toBe("LOBBY_COUNTDOWN");
    expect(transition("LOBBY", { type: "SCAN" }, { lobbyFull: false })).toBe("LOBBY_COUNTDOWN");
    expect(transition("LOBBY", { type: "SCAN" }, { lobbyFull: true })).toBeNull();
    expect(transition("LOBBY_COUNTDOWN", { type: "SLOT_CAPTURED", slots: [] }, { lobbyFull: false })).toBe("LOBBY");
    expect(transition("LOBBY_COUNTDOWN", { type: "SLOT_CAPTURED", slots: [] }, { lobbyFull: true })).toBe("BATTLE_INTRO");
    expect(transition("LOBBY_COUNTDOWN", { type: "CAPTURE_FAILED", message: "x" })).toBe("LOBBY");
    // Squad: start with 2+, a lonely lobby times out.
    expect(transition("LOBBY", { type: "START_BATTLE" }, { lobbyCanStart: false })).toBeNull();
    expect(transition("LOBBY", { type: "START_BATTLE" }, { lobbyCanStart: true })).toBe("BATTLE_INTRO");
    expect(transition("LOBBY", { type: "TIMEOUT" }, { lobbyCanStart: true })).toBe("BATTLE_INTRO");
    expect(transition("LOBBY", { type: "TIMEOUT" }, { lobbyCanStart: false })).toBe("SPINNING");
    expect(transition("LOBBY", { type: "OPEN_PALM" })).toBe("BOOT");
    // A failed score sends that player back to the lobby.
    expect(transition("BATTLE_INTRO", { type: "SLOT_FAILED", captureId: "c", message: "x" })).toBe("LOBBY");
    expect(transition("BATTLE_INTRO", { type: "ANALYSIS_FAILED", message: "x" })).toBe("LOBBY");
    expect(gesturesIgnored("BATTLE_INTRO")).toBe(true);
    expect(gesturesIgnored("LOBBY_COUNTDOWN")).toBe(true);
    expect(gesturesForState("LOBBY")).toEqual(expect.arrayContaining(["double_peace", "thumb_up", "open_palm"]));
  });

  it("routes battles through the VS intro and cards through claim", () => {
    expect(transition("BATTLE_INTRO", { type: "BATTLE_ANALYSIS_DONE", battle: {} as never })).toBe("BATTLE_RESULT");
    expect(transition("BATTLE_RESULT", { type: "COMMENTARY", battleId: "b", text: "x", done: false })).toBe("BATTLE_RESULT");
    expect(transition("CLAIM", { type: "COMMENTARY", battleId: "b", text: "x", done: true })).toBe("CLAIM");
    expect(transition("BATTLE_RESULT", { type: "THUMB_UP" })).toBe("CLAIM");
    expect(transition("CLAIM", { type: "CARD_READY", card: {} as never })).toBe("CLAIM");
    expect(transition("CLAIM", { type: "PRINTING" })).toBe("CLAIM");
    expect(transition("READY", { type: "MELTDOWN", level: "annoyed" })).toBe("READY");
    expect(transition("SULKING", { type: "WAVE", side: "left" })).toBe("SULKING");
    expect(transition("SULKING", { type: "SULK_DONE" })).toBe("READY");
  });

  it("allows scanning straight from idle and from the sulk", () => {
    expect(transition("SPINNING", { type: "SCAN" })).toBe("CHARGING");
    expect(transition("ATTRACT", { type: "SCAN" })).toBe("CHARGING");
    expect(transition("SULKING", { type: "SCAN" })).toBe("CHARGING");
  });

  it("resets from any non-boot state", () => {
    for (const state of KIOSK_STATES) {
      const next = transition(state, { type: "RESET" });
      expect(next).toBe(state === "BOOT" ? null : "SPINNING");
    }
  });

  it("ignores invalid events", () => {
    expect(transition("ANALYZING", { type: "WAVE", side: "left" })).toBeNull();
    expect(transition("COUNTDOWN", { type: "THUMB_UP" })).toBeNull();
    expect(transition("BOOT", { type: "SCAN" })).toBeNull();
  });

  it("legend only lists gestures with a valid transition", () => {
    for (const state of KIOSK_STATES as readonly KioskState[]) {
      for (const g of gesturesForState(state)) {
        expect(GESTURE_LEGEND[g]).toBeDefined();
        const event = gestureEvent(g, state) ?? { type: "WAVE", side: "left" };
        // A lobby with enough players can start.
        expect(transition(state, event, { lobbyCanStart: true })).not.toBeNull();
      }
      if (gesturesIgnored(state)) expect(gesturesForState(state)).toEqual([]);
    }
  });
});
