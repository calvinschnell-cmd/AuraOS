import { randomBytes, randomUUID } from "node:crypto";
import { cleanCommentary } from "@/lib/battle/commentary";
import type { BattleRecord } from "@/lib/battle/types";
import { newDuelId, type Duel, type DuelAccept, type DuelBattleView, type DuelPlayerView, type DuelView } from "@/lib/duels/types";
import { shareCaption } from "@/lib/share/caption";
import { commentaryStream, createBattle } from "./battles";
import { renderDuelImage } from "./duelImage";
import { getScanStore, type StoredCard } from "./store";

/**
 * Challenge by link: the async variant of a kiosk duel. The mirror scores
 * both players at once; here the challenger's scan is stored and every friend
 * who accepts gets a battle against it later, built from the two stored
 * scans with the same code (createBattle: fit + pose totals, winner, gap;
 * commentaryStream: the head-to-head roast). Neither has live pose landmarks,
 * so both get the neutral pose score and the fit decides. The kiosk battle
 * flow is untouched.
 */

export class DuelError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The challenger's own solo card, on the phone that made it (or claimed it). */
export async function createDuel(cardId: string, deviceId: string): Promise<Duel> {
  const store = getScanStore();
  const card = await store.getCard(cardId);
  if (!card || card.hidden) throw new DuelError("CARD NOT FOUND.", 404);
  if (card.kind !== "scan" || !card.scanId || card.battleId || card.parentId) throw new DuelError("ONLY A SOLO SCAN CAN BE A CHALLENGE.", 400);
  if (card.deviceId !== deviceId) throw new DuelError("ONLY THE PHONE THAT MADE THIS CARD CAN SEND THE CHALLENGE.", 403);
  const existing = await store.duelForCard(card.id);
  if (existing) return existing;
  return store.createDuel({ id: newDuelId((n) => randomBytes(n)), cardId: card.id, scanId: card.scanId, deviceId });
}

/** Read a finished commentary stream (the LLM line, or the rule-based one). */
async function commentaryText(battle: BattleRecord): Promise<string> {
  const reader = (await commentaryStream(battle)).getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return cleanCommentary(text);
}

async function playerName(card: StoredCard): Promise<{ name: string; handle: string | null }> {
  const entry = card.scanId ? await getScanStore().entryForScan(card.scanId).catch(() => null) : null;
  return { name: (entry?.nickname ?? card.title).toUpperCase(), handle: entry?.handle ?? null };
}

/**
 * A friend accepts with the card their phone just made: battle the two stored
 * scans, write the commentary, post a "challenge" card to the feed (both cards
 * side by side), and record the accept. Accepting twice with the same card
 * returns the first result.
 */
