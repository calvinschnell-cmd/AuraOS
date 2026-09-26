import { NextResponse } from "next/server";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent mannequin fit signatures (anti-repeat). */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ signatures: await getScanStore().recentFitSignatures(300) });
  } catch {
    return NextResponse.json({ signatures: [] });
  }
}

/** POST { signature: string[], seed } after a fit locks. */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { signature?: string[]; seed?: string };
  if (!Array.isArray(body.signature) || !body.seed) return NextResponse.json({ error: "BAD REQUEST" }, { status: 400 });
  try {
    await getScanStore().insertFit(body.signature.map(String).slice(0, 12), String(body.seed).slice(0, 64));
  } catch (err) {
    console.warn("[aura] fit insert failed", err);
  }
  return NextResponse.json({ ok: true });
}
