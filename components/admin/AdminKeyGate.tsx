"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE = "aura-os.admin-key";

function savedKey(): string {
  try {
    return sessionStorage.getItem(STORAGE) ?? "";
  } catch {
    return "";
  }
}

/** Operator key kept for the tab session; verified against the server. */
export function useAdminKey() {
  const [key, setKey] = useState(savedKey);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(
    async (candidate?: string) => {
      const k = candidate ?? key;
      const res = await fetch("/api/admin/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: k }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (body.ok) {
        setVerified(true);
        setError(null);
        try {
          sessionStorage.setItem(STORAGE, k);
        } catch {
          // ignore
        }
      } else {
        setVerified(false);
        setError(body.error ?? "WRONG KEY.");
      }
    },
    [key],
  );

  // A key saved earlier in this tab is re-verified on mount.
  useEffect(() => {
    const saved = savedKey();
    if (!saved) return;
    const id = window.setTimeout(() => void verify(saved), 0);
    return () => window.clearTimeout(id);
    // once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { key, setKey, verified, verify: () => verify(), error };
}

export function AdminKeyGate({ value, onChange, onSubmit, error }: { value: string; onChange: (v: string) => void; onSubmit: () => void; error: string | null }) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="font-heading text-[10px] uppercase" htmlFor="admin-key">
        ADMIN_KEY
      </label>
      <input id="admin-key" type="password" value={value} onChange={(e) => onChange(e.target.value)} className="tool-page__input" autoComplete="off" />
      <button type="submit" className="tool-page__button">
        [UNLOCK]
      </button>
      {error && <div className="font-mono text-[10px] uppercase">{error}</div>}
    </form>
  );
}
