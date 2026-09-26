import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { KIOSK_STATUS_STALE_MS } from "@/lib/kiosk/status";
import { adminKeyFrom, isAdmin } from "@/lib/server/admin";
import { getKioskStatus } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST (operator, ADMIN_KEY): open the mirror on the kiosk laptop, i.e. run
 * scripts/launch-kiosk.ps1 -MirrorOnly (full screen on the portrait monitor).
 * Fixed command, no user input. Only on the Windows kiosk laptop; the public
 * server answers 400. Refuses while a mirror is already reporting in.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAdmin(adminKeyFrom(request))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (process.platform !== "win32") return NextResponse.json({ error: "ONLY ON THE KIOSK LAPTOP." }, { status: 400 });
  const status = getKioskStatus();
  if (status && Date.now() - status.at < KIOSK_STATUS_STALE_MS) return NextResponse.json({ error: "THE MIRROR IS ALREADY OPEN." }, { status: 409 });
  const script = path.join(process.cwd(), "scripts", "launch-kiosk.ps1");
  if (!existsSync(script)) return NextResponse.json({ error: "LAUNCHER NOT FOUND." }, { status: 500 });
  const port = new URL(request.url).port || "3000";
  // Not detached: PowerShell without a console exits without running anything. The launcher
  // lives for a second; Chrome (started by it) is independent. Output goes to a log for debugging.
  const log = openSync(path.join(tmpdir(), "aura-mirror-launch.log"), "a");
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `& "${script}" -MirrorOnly -Base http://localhost:${port} *>&1`],
    { stdio: ["ignore", log, log], windowsHide: true },
  );
  child.on("error", (err) => console.error("[aura] mirror launch failed", err));
  return NextResponse.json({ ok: true });
}
