import { NextResponse } from "next/server";
import { adminKeyFrom, isAdmin } from "@/lib/server/admin";
import { launchMirror, mirrorIsLive } from "@/lib/server/mirrorLaunch";
import { getRelay } from "@/lib/server/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST (admin, ADMIN_KEY): open the mirror. On the Windows kiosk laptop it runs
 * scripts/launch-kiosk.ps1 -MirrorOnly right here; anywhere else (the public
 * server) it leaves a launch request in Tiger Data that the laptop's server
 * picks up within a few seconds (mirrorLaunch.ts). Refuses while a mirror is
 * already reporting in.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAdmin(adminKeyFrom(request))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (await mirrorIsLive().catch(() => false)) return NextResponse.json({ error: "THE MIRROR IS ALREADY OPEN." }, { status: 409 });
  if (process.platform === "win32") {
    const result = launchMirror(new URL(request.url).port || "3000");
    return result.ok ? NextResponse.json({ ok: true, relayed: false }) : NextResponse.json({ error: result.error }, { status: 500 });
  }
  const relay = getRelay();
  if (relay.kind !== "tiger") return NextResponse.json({ error: "ONLY ON THE KIOSK LAPTOP." }, { status: 400 });
  try {
    await relay.requestMirrorLaunch();
  } catch (err) {
    console.error("[aura] mirror launch request failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "COULD NOT REACH THE DATABASE." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, relayed: true });
}
