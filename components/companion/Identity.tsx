"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { loadIdentity, saveIdentity, subscribeIdentity } from "@/lib/companion/identity";
import { registerPlayer } from "@/lib/companion/register";
import type { PlayerInfo } from "@/lib/kiosk/types";
import { historyPath, parseHandle } from "@/lib/players";
import { checkPlayerName } from "@/lib/profanity";

/** The cached identity (null on the server and until one is set). */
export function useIdentity(): [PlayerInfo | null, (p: PlayerInfo | null) => void] {
  const player = useSyncExternalStore(subscribeIdentity, loadIdentity, () => null);
  return [player, saveIdentity];
}

/**
 * "Who are you?" once per phone: a name gets a fresh AURA ID; typing an
 * existing AURA ID (NAME#CODE) picks up a history. No passwords, no accounts.
 */
export function IdentityForm({ onDone, cta = "SAVE" }: { onDone: (p: PlayerInfo) => void; cta?: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const returning = parseHandle(value);
    const check = checkPlayerName(returning ? returning.name : value);
    if (!check.ok) return setError(check.error);
    if (!check.name) return setError("TYPE A NAME.");
    setBusy(true);
    const player = await registerPlayer(returning ? { handle: returning.handle } : { name: check.name });
    setBusy(false);
    if (player === "unknown") return setError("AURA ID NOT FOUND. CHECK THE CODE, OR TYPE JUST YOUR NAME.");
    if (!player) return setError("OFFLINE. TRY AGAIN IN A SECOND.");
    saveIdentity(player);
    onDone(player);
  };
  return (
    <form
      className="companion-id"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        className="companion-id__input"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        placeholder="YOUR NAME (OR NAME#CODE)"
        maxLength={24}
        autoCapitalize="characters"
        autoComplete="nickname"
        disabled={busy}
        aria-label="Your name or AURA ID"
      />
      <button type="submit" className="card-page__button" disabled={busy}>
        [{busy ? "..." : cta}]
      </button>
      {error && <div className="companion-id__error">{error}</div>}
    </form>
  );
}

/** Header chip: your AURA ID (switchable), or a one-line nudge to the JOIN tab. */
export function IdentityBar() {
  const [player, setPlayer] = useIdentity();
  const [editing, setEditing] = useState(false);
  if (player && !editing) {
    return (
      <div className="companion-bar">
        <span>
          YOU: <a href={historyPath(player.handle)}>{player.handle}</a>
        </span>
        <button type="button" className="companion-bar__link" onClick={() => setEditing(true)}>
          [SWITCH]
        </button>
      </div>
    );
  }
  if (!editing) {
    return (
      <Link href="/me" className="companion-bar companion-bar--cta">
        <span>NAME YOURSELF ONCE: CARDS, STREAKS, YOUR PROFILE.</span>
        <span className="companion-bar__go">GET YOUR AURA ID →</span>
      </Link>
    );
  }
  return (
    <div className="companion-bar companion-bar--form">
      <span>SWITCH TO ANOTHER NAME OR AURA ID.</span>
      <IdentityForm
        onDone={(p) => {
          setPlayer(p);
          setEditing(false);
        }}
      />
    </div>
  );
}
