import { cleanCommentary, parseSquadCommentary } from "@/lib/battle/commentary";
import { playerLabel } from "@/lib/battle/score";
import { shareCaption, type CardKind } from "@/lib/share/caption";
import type { BattleResult, ScanResult } from "./types";

/**
 * What gets saved with each card (and so shows in the feed): pure builders,
 * shared by the kiosk claim flow and tests.
 */
export interface CardMeta {
  id: string;
  kind: CardKind;
  scanId: string | null;
  battleId: string | null;
  parentId: string | null;
  slot: number | null;
  headline: number;
  target: number;
  title: string;
  verdict: string | null;
  caption: string;
  name: string | null;
  handle: string | null;
}

export function scanCardMeta(id: string, scan: ScanResult, name: string | null, handle: string | null): CardMeta {
  return {
    id,
    kind: "scan",
    scanId: scan.id,
    battleId: null,
    parentId: null,
    slot: null,
    headline: scan.aura,
    target: scan.aura,
    title: (name ?? scan.analysis.nickname).toUpperCase(),
    verdict: scan.analysis.verdict,
    caption: shareCaption({ kind: "scan", target: scan.aura, seed: id }),
    name,
    handle,
  };
}

export function battleCardMeta(id: string, battle: BattleResult): CardMeta {
  const squad = battle.mode === "squad" && battle.squad;
  const target = squad ? battle.squad!.score : Math.max(...battle.players.map((p) => p.total));
  const commentary = battle.commentary ? cleanCommentary(battle.commentary) : null;
  const verdict = squad ? [battle.squad!.vibe.toUpperCase(), commentary ? parseSquadCommentary(commentary).opener : null].filter(Boolean).join(" · ") : commentary;
  return {
    id,
    kind: squad ? "squad" : "battle",
    scanId: null,
    battleId: battle.id,
    parentId: null,
    slot: null,
    headline: squad ? battle.squad!.score : battle.gap,
    target,
    title: squad ? `SQUAD OF ${battle.players.length}` : battle.players.map((p) => p.nickname.toUpperCase()).join(" VS "),
    verdict: verdict || null,
    caption: shareCaption({ kind: squad ? "squad" : "battle", target, gap: battle.winnerSlot === null ? 0 : battle.gap, vibe: battle.squad?.vibe, seed: id }),
    name: null,
    handle: null,
  };
}

/** A squad member's own card ("from Squad Battle"), under the squad card. */
export function squadMemberMeta(id: string, parentId: string, battle: BattleResult, slot: number): CardMeta {
  const p = battle.players.find((x) => x.slot === slot)!;
  const line = battle.commentary ? parseSquadCommentary(cleanCommentary(battle.commentary)).lines[slot] : null;
  return {
    id,
    kind: "scan",
    scanId: p.scanId,
    battleId: battle.id,
    parentId,
    slot,
    headline: p.total,
    target: p.total,
    title: `${playerLabel(slot)} · ${p.nickname.toUpperCase()}`,
    verdict: line ?? p.scan.analysis.verdict,
    caption: shareCaption({ kind: "scan", target: p.total, seed: id }),
    name: null,
    handle: null,
  };
}

export function metaForm(meta: CardMeta, png: Blob): FormData {
  const form = new FormData();
  form.append("image", png, "card.png");
  const fields: [string, string | number | null][] = [
    ["id", meta.id],
    ["kind", meta.kind],
    ["scanId", meta.scanId],
    ["battleId", meta.battleId],
    ["parentId", meta.parentId],
    ["slot", meta.slot],
    ["headline", meta.headline],
    ["target", meta.target],
    ["title", meta.title],
    ["verdict", meta.verdict],
    ["caption", meta.caption],
    ["name", meta.name],
    ["handle", meta.handle],
  ];
  for (const [k, v] of fields) if (v !== null && v !== "") form.append(k, String(v));
  return form;
}
