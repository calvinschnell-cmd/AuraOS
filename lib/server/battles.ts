import { randomUUID } from "node:crypto";
import { COMMENTARY_SYSTEM, DUEL_MAX_TOKENS, cleanCommentary, duelPrompt, mockDuelCommentary, mockSquadCommentary, squadMaxTokens, squadPrompt, type CommentaryPlayer } from "@/lib/battle/commentary";
import { computeOutcome, type BattleEntrant } from "@/lib/battle/score";
import { capacityFor, SQUAD_MIN, type BattleMode, type BattleRecord } from "@/lib/battle/types";
import { getAnalysisProvider } from "@/lib/analyze";
import { poseForCapture } from "./pose";
import { getScanStore, recordUsage, standoutItem, type StoredScan } from "./store";

/**
 * Battle orchestration on the server: turn scored captures into a stored
 * battle (rule-based, instant), then stream the head-to-head commentary.
 */

export interface BattleEntryInput {
  slot: number;
  scanId: string;
  /** Live landmarks captured with the photo (null: none seen). */
  pose: unknown;
}

export class BattleInputError extends Error {}

export function parseBattleRequest(body: unknown): { mode: BattleMode; players: BattleEntryInput[] } {
  const b = body as { mode?: unknown; players?: unknown } | null;
  const mode = b?.mode === "squad" ? "squad" : b?.mode === "duel" ? "duel" : null;
  if (!mode || !Array.isArray(b?.players)) throw new BattleInputError("BAD BATTLE REQUEST.");
  const players = (b.players as unknown[]).map((p) => {
    const e = p as Partial<BattleEntryInput> | null;
    if (!e || typeof e.slot !== "number" || !Number.isInteger(e.slot) || typeof e.scanId !== "string") throw new BattleInputError("BAD PLAYER.");
    return { slot: e.slot, scanId: e.scanId, pose: e.pose ?? null };
  });
  const cap = capacityFor(mode);
  const slots = new Set(players.map((p) => p.slot));
  if (players.length < SQUAD_MIN || players.length > cap || slots.size !== players.length || players.some((p) => p.slot < 0 || p.slot >= cap)) {
    throw new BattleInputError(mode === "duel" ? "A DUEL NEEDS EXACTLY TWO PLAYERS." : "A SQUAD NEEDS 2 TO 5 PLAYERS.");
  }
  if (mode === "duel" && players.length !== 2) throw new BattleInputError("A DUEL NEEDS EXACTLY TWO PLAYERS.");
  return { mode, players };
}

function entrant(input: BattleEntryInput, scan: StoredScan): BattleEntrant {
  return {
    slot: input.slot,
    scanId: scan.id,
    nickname: scan.analysis.nickname,
    fitAura: scan.aura,
    pose: poseForCapture(input.pose, scan.imageHash),
    topStyle: scan.analysis.style_mix[0]?.style ?? null,
    cohesion: scan.breakdown.cohesionScore,
  };
}

/** Score + store a battle from already-analyzed captures. */
export async function createBattle(mode: BattleMode, players: BattleEntryInput[]): Promise<BattleRecord> {
  const store = getScanStore();
  const scans = await Promise.all(players.map((p) => store.getById(p.scanId)));
  const missing = scans.findIndex((s) => !s);
  if (missing >= 0) throw new BattleInputError(`UNKNOWN SCAN FOR PLAYER ${players[missing].slot + 1}.`);
  const outcome = computeOutcome(
    mode,
    players.map((p, i) => entrant(p, scans[i]!)),
  );
  const battle: BattleRecord = { ...outcome, id: randomUUID(), commentary: null, createdAt: new Date().toISOString() };
  await store.insertBattle(battle).catch((err) => console.error("[aura] battle insert failed", err));
  return battle;
}

export async function commentaryPlayers(battle: BattleRecord): Promise<CommentaryPlayer[]> {
  const store = getScanStore();
  const scans = await Promise.all(battle.players.map((p) => store.getById(p.scanId)));
  return battle.players.map((p, i) => {
    const s = scans[i];
    const a = s?.analysis;
    return {
      ...p,
      styles: a ? a.style_mix.map((m) => `${m.style} ${Math.round(m.percent)}%`).join(", ") : "unknown style",
      standoutItem: a ? standoutItem(a) : null,
      cohesion: s?.breakdown.cohesionScore ?? 50,
      uniqueness: s?.breakdown.avgUniqueness ?? 50,
      fitValue: s?.breakdown.fitValue ?? 0,
      verdict: a?.verdict ?? "",
      // The breakdown's list: the judge's callouts plus the house-rule penalties (shorts, clashing colors...).
      modifiers: (s?.breakdown.modifiers ?? a?.modifiers ?? []).map((m) => `${m.label} (${m.tier})`),
    };
  });
}

export function mockCommentary(battle: BattleRecord, players: CommentaryPlayer[]): string {
  return battle.mode === "squad" ? mockSquadCommentary(battle, players) : mockDuelCommentary(battle, players);
}

/** Word-by-word stream of a finished text (mock mode, cached commentary). */
async function* replay(text: string, delayMs: number): AsyncIterable<string> {
  const words = text.split(/(\s+)/);
  for (const w of words) {
    if (!w) continue;
    yield w;
    if (delayMs > 0 && /\S/.test(w)) await new Promise((r) => setTimeout(r, delayMs));
  }
}

/**
 * The commentary as a text stream: the stored text if a previous request
 * finished it, else one text-only LLM call (hard token cap) streamed as it
 * generates; MOCK MODE and any LLM failure stream the rule-based commentary.
 * The final text is saved on the battle.
 */
export async function commentaryStream(battle: BattleRecord): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  if (battle.commentary) {
    const cached = battle.commentary;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(cached));
        controller.close();
      },
    });
  }
  const players = await commentaryPlayers(battle);
  const provider = getAnalysisProvider();
  const prompt = battle.mode === "squad" ? squadPrompt(battle, players) : duelPrompt(battle, players);
  const maxTokens = battle.mode === "squad" ? squadMaxTokens(players.length) : DUEL_MAX_TOKENS;
  const store = getScanStore();

  return new ReadableStream({
    async start(controller) {
      let text = "";
      const push = (chunk: string) => {
        text += chunk;
        controller.enqueue(encoder.encode(chunk));
      };
      try {
        if (!provider.streamText) throw new Error("mock");
        for await (const chunk of provider.streamText(COMMENTARY_SYSTEM, prompt, maxTokens, recordUsage)) push(chunk);
        if (!text.trim()) throw new Error("empty commentary");
      } catch (err) {
        if (provider.streamText) console.warn("[aura] commentary failed, using the rule-based line", err);
        if (!text.trim()) for await (const chunk of replay(mockCommentary(battle, players), 45)) push(chunk);
      }
      controller.close();
      await store.setBattleCommentary(battle.id, cleanCommentary(text)).catch((err) => console.error("[aura] commentary save failed", err));
    },
  });
}
