import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { KIOSK_STATUS_STALE_MS } from "@/lib/kiosk/status";
import { getRelay } from "./relay";

/** Is a mirror reporting in right now? */
export async function mirrorIsLive(): Promise<boolean> {
  const status = await getRelay().kioskStatus();
  return status !== null && Date.now() - status.at < KIOSK_STATUS_STALE_MS;
}

/**
 * Open the mirror on this (Windows kiosk) laptop: scripts/launch-kiosk.ps1
 * -MirrorOnly, full screen on the portrait monitor. Fixed command, no user input.
 */
export function launchMirror(port: string): { ok: true } | { ok: false; error: string } {
  if (process.platform !== "win32") return { ok: false, error: "ONLY ON THE KIOSK LAPTOP." };
  const script = path.join(process.cwd(), "scripts", "launch-kiosk.ps1");
  if (!existsSync(script)) return { ok: false, error: "LAUNCHER NOT FOUND." };
  // Not detached: PowerShell without a console exits without running anything. The launcher
  // lives for a second; Chrome (started by it) is independent. Output goes to a log for debugging.
  const log = openSync(path.join(tmpdir(), "aura-mirror-launch.log"), "a");
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `& "${script}" -MirrorOnly -Base http://localhost:${port} *>&1`],
    { stdio: ["ignore", log, log], windowsHide: true },
  );
  child.on("error", (err) => console.error("[aura] mirror launch failed", err));
  return { ok: true };
}

const POLL_MS = 3_000;
const g = globalThis as unknown as { __auraMirrorPoller?: ReturnType<typeof setInterval> };

/**
 * Kiosk laptop only (Windows + Tiger Data): pick up OPEN MIRROR requests made
 * on the public server's /admin and open the mirror here. Started once from
 * instrumentation.ts.
 */
export function startMirrorLaunchPoller(port: string): void {
  if (g.__auraMirrorPoller || process.platform !== "win32" || getRelay().kind !== "tiger") return;
  let busy = false;
  g.__auraMirrorPoller = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      if (!(await getRelay().takeMirrorLaunch())) return;
      if (await mirrorIsLive()) return console.info("[aura] mirror launch requested, but the mirror is already open");
      console.info("[aura] mirror launch requested from /admin: opening the mirror");
      const result = launchMirror(port);
      if (!result.ok) console.error("[aura] mirror launch failed:", result.error);
    } catch (err) {
      console.error("[aura] mirror launch poll failed", err instanceof Error ? err.message : err);
    } finally {
      busy = false;
    }
  }, POLL_MS);
}
