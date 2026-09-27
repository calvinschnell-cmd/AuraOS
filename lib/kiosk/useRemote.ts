"use client";

import { useEffect, useRef } from "react";
import type { RemoteCommand } from "./types";

/** Kiosk side of the operator remote: polls the server's command queue (/api/remote). */
export function useRemote(onCommand: (command: RemoteCommand) => void, pollMs = 1000): void {
  const handler = useRef(onCommand);
  useEffect(() => {
    handler.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    let cancelled = false;
    let cursor = -1;
    let timer = 0;
    const seen = new Set<number>();

    const poll = async () => {
      try {
        const res = await fetch(`/api/remote?since=${cursor < 0 ? 0 : cursor}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { cursor: number; commands: RemoteCommand[] };
        if (cancelled) return;
        if (cursor < 0) {
          // First poll only establishes the cursor: never replay old commands.
          cursor = body.cursor;
          return;
        }
        for (const c of body.commands) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            handler.current(c);
          }
        }
        cursor = body.cursor;
      } catch {
        // offline: keep polling
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, pollMs);
      }
    };
    void poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pollMs]);
}
