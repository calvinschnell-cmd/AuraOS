/**
 * GUT REACTIONS — EDIT ME.
 * The commentator's one-breath reaction to a fit in the squad countdown: not
 * a review, just what comes out of his mouth. The LLM writes its own in this
 * voice (lib/battle/commentary.ts); these are the MOCK MODE lines and the
 * fallback when a line is missing. Tiers go by the player's total aura.
 * Clothes only, never the person; one swear max, no slurs.
 */
export const GUT_REACTIONS = {
  /** 300k+ */
  legendary: ["Holy fit. I'm blessed to see this.", "Somebody frame this shit.", "I need a minute. That's unreal.", "Fly as hell. No notes."],
  /** 100k+ */
  great: ["Yeah, that's hard.", "Clean as hell.", "Okay, you ate.", "Now that's a real fit."],
  /** 0 and up */
  mid: ["Calm little fit.", "It's giving... fine.", "Solid. Quiet. Fine.", "Respectable. Barely."],
  /** down to -150k */
  low: ["Rough fit, bro.", "That's a no from me.", "Mid, and that's being nice.", "Did you get dressed with the lights off?"],
  /** below -150k */
  awful: ["Dogshit fit.", "This fit is ass.", "Straight to jail.", "Burn it. All of it."],
} as const;

/** Called out first when the house rules caught them (lib/scoring.ts fitPenalties labels). */
export const CRIME_REACTIONS: { match: RegExp; lines: readonly string[] }[] = [
  { match: /SHORTS/i, lines: ["Shorts? At a battle?", "Shorts. Bold. Wrong, but bold."] },
  { match: /CLASH/i, lines: ["Those colors are fighting each other.", "That colorway is a crime scene."] },
  { match: /DON'T GO/i, lines: ["None of this goes together.", "Every piece is from a different fit."] },
];

export type GutTier = keyof typeof GUT_REACTIONS;

export function gutTier(total: number): GutTier {
  if (total >= 300_000) return "legendary";
  if (total >= 100_000) return "great";
  if (total >= 0) return "mid";
  if (total >= -150_000) return "low";
  return "awful";
}

/** A gut reaction for a total (and its penalty labels), picked with `rand` in [0, 1). */
export function gutReaction(total: number, modifierLabels: readonly string[], rand: number): string {
  const tier = gutTier(total);
  const pool = GUT_REACTIONS[tier];
  const line = pool[Math.floor(rand * pool.length) % pool.length];
  if (tier === "legendary" || tier === "great") return line;
  const crime = CRIME_REACTIONS.find((c) => modifierLabels.some((l) => c.match.test(l)));
  if (!crime) return line;
  return `${crime.lines[Math.floor(rand * crime.lines.length) % crime.lines.length]} ${line}`;
}
