import { capacityFor, SQUAD_MIN, type BattleMode } from "@/lib/battle/types";
import type { PoseResult } from "@/lib/pose/score";
import type { Lobby, LobbySlot, ScanResult } from "./types";

/**
 * Pure lobby bookkeeping shared by the machine and the views. One lobby for
 * both modes: a duel is a lobby of two, a squad a lobby of up to five.
 */

export function newLobby(mode: BattleMode, pair = false): Lobby {
  return { mode, capacity: capacityFor(mode), slots: [], next: 0, pair, error: null };
}

/** Lowest slot index with no capture. */
export function nextOpenSlot(slots: readonly LobbySlot[], capacity: number): number {
  for (let i = 0; i < capacity; i++) if (!slots.some((s) => s.slot === i)) return i;
  return capacity;
}

export function filledCount(lobby: Lobby): number {
  return lobby.slots.length;
}

export function isFull(lobby: Lobby): boolean {
  return lobby.slots.length >= lobby.capacity;
}

/** A duel needs both players; a squad can start with 2+ (nobody waits for a fifth). */
export function canStart(lobby: Lobby): boolean {
  return lobby.mode === "duel" ? isFull(lobby) : lobby.slots.length >= SQUAD_MIN;
}

/** Every capture scored (the battle can be computed). */
export function allScored(lobby: Lobby): boolean {
  return lobby.slots.length > 0 && lobby.slots.every((s) => s.status === "ready");
}

export function withCaptured(lobby: Lobby, captured: readonly LobbySlot[]): Lobby {
  const slots = [...lobby.slots.filter((s) => !captured.some((c) => c.slot === s.slot)), ...captured].sort((a, b) => a.slot - b.slot).slice(0, lobby.capacity);
  return { ...lobby, slots, next: nextOpenSlot(slots, lobby.capacity), error: null, pair: false };
}

export function withScored(lobby: Lobby, captureId: string, scan: ScanResult, pose: PoseResult): Lobby {
  return { ...lobby, slots: lobby.slots.map((s) => (s.captureId === captureId ? { ...s, status: "ready", scan, poseResult: pose } : s)) };
}

/** A capture that could not be scored frees its slot: that player steps up again. */
export function withFailed(lobby: Lobby, captureId: string, message: string): Lobby {
  const failed = lobby.slots.find((s) => s.captureId === captureId);
  if (!failed) return lobby;
  const slots = lobby.slots.filter((s) => s.captureId !== captureId);
  return { ...lobby, slots, next: nextOpenSlot(slots, lobby.capacity), error: `PLAYER ${failed.slot + 1}: ${message}` };
}
