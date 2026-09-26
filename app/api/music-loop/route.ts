import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { DEFAULT_LOOP, parseLoop } from "@/lib/kiosk/musicLoop";
import { adminKeyFrom, isAdmin } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saved next to the (gitignored) tracks on the kiosk laptop; gitignored too. */
const FILE = path.join(process.cwd(), "public", "audio", "loop.json");

/** GET: where the kiosk music loops (the default until someone saves one). */
export async function GET(): Promise<NextResponse> {
  try {
    const saved = parseLoop(JSON.parse(await readFile(FILE, "utf8")));
    if (saved) return NextResponse.json({ loop: saved, saved: true });
  } catch {
    // nothing saved yet
  }
  return NextResponse.json({ loop: DEFAULT_LOOP, saved: false });
}

/** POST { start, end } with x-admin-key: save the loop points (from /music-lab). */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAdmin(adminKeyFrom(request))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const loop = parseLoop(await request.json().catch(() => null));
  if (!loop) return NextResponse.json({ error: "BAD LOOP: START MUST BE BEFORE END, AT LEAST 1 S APART." }, { status: 400 });
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, `${JSON.stringify(loop, null, 2)}\n`);
  } catch (err) {
    console.error("[aura] music loop save failed", err);
    return NextResponse.json({ error: "COULD NOT SAVE." }, { status: 500 });
  }
  return NextResponse.json({ loop, saved: true });
}
