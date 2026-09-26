import { EVENT_NAME } from "@/lib/config";
import { hashString } from "@/lib/prng";
import { formatAura } from "@/lib/scoring";

/**
 * Share mechanics (spec section 5): every card carries a "beat this score"
 * number, and comes with a ready-to-paste caption so posting takes zero typing.
 * Rule-based on purpose (cheap, instant, never off-brand).
 */

export type CardKind = "scan" | "battle" | "squad";

export interface CaptionInput {
  kind: CardKind;
  /** The number to beat: solo aura, the battle winner's total, or the squad score. */
  target: number;
  /** Battles: winning margin. */
  gap?: number;
  /** Squads: vibe archetype. */
  vibe?: string;
  /** Seeds the variant (card id). */
  seed: string;
}

const EVENT = EVENT_NAME.replace(/(\w)(\w*)/g, (_, a: string, b: string) => a + b.toLowerCase()).replace("Hackgt", "HackGT");

const SOLO = [
  (t: string) => `Just got roasted ${t} aura points at ${EVENT} 🔥 beat me if you dare`,
  (t: string) => `The mirror said ${t} aura. ${EVENT} come get your number 👀`,
  (t: string) => `${t} aura, officially measured at ${EVENT}. Your move 🔥`,
];
const BATTLE = [
  (t: string, g: string) => `Won an Aura Battle by ${g} at ${EVENT} ⚔️ ${t} to beat, think you can?`,
  (t: string, g: string) => `Aura Battle W by ${g} points at ${EVENT} 🔥 run it back if you dare`,
];
const TIE = [(t: string) => `Aura Battle ended in a dead tie at ${t} ⚔️ ${EVENT} needs a rematch`];
const SQUAD = [
  (t: string, v: string) => `Our squad pulled ${t} group aura at ${EVENT} (${v}) 🔥 bring your crew`,
  (t: string, v: string) => `Squad Aura Battle: ${t} aura, certified ${v} ⚔️ ${EVENT}`,
];

export function shareCaption(input: CaptionInput): string {
  const h = hashString(input.seed);
  const t = formatAura(input.target);
  if (input.kind === "scan") return SOLO[h % SOLO.length](t);
  if (input.kind === "squad") return SQUAD[h % SQUAD.length](t, input.vibe ?? "chaotic energy");
  if (!input.gap) return TIE[0](t);
  return BATTLE[h % BATTLE.length](t, formatAura(input.gap));
}

/** The CTA line baked into every card: "THINK YOU CAN BEAT 847,203?" */
export function beatThisLine(target: number): string {
  return `THINK YOU CAN BEAT ${formatAura(target)}?`;
}
