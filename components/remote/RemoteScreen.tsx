"use client";

import { useState } from "react";
import { AdminKeyGate, useAdminKey } from "@/components/admin/AdminKeyGate";
import type { RemoteCommandName } from "@/lib/kiosk/types";

const BUTTONS: { command: RemoteCommandName; label: string; emoji: string }[] = [
  { command: "battle", label: "AURA BATTLE", emoji: "⚔️" },
  { command: "squad", label: "SQUAD", emoji: "👥" },
  { command: "scan", label: "SCAN / CAPTURE", emoji: "✌️✌️" },
  { command: "start", label: "START BATTLE", emoji: "▶" },
  { command: "wave", label: "SIMULATE WAVE", emoji: "👋" },
  { command: "reset", label: "RESET", emoji: "↺" },
  { command: "mute", label: "MUTE", emoji: "🔇" },
  { command: "mode", label: "MODE TOGGLE", emoji: "🪞" },
];

/** Operator remote: big buttons, queued on the server for the kiosk to poll. */
export function RemoteScreen() {
  const { key, verified, setKey, verify, error } = useAdminKey();
  const [status, setStatus] = useState("");

  const sendCommand = async (command: RemoteCommandName) => {
    setStatus(`SENDING ${command.toUpperCase()}...`);
    const res = await fetch("/api/remote", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": key }, body: JSON.stringify({ command }) });
    setStatus(res.ok ? `${command.toUpperCase()} SENT.` : `FAILED (${res.status}).`);
  };

  return (
    <main className="tool-page aura-grid-bg">
      <div className="os-window os-window--light tool-page__window">
        <header className="os-window__title">
          <span>REMOTE.EXE · OPERATOR</span>
          <span>x</span>
        </header>
        <div className="os-window__body">
          {!verified ? (
            <AdminKeyGate value={key} onChange={setKey} onSubmit={verify} error={error} />
          ) : (
            <>
              <div className="remote__grid">
                {BUTTONS.map((b) => (
                  <button key={b.command} type="button" className="remote__button" onClick={() => sendCommand(b.command)}>
                    <span className="remote__emoji" aria-hidden>
                      {b.emoji}
                    </span>
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 font-mono text-[10px] uppercase opacity-70">{status || "READY."}</div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
