import { NextResponse } from "next/server";
import { usageSnapshot } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's call count, token totals and estimated spend (for the D debug overlay). */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await usageSnapshot());
}
