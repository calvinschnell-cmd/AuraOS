"use client";

import { useEffect, useRef } from "react";
import type { KioskStatus } from "./status";

/** Changes are coalesced this long; a heartbeat goes out this often even when nothing changes. */
const THROTTLE_MS = 400;
const HEARTBEAT_MS = 3_000;

/**
 * Posts what the mirror is showing to /api/kiosk/status for the operator
 * dashboard: right after it changes (coalesced) and as a heartbeat, so the
 * dashboard can tell a quiet mirror from a closed one. Best-effort only.
 */
export function useKioskStatusReporter(status: Omit<KioskStatus, "at">): void {
  const json = JSON.stringify(status);
  const latest = useRef(json);
  const sentAt = useRef(0);
  const timer = useRef(0);

  useEffect(() => {
    latest.current = json;
    const send = () => {
      sentAt.current = Date.now();
      void fetch("/api/kiosk/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: latest.current, keepalive: true }).catch(() => {});
    };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(send, Math.max(0, THROTTLE_MS - (Date.now() - sentAt.current)));
    return () => window.clearTimeout(timer.current);
  }, [json]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (Date.now() - sentAt.current < HEARTBEAT_MS) return;
      sentAt.current = Date.now();
      void fetch("/api/kiosk/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: latest.current }).catch(() => {});
    }, 1_000);
    return () => window.clearInterval(id);
  }, []);
}
