"use client";

import type { PlayerInfo } from "@/lib/kiosk/types";

/**
 * Lightweight identity for the companion app (no accounts): the player's
 * AURA ID (NAME#CODE from /api/players), entered once and cached in this
 * browser, plus an anonymous device id so reactions count once per phone.
 * Every storage access is guarded: private windows can throw.
 */

const IDENTITY_KEY = "aura.identity";
const CLIENT_KEY = "aura.clientId";

const CHANGED = "aura:identity";
/** Fallback when storage is unavailable: identity lasts for this page only. */
let memoryIdentity: string | null = null;
let cached: { raw: string | null; value: PlayerInfo | null } = { raw: null, value: null };

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(IDENTITY_KEY);
  } catch {
    return memoryIdentity;
  }
}

/** Current identity (stable object per stored value, for useSyncExternalStore). */
export function loadIdentity(): PlayerInfo | null {
  const raw = readRaw();
  if (raw === cached.raw) return cached.value;
  let value: PlayerInfo | null = null;
  try {
    const v = raw ? (JSON.parse(raw) as Partial<PlayerInfo>) : null;
    value = v && typeof v.handle === "string" && typeof v.name === "string" ? { handle: v.handle, name: v.name } : null;
  } catch {
    value = null;
  }
  cached = { raw, value };
  return value;
}

export function saveIdentity(player: PlayerInfo | null): void {
  const raw = player ? JSON.stringify(player) : null;
  try {
    if (raw) window.localStorage.setItem(IDENTITY_KEY, raw);
    else window.localStorage.removeItem(IDENTITY_KEY);
  } catch {
    memoryIdentity = raw;
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Subscribe to identity changes (this tab and others). */
export function subscribeIdentity(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

let memoryClientId: string | null = null;

export function clientId(): string {
  try {
    let id = window.localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    memoryClientId ??= crypto.randomUUID();
    return memoryClientId;
  }
}
