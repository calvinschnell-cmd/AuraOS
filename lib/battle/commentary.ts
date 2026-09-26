import { gutReaction } from "@/lib/copy/reactions";
import { hashString } from "@/lib/prng";
import { formatAura } from "@/lib/scoring";
import { ARCHETYPES, describePose } from "@/lib/pose/score";
import type { BattleOutcome, BattlePlayerScore } from "./types";

/**
 * Head-to-head commentary. One text-only LLM call per battle, built from all
 * the score breakdowns together (never the images again, never one prompt per
 * player): text completions are fast, and this streams while the result
 * reveal plays. The mock versions below read the same numbers, so MOCK MODE
 * demos real-sounding commentary with zero keys.
 */

/** The facts about one player's fit the commentator may use (no images, nothing about the person). */
export interface CommentaryPlayer extends BattlePlayerScore {
  styles: string;
  standoutItem: string | null;
  cohesion: number;
  uniqueness: number;
  fitValue: number;
  verdict: string;
  modifiers: string[];
}

/** Hard caps so generation time can never blow the budget, beyond asking for brevity. */
export const DUEL_MAX_TOKENS = 90;
export function squadMaxTokens(players: number): number {
  return 60 + 30 * players;
}

export const COMMENTARY_SYSTEM = `You are the AURA OS battle announcer: a hype-man calling outfit battles like a friend on the mic, not a fashion critic. Gut reactions, not reviews.
Hard rules:
- Judge OUTFITS and POSES only. Never comment on anyone's face, body, weight, height, skin, hair, age, race, ethnicity, gender, or attractiveness.
- Roast the clothes and the pose, never the person. Casual swearing is fine in moderation (at most one per line, for emphasis, like "dogshit fit" or "somebody frame this shit"); never slurs, nothing sexual.
- Shorts, clashing colorways and pieces that do not go together are fit crimes: call them out bluntly.
- Use only facts from the score sheet. Plain text only: no emojis, no hashtags, no quotation marks, no markdown.`;

const n = (p: BattlePlayerScore) => `Player ${p.slot + 1}`;

function sheetLine(p: CommentaryPlayer): string {
  const bits = [
    `fit "${p.nickname}": fit aura ${formatAura(p.fitAura, true)} (${p.styles})`,
    p.standoutItem ? `standout item: ${p.standoutItem}` : null,
    `cohesion ${p.cohesion}, uniqueness ${Math.round(p.uniqueness)}, fit value $${p.fitValue}`,
    p.modifiers.length ? `callouts: ${p.modifiers.slice(0, 3).join("; ")}` : null,
    `pose: ${describePose(p.pose)} (${formatAura(p.poseAura, true)} aura)`,
    `TOTAL ${formatAura(p.total, true)}`,
  ];
  return `${n(p)} - ${bits.filter(Boolean).join("; ")}.`;
}

function decisionLine(outcome: BattleOutcome, players: CommentaryPlayer[]): string {
  if (outcome.winnerSlot === null) return "Result: a dead tie on total aura.";
  const w = players.find((p) => p.slot === outcome.winnerSlot)!;
  const runnerUp = [...players].filter((p) => p !== w).sort((a, b) => b.total - a.total)[0];
  const base = `Result: ${n(w)} wins by ${formatAura(outcome.gap)} aura.`;
  if (outcome.decidedBy === "pose") return `${base} The POSE decided it: ${n(runnerUp)} had the stronger fit, but ${n(w)}'s pose won the battle.`;
  if (outcome.decidedBy === "fit") return `${base} The FIT decided it: ${n(runnerUp)} had the better pose, but ${n(w)}'s outfit won.`;
  return `${base} ${n(w)} won on both the fit and the pose.`;
}

/** How to frame the verdict, so the model never claims the pose decided a battle it did not. */
function duelFraming(outcome: BattleOutcome): string {
  if (outcome.decidedBy === "pose") return `The pose was the deciding factor: say so (e.g. "Player 2's fit was stronger, but that pose sealed it").`;
  if (outcome.decidedBy === "fit") return "The outfit was the deciding factor: say the better pose was not enough.";
  if (outcome.decidedBy === "both") return "The winner won on BOTH fit and pose: do not say the pose alone decided it; give the loser one consolation roast.";
  return "It is a tie: say so.";
}

