import { NextResponse } from "next/server";
import { EVENT_NAME } from "@/lib/config";
import { formatAura, judgeName } from "@/lib/scoring";
import { publicBaseUrl } from "@/lib/server/baseUrl";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Metaplex metadata JSON for a badge (the URI stored on-chain), or for the
 * collection (id "collection"). The image is the saved share card.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const base = publicBaseUrl(request);
  if (id === "collection") {
    return NextResponse.json({
      name: "AURA OS BADGES",
      symbol: "AURA",
      description: `AURA OS badges from ${EVENT_NAME}: one per claimed fit, scored by the AI judges.`,
      image: `${base}/favicon.ico`,
      external_url: `${base}/leaderboard`,
    });
  }

  const store = getScanStore();
  const card = await store.getCard(id).catch(() => null);
  if (!card) return NextResponse.json({ error: "UNKNOWN BADGE." }, { status: 404 });
  const scan = card.scanId ? await store.getById(card.scanId).catch(() => null) : null;
  const entry = card.scanId ? await store.entryForScan(card.scanId).catch(() => null) : null;
  const aura = scan?.aura ?? 0;
  const image = `${base}${card.imageUrl}`;
  const judges = scan?.breakdown.judges ?? [];

  return NextResponse.json({
    name: `AURA ${formatAura(aura, true)}`.slice(0, 32),
    symbol: "AURA",
    description: `${entry?.nickname ?? "A fit"} scored ${formatAura(aura, true)} aura on AURA OS (Aura Battles), ${EVENT_NAME}.`,
    image,
    external_url: `${base}/r/${card.id}`,
    attributes: [
      { trait_type: "Aura", value: aura },
      { trait_type: "Event", value: EVENT_NAME },
      ...(entry?.handle ? [{ trait_type: "Aura ID", value: entry.handle }] : []),
      ...judges.map((j, i) => ({ trait_type: judgeName(i), value: formatAura(j.aura, true) })),
      ...(judges.length >= 2 ? [{ trait_type: "Judges disagree", value: scan?.breakdown.disagree ? "yes" : "no" }] : []),
    ],
    properties: { category: "image", files: [{ uri: image, type: "image/png" }] },
  });
}
