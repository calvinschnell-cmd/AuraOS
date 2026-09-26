import { gutReaction } from "@/lib/copy/reactions";
import { formatAura } from "@/lib/scoring";

/**
 * Squad results as a countdown: the announcer reveals the places from dead
 * last to first, one at a time ("In dead last..." pause, "Player 3!", gut
 * reaction), and each player's column and mannequin light up as they are
 * called. Pure: the kiosk queues the lines and reveals on each cue.
 */

export interface RevealPlayer {
  slot: number;
  place: number;
  total: number;
  nickname: string;
  /** Breakdown modifier labels (penalties like "SHORTS TAX" color the fallback reaction). */
  modifiers: readonly string[];
}

export interface RevealStep {
  place: number;
  /** Players sharing this place (ties are called together). */
  slots: number[];
  /** Said first, then a beat of silence ("In dead last....."). */
  callout: string;
  /** Said as the column reveals: the name(s) and the gut reaction. */
  reveal: string;
}

export interface CountdownScript {
  intro: string;
  steps: RevealStep[];
  outro: string | null;
}

/** Places from the bottom up, ties grouped. */
export function revealOrder<P extends { slot: number; place: number }>(players: readonly P[]): { place: number; players: P[] }[] {
  const places = [...new Set(players.map((p) => p.place))].sort((a, b) => b - a);
  return places.map((place) => ({ place, players: players.filter((p) => p.place === place).sort((a, b) => a.slot - b.slot) }));
}

/** Slots revealed after `shown` steps of the countdown. */
export function revealedSlots(players: readonly { slot: number; place: number }[], shown: number): Set<number> {
  return new Set(
    revealOrder(players)
      .slice(0, shown)
      .flatMap((s) => s.players.map((p) => p.slot)),
  );
}

/** The slots called at step `index` (0-based), or []. */
export function slotsAtStep(players: readonly { slot: number; place: number }[], index: number): number[] {
  return revealOrder(players)[index]?.players.map((p) => p.slot) ?? [];
}

// ---------------------------------------------------------------- lines

const ORDINALS = ["first", "second", "third", "fourth", "fifth"];
const ordinal = (place: number) => ORDINALS[place - 1] ?? `number ${place}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const INTROS = [
  "Squad aura, {aura}. Now let's see who carried, and who got carried.",
  "{aura} aura as a group. But somebody's holding this squad back. Let's count it down.",
  "Group aura: {aura}. Alright. From the bottom.",
  "Okay, okay. {aura} for the squad. Time to find out who's the weak link.",
];
const LAST = [
  "In dead last.....",
  "Bringing up the rear.....",
  "Somebody had to be last. And that somebody is.....",
  "At the very bottom of the group chat.....",
  "Last place. I'm so sorry.....",
];
const SECOND = ["So close. In second.....", "The runner-up.....", "Second place. The first loser.....", "Almost had it. Second....."];
const MIDDLE = ["In {ord} place.....", "Coming in {ord}.....", "{Ord} place. Not bad, not great.....", "Sliding into {ord}.....", "Taking {ord}....."];
const FIRST = ["And the one carrying this whole squad.....", "And your squad champion.....", "Number one. The main character.....", "And taking the crown....."];
const TIED = ["Tied for {ord}.....", "We got a tie for {ord}....."];
const TIED_LAST = ["Tied for dead last.....", "Sharing the bottom spot....."];
const TIED_FIRST = ["And it's a tie at the top....."];

const NAME_PLAIN = ["{who}!", "It's {who}!", "{who}."];
const NAME_LAST = ["{who}! Come get your L.", "{who}. Yeah.", "It's {who}!"];
const NAME_FIRST = ["{who}! Take a bow.", "{who}!! Let's go!", "It's {who}!"];

/** Picks from pools without repeating a template inside one countdown. */
function picker(rand: () => number) {
  const used = new Set<string>();
  return (pool: readonly string[]): string => {
    const fresh = pool.filter((t) => !used.has(t));
    const from = fresh.length ? fresh : pool;
    const t = from[Math.floor(rand() * from.length) % from.length];
    used.add(t);
    return t;
  };
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

function names(ps: readonly RevealPlayer[], rand: () => number): string {
  if (ps.length > 1) return `Players ${ps.map((p) => p.slot + 1).join(" and ")}`;
  const p = ps[0];
  // Now and then the judge's nickname for the fit, so it sounds less like a roll call.
  return rand() < 0.35 && p.nickname ? `Player ${p.slot + 1}, ${p.nickname}` : `Player ${p.slot + 1}`;
}

/**
 * The countdown, last place first. `lines` are the LLM's per-player gut
 * reactions by slot (lib/battle/commentary.ts squadPrompt); a missing one
 * falls back to a canned reaction for that player's score.
 */
export function countdownScript(
  players: readonly RevealPlayer[],
  opts: { groupAura: number; opener: string | null; lines: Record<number, string>; rand: () => number },
): CountdownScript {
  const pick = picker(opts.rand);
  const order = revealOrder(players);
  const lastPlace = order[0]?.place ?? 1;
  const steps = order.map(({ place, players: ps }): RevealStep => {
    const tie = ps.length > 1;
    const isFirst = place === 1;
    const isLast = place === lastPlace && !isFirst;
    const ord = ordinal(place);
    const pool = tie ? (isFirst ? TIED_FIRST : isLast ? TIED_LAST : TIED) : isFirst ? FIRST : isLast ? LAST : place === 2 ? SECOND : MIDDLE;
    const callout = fill(pick(pool), { ord, Ord: cap(ord) });
    const nameLine = fill(pick(isFirst ? NAME_FIRST : isLast ? NAME_LAST : NAME_PLAIN), { who: names(ps, opts.rand) });
    const reactions = ps.map((p) => opts.lines[p.slot]?.trim() || gutReaction(p.total, p.modifiers, opts.rand()));
    return { place, slots: ps.map((p) => p.slot), callout, reveal: [nameLine, ...reactions].join(" ") };
  });
  return {
    intro: fill(pick(INTROS), { aura: formatAura(opts.groupAura) }),
    steps,
    outro: opts.opener?.trim() || null,
  };
}
