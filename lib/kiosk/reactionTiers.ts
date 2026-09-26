/**
 * The crowd's reaction to a solo aura (played right after the voice says the
 * number): the same bands the announcer's callouts use (auraCallout).
 */
export const REACTIONS = ["woo", "cheer", "crickets", "aww", "flop"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const isReaction = (v: unknown): v is Reaction => typeof v === "string" && (REACTIONS as readonly string[]).includes(v);

export function reactionFor(aura: number): Reaction {
  if (aura >= 500_000) return "woo";
  if (aura >= 150_000) return "cheer";
  if (aura > -150_000) return "crickets";
  if (aura > -500_000) return "aww";
  return "flop";
}

/** What each reaction sounds like, for the sound-effect generator (and the lab's labels). */
export const REACTION_SFX: Record<Reaction, { label: string; prompt: string; seconds: number }> = {
  woo: { label: "WOOOOO", prompt: "Excited crowd screaming WOOOOO and cheering wildly, hype, short", seconds: 3 },
  cheer: { label: "LITTLE CHEER", prompt: "Small group of people giving a short happy cheer and applause", seconds: 2.5 },
  crickets: { label: "CRICKETS", prompt: "Crickets chirping in an awkward silence, quiet night, no other sounds", seconds: 3 },
  aww: { label: "AWWWW", prompt: "Small audience going awwww in sympathetic disappointment, short", seconds: 2.5 },
  flop: { label: "FAIL (FART)", prompt: "Long wet cartoon fart sound effect, comedic, short", seconds: 1.8 },
};