export function duelPrompt(outcome: BattleOutcome, players: CommentaryPlayer[]): string {
  return `Two players just had an Aura Battle. Score sheet:
${players.map(sheetLine).join("\n")}
${decisionLine(outcome, players)}

Compare these two directly: call out one specific thing about each player's outfit or pose, then end with a verdict. ${duelFraming(outcome)} Under 40 words total, like a hype friend on the mic, gut reactions not a review.`;
}

export function squadPrompt(outcome: BattleOutcome, players: CommentaryPlayer[]): string {
  const s = outcome.squad!;
  return `A squad of ${players.length} just had a Squad Aura Battle. The squad's vibe archetype: "${s.vibe}". Group aura ${formatAura(s.score, true)} (squad synergy ${s.synergy}/100).
${players.map(sheetLine).join("\n")}
${decisionLine(outcome, players)}

Final standings, best first: ${[...players].sort((a, b) => a.place - b.place).map((p) => `${n(p)} (place ${p.place})`).join(", ")}.

The host reads the results as a countdown from last place to first and announces the places himself. Write: first ONE sentence (max 20 words) riffing on the squad's vibe archetype, then exactly one line per player, each starting "P1:", "P2:" and so on. Each player line is a 2 to 8 word gut reaction to that player's fit, matched to their total and place, not a thought-out review. Top scores get stunned hype, middle scores get a shrug, the bottom gets flamed. The tone, for reference only (say it your own way, do not copy these): "Holy fit, I'm blessed to see this." / "Calm little fit." / "Dogshit fit." Call out shorts, clashing colors or pieces that do not go together. Never mention places or numbers.`;
}

// ---------------------------------------------------------------- mock (MOCK MODE and LLM fallback)

function thing(p: CommentaryPlayer): string {
  return (p.standoutItem ?? p.nickname).toLowerCase();
}

function poseBit(p: CommentaryPlayer): string {
  return p.pose.archetype === "unknown" ? "whatever that pose was" : ARCHETYPES[p.pose.archetype].callout;
}

export function mockDuelCommentary(outcome: BattleOutcome, players: CommentaryPlayer[]): string {
  const [a, b] = [...players].sort((x, y) => x.slot - y.slot);
  const fitWinner = a.fitAura >= b.fitAura ? a : b;
  const poseWinner = a.pose.score >= b.pose.score ? a : b;
  const fitLoser = fitWinner === a ? b : a;
  const first = `Drip check goes to ${n(fitWinner)}'s ${thing(fitWinner)}`;
  const second =
    poseWinner === fitWinner
      ? `and even ${poseBit(fitLoser)} could not save ${n(fitLoser)}'s ${thing(fitLoser)}.`
      : `but ${n(poseWinner)} hit ${poseBit(poseWinner)} like the camera owed them money.`;
  if (outcome.winnerSlot === null) return `${first}, ${second} Dead even. The aura is shared.`;
  const w = players.find((p) => p.slot === outcome.winnerSlot)!;
  const loser = players.find((p) => p !== w)!;
  const verdict =
    outcome.decidedBy === "pose"
      ? `${n(loser)}'s fit was stronger, but that pose sealed it. ${n(w)} takes it.`
      : outcome.decidedBy === "fit"
        ? `${n(w)} takes it on pure drip.`
        : `${n(w)} takes it, and it was not close.`;
  return `${first}, ${second} ${verdict}`;
}

export function mockSquadCommentary(outcome: BattleOutcome, players: CommentaryPlayer[]): string {
  const vibe = outcome.squad?.vibe ?? "multiverse crossover episode";
  // Gut reactions, same voice as the LLM's (deterministic per scan, so a replay reads the same).
  const lines = players.map((p) => `P${p.slot + 1}: ${gutReaction(p.total, p.modifiers, (hashString(p.scanId) % 1000) / 1000)}`);
  return [`Certified ${vibe}, and the group chat knows it.`, ...lines].join("\n");
}

/** Squad commentary split into its opening line and per-player lines ("P2: ..."). */
export function parseSquadCommentary(text: string): { opener: string; lines: Record<number, string> } {
  const lines: Record<number, string> = {};
  const rest: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^P(?:layer)?\s*(\d)\s*[:\-.]\s*(.+)$/i.exec(line);
    if (m) lines[Number(m[1]) - 1] = m[2];
    else rest.push(line);
  }
  return { opener: rest.join(" "), lines };
}

/** Streamed text is shown raw; this tidies the final version (quotes, stray markdown). */
export function cleanCommentary(text: string): string {
  return text
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
