import { NextResponse } from "next/server";
import { getAnalysisProvider } from "@/lib/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pre-flight: the kiosk pings this on boot and during idle gaps so the model
 * provider connection is warm before the first battle of the day (no tokens
 * are spent: a model metadata request). Never fails loudly.
 */
export async function POST(): Promise<NextResponse> {
  const provider = getAnalysisProvider();
  const started = Date.now();
  try {
    await provider.warmup();
    return NextResponse.json({ ok: true, provider: provider.name, ms: Date.now() - started });
  } catch (err) {
    console.warn("[aura] warm-up failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, provider: provider.name, ms: Date.now() - started });
  }
}