export async function acceptDuel(duelId: string, cardId: string, deviceId: string): Promise<DuelAccept> {
  const store = getScanStore();
  const duel = await store.getDuel(duelId);
  if (!duel) throw new DuelError("THIS CHALLENGE DOESN'T EXIST.", 404);
  if (duel.deviceId === deviceId) throw new DuelError("YOU CAN'T ACCEPT YOUR OWN CHALLENGE. SEND IT TO A FRIEND.", 409);
  const [challengerCard, friendCard] = await Promise.all([store.getCard(duel.cardId), store.getCard(cardId)]);
  if (!challengerCard || challengerCard.hidden) throw new DuelError("THIS CHALLENGE WAS TAKEN DOWN.", 410);
  if (!friendCard || friendCard.hidden || friendCard.kind !== "scan" || !friendCard.scanId || friendCard.battleId) throw new DuelError("SCAN YOUR FIT FIRST.", 400);
  if (friendCard.deviceId !== deviceId) throw new DuelError("THAT CARD ISN'T FROM THIS PHONE.", 403);
  if (friendCard.scanId === duel.scanId) throw new DuelError("SAME PHOTO AS THE CHALLENGER. SCAN YOUR OWN FIT.", 409);
  const previous = (await store.duelAccepts(duel.id)).find((a) => a.cardId === friendCard.id);
  if (previous) return previous;

  const [challenger, friend] = await Promise.all([playerName(challengerCard), playerName(friendCard)]);
  const battle = await createBattle("duel", [
    { slot: 0, scanId: duel.scanId, pose: null },
    { slot: 1, scanId: friendCard.scanId, pose: null },
  ]);
  // Their AURA IDs on the battle rows: rivalries and streaks count challenge battles too.
  if (challenger.handle) await store.claimBattleSlot(battle.id, 0, challenger.handle).catch(() => false);
  if (friend.handle) await store.claimBattleSlot(battle.id, 1, friend.handle).catch(() => false);
  const commentary = await commentaryText(battle).catch(() => "");

  const feedCardId = randomUUID();
  const [p0, p1] = battle.players;
  const target = Math.max(p0.total, p1.total);
  try {
    const png = await renderDuelImage({
      challenger: { name: challenger.name, imageUrl: challengerCard.imageUrl, total: p0.total, winner: battle.winnerSlot === 0 },
      friend: { name: friend.name, imageUrl: friendCard.imageUrl, total: p1.total, winner: battle.winnerSlot === 1 },
      gap: battle.gap,
    });
    await store.insertCard(
      {
        id: feedCardId,
        scanId: null,
        battleId: battle.id,
        kind: "challenge",
        headline: battle.gap,
        target,
        title: `${challenger.name} VS ${friend.name}`.slice(0, 80),
        verdict: commentary || null,
        caption: shareCaption({ kind: "battle", target, gap: battle.winnerSlot === null ? 0 : battle.gap, seed: feedCardId }),
        parentId: null,
        slot: null,
        source: "mobile",
        deviceId,
      },
      png,
    );
  } catch (err) {
    // The battle still counts; it just has no feed post.
    console.error("[aura] challenge feed card failed", err);
    return store.addDuelAccept({ id: randomUUID(), duelId: duel.id, cardId: friendCard.id, scanId: friendCard.scanId, battleId: battle.id, feedCardId: null, deviceId });
  }
  return store.addDuelAccept({ id: randomUUID(), duelId: duel.id, cardId: friendCard.id, scanId: friendCard.scanId, battleId: battle.id, feedCardId, deviceId });
}

async function playerView(card: StoredCard, aura: number | null): Promise<DuelPlayerView> {
  const { name, handle } = await playerName(card);
  return { name, handle, cardId: card.id, imageUrl: card.imageUrl, source: card.source, aura };
}

/**
 * The challenge as one viewer sees it. The challenger's score stays hidden
 * until this phone has scanned (accepted); results are only shown to the
 * challenger and to friends who took it on.
 */
export async function duelView(duelId: string, deviceId: string | null): Promise<DuelView | null> {
  const store = getScanStore();
  const duel = await store.getDuel(duelId);
  if (!duel) return null;
  const challengerCard = await store.getCard(duel.cardId);
  if (!challengerCard || challengerCard.hidden) return null;
  const accepts = await store.duelAccepts(duel.id);
  const role: DuelView["role"] = deviceId && duel.deviceId === deviceId ? "challenger" : deviceId && accepts.some((a) => a.deviceId === deviceId) ? "friend" : "visitor";
  const scan = await store.getById(duel.scanId);
  const challenger = await playerView(challengerCard, role === "visitor" ? null : (scan?.aura ?? challengerCard.target));

  const battles: DuelBattleView[] = [];
  if (role !== "visitor") {
    for (const a of accepts) {
      const [battle, card] = await Promise.all([store.getBattle(a.battleId), store.getCard(a.cardId)]);
      if (!battle || !card || card.hidden) continue;
      const [p0, p1] = battle.players;
      battles.push({
        acceptId: a.id,
        createdAt: a.createdAt,
        friend: await playerView(card, p1.fitAura),
        challengerTotal: p0.total,
        friendTotal: p1.total,
        winner: battle.winnerSlot === 0 ? "challenger" : battle.winnerSlot === 1 ? "friend" : "tie",
        gap: battle.gap,
        commentary: battle.commentary,
        battleId: battle.id,
        mine: a.deviceId === deviceId,
      });
    }
  }
  return { id: duel.id, challenger, role, count: accepts.length, battles };
}
