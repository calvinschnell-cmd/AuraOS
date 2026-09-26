import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { CardResponse } from "@/lib/kiosk/types";
import { checkPlayerName, cleanNickname } from "@/lib/profanity";
import type { CardKind } from "@/lib/share/caption";
import { publicBaseUrl } from "@/lib/server/baseUrl";
import { getScanStore, type NewCard } from "@/lib/server/store";
import { isUuid } from "@/lib/server/tigerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PNG_BYTES = 8 * 1024 * 1024;
const KINDS: readonly CardKind[] = ["scan", "battle", "squad"];

const text = (form: FormData, key: string, max: number): string | null => {
  const v = String(form.get(key) ?? "").trim();
  return v ? v.slice(0, max) : null;
};
const int = (form: FormData, key: string): number => {
  const n = Number.parseInt(String(form.get(key) ?? ""), 10);
  return Number.isFinite(n) ? Math.max(-2_000_000_000, Math.min(2_000_000_000, n)) : 0;
};

/**
 * POST multipart { image: rendered card PNG, id, kind, headline, target,
 * title, verdict?, caption?, scanId? | battleId?, parentId?, slot?, name?, handle? }.
 *
 * Saves the card (only the rendered, face-blurred PNG) and that is also the
 * public feed post: the card and the feed are the same event. The id comes
 * from the kiosk so the QR baked into the card already points at /r/[id].
 * Leaderboard: a solo scan joins under the typed name (or its nickname); a
 * battle or squad card adds every player's scan under its nickname.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "EXPECTED MULTIPART FORM DATA." }, { status: 400 });
  }
  const file = form.get("image");
  const scanId = text(form, "scanId", 64);
  const battleId = text(form, "battleId", 64);
  const parentId = text(form, "parentId", 64);
  const kind = String(form.get("kind") ?? "scan") as CardKind;
  const requestedId = text(form, "id", 64);
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_PNG_BYTES || (!scanId && !battleId) || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "BAD REQUEST." }, { status: 400 });
  }
  if ((requestedId && !isUuid(requestedId)) || (parentId && !isUuid(parentId))) return NextResponse.json({ error: "BAD CARD ID." }, { status: 400 });
  const nameCheck = checkPlayerName(String(form.get("name") ?? ""));
  if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.error }, { status: 422 });
  const handleInput = String(form.get("handle") ?? "").trim();
  const store = getScanStore();
  const png = Buffer.from(await file.arrayBuffer());

  try {
    const scan = scanId ? await store.getById(scanId) : null;
    if (scanId && !scan) return NextResponse.json({ error: "UNKNOWN SCAN." }, { status: 404 });
    const battle = battleId ? await store.getBattle(battleId) : null;
    if (battleId && !battle) return NextResponse.json({ error: "UNKNOWN BATTLE." }, { status: 404 });
    const id = requestedId ?? randomUUID();
    if (await store.getCard(id)) return NextResponse.json({ error: "CARD ALREADY SAVED." }, { status: 409 });

    const slotRaw = form.get("slot");
    const slot = slotRaw === null || slotRaw === "" ? null : int(form, "slot");
    const card: NewCard = {
      id,
      scanId,
      battleId,
      kind,
      headline: int(form, "headline"),
      target: int(form, "target"),
      title: text(form, "title", 80) ?? "",
      verdict: text(form, "verdict", 700),
      caption: text(form, "caption", 240),
      parentId,
      slot,
    };
    const saved = await store.insertCard(card, png);

    let entry: CardResponse["entry"] = null;
    if (scan && !parentId && !battle) {
      const existing = await store.entryForScan(scan.id);
      if (existing) {
        entry = existing;
      } else {
        const nickname = nameCheck.name ?? cleanNickname(scan.analysis.nickname);
        // Only a registered handle links the scan to a history (see /api/players).
        const handle = handleInput ? ((await store.getPlayer(handleInput).catch(() => null))?.handle ?? null) : null;
        const entryId = randomUUID();
        await store.insertLeaderboard({ id: entryId, scanId: scan.id, nickname, aura: scan.aura, handle });
        entry = (await store.entryForScan(scan.id)) ?? { id: entryId, scanId: scan.id, nickname, aura: scan.aura, createdAt: new Date().toISOString(), standout: null, handle };
      }
    }
    // A battle card puts every player on the board (their total: fit + pose), once per scan.
    if (battle && !parentId) {
      for (const p of battle.players) {
        if (await store.entryForScan(p.scanId)) continue;
        await store.insertLeaderboard({ id: randomUUID(), scanId: p.scanId, nickname: cleanNickname(p.nickname), aura: p.total, handle: p.handle }).catch((err) => console.warn("[aura] battle entry failed", err));
      }
    }
    const body: CardResponse = { id: saved.id, url: saved.imageUrl, pageUrl: `${publicBaseUrl(request)}/r/${saved.id}`, entry };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[aura] card save failed", err);
    return NextResponse.json({ error: "CARD COULD NOT BE SAVED." }, { status: 503 });
  }
}
