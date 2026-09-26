import { NextResponse } from "next/server";
import { REMOTE_COMMANDS, type RemoteCommandName } from "@/lib/kiosk/types";
import { adminKeyFrom, isAdmin } from "@/lib/server/admin";
import { getRelay } from "@/lib/server/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { command } with x-admin-key: queue a remote command for the kiosk. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAdmin(adminKeyFrom(request))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { command?: string };
  if (!body.command || !REMOTE_COMMANDS.includes(body.command as RemoteCommandName)) {
    return NextResponse.json({ error: "UNKNOWN COMMAND" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getRelay().pushCommand(body.command as RemoteCommandName));
  } catch (err) {
    console.error("[aura] remote command failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "NOT SENT" }, { status: 503 });
  }
}

/** GET ?since=cursor: commands queued after the cursor (kiosk polling fallback). */
export async function GET(request: Request): Promise<NextResponse> {
  const since = Number.parseInt(new URL(request.url).searchParams.get("since") ?? "0", 10) || 0;
  try {
    return NextResponse.json(await getRelay().commandsSince(since));
  } catch {
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}
