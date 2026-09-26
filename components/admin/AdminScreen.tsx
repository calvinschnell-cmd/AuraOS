"use client";

import { useCallback, useEffect, useState } from "react";
import type { LeaderboardEntry, LeaderboardSnapshot } from "@/lib/kiosk/types";
import { formatAura } from "@/lib/scoring";
import { AdminKeyGate, useAdminKey } from "./AdminKeyGate";

/** Paste ADMIN_KEY to delete leaderboard entries. */
export function AdminScreen() {
  const { key, verified, setKey, verify, error } = useAdminKey();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/leaderboard", { cache: "no-store" });
    if (!res.ok) return;
    const s = (await res.json()) as LeaderboardSnapshot;
    const byId = new Map<string, LeaderboardEntry>();
    for (const e of [...s.top, ...s.recent]) byId.set(e.id, e);
    setEntries([...byId.values()].sort((a, b) => b.aura - a.aura));
  }, []);

  useEffect(() => {
    if (!verified) return;
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [verified, load]);

  const remove = async (id: string) => {
    setStatus("DELETING...");
    const res = await fetch(`/api/admin/entry/${id}`, { method: "DELETE", headers: { "x-admin-key": key } });
    setStatus(res.ok ? "DELETED." : `FAILED (${res.status}).`);
    await load();
  };

  return (
    <main className="tool-page aura-grid-bg">
      <div className="os-window os-window--light tool-page__window">
        <header className="os-window__title">
          <span>ADMIN.EXE · LEADERBOARD</span>
          <span>x</span>
        </header>
        <div className="os-window__body">
          {!verified ? (
            <AdminKeyGate value={key} onChange={setKey} onSubmit={verify} error={error} />
          ) : (
            <>
              <div className="flex items-center justify-between font-heading text-[10px] uppercase">
                <span>{entries.length} ENTRIES</span>
                <button type="button" className="tool-page__button" onClick={load}>
                  [REFRESH]
                </button>
              </div>
              <ul className="tool-page__list">
                {entries.map((e) => (
                  <li key={e.id}>
                    <span className="font-mono text-xs uppercase">
                      {e.nickname} · {formatAura(e.aura)} · {new Date(e.createdAt).toLocaleTimeString()}
                    </span>
                    <button type="button" className="tool-page__button tool-page__button--danger" onClick={() => remove(e.id)}>
                      [DELETE]
                    </button>
                  </li>
                ))}
              </ul>
              <div className="font-mono text-[10px] uppercase opacity-70">{status}</div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
