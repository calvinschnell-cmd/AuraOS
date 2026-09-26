import { NextResponse } from "next/server";
import { publicBaseUrl } from "@/lib/server/baseUrl";
import { badgesEnabled, explorerTxUrl, mintBadge } from "@/lib/server/solana";
import { getScanStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { cardId } -> mint that card's Solana badge (compressed NFT, devnet),
 * once. Called by the kiosk after the card is already saved: a failure here
 * never touches the card. 404 when badges are off.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!badgesEnabled()) return NextResponse.json({ error: "BADGES OFF." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { cardId?: unknown } | null;
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  const store = getScanStore();
  try {
    const card = cardId ? await store.getCard(cardId) : null;
    if (!card) return NextResponse.json({ error: "UNKNOWN CARD." }, { status: 404 });
    if (card.nftSignature) return NextResponse.json({ signature: card.nftSignature, explorerUrl: explorerTxUrl(card.nftSignature), cached: true });
    const scan = card.scanId ? await store.getById(card.scanId) : null;
    const t0 = Date.now();
    const signature = await mintBadge({ cardId, aura: scan?.aura ?? 0, baseUrl: publicBaseUrl(request) });
    await store.setCardNft(cardId, signature);
    console.info(`[aura] badge minted for card ${cardId} in ${Date.now() - t0}ms: ${signature}`);
    return NextResponse.json({ signature, explorerUrl: explorerTxUrl(signature), cached: false });
  } catch (err) {
    console.warn("[aura] badge mint failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "BADGE MINT FAILED." }, { status: 502 });
  }
}
