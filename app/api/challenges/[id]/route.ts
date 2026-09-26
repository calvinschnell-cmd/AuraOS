import { NextResponse } from "next/server";
import { adminKeyFrom, isAdmin } from "@/lib/server/admin";
import { getRelay } from "@/lib/server/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idOf(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

/** POST (operator): call this person up; the mirror announces them and they leave the queue. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isAdmin(adminKeyFrom(request))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const id = idOf((await params).id);
  const called = id === null ? null : await getRelay().callChallenge(id);
  return called ? NextResponse.json({ called }) : NextResponse.json({ error: "NOT IN QUEUE" }, { status: 404 });
}

/** DELETE (operator): drop this person from the queue. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isAdmin(adminKeyFrom(request))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const id = idOf((await params).id);
  return id !== null && (await getRelay().removeChallenge(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "NOT IN QUEUE" }, { status: 404 });
}
