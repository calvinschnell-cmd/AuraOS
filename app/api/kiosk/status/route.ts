import { NextResponse } from "next/server";
import { isKioskStatus } from "@/lib/kiosk/status";
import { getKioskStatus, setKioskStatus } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 16_000;

/**
 * POST: the kiosk reports what the mirror is showing (on change + heartbeat).
 * GET: the operator dashboard reads it. It is only what the public mirror
 * already displays (state, nicknames, scores), so neither side needs a key.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const text = await request.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "TOO LARGE" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "BAD STATUS" }, { status: 400 });
  }
  if (!isKioskStatus(body)) return NextResponse.json({ error: "BAD STATUS" }, { status: 400 });
  setKioskStatus({ ...body, at: Date.now() });
  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: getKioskStatus(), now: Date.now() });
}
