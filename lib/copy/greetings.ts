/**
 * GREETINGS — EDIT ME.
 * Spoken (and shown) when the mannequin waves back. Just the hello: the
 * "show me some deuces" instruction comes right after from
 * lib/copy/voicePrompts.ts (ready), so greetings never repeat it. Never the
 * same one twice in a row.
 */
export const GREETINGS: string[] = [
  "Yo, wassup!",
  "Ayy, what's good!",
  "Yo yo yo, look who pulled up.",
  "Wassup, wassup! Somebody came dressed today.",
  "Ayy! The mirror sees you.",
  "Yo! Welcome to the Aura Department.",
  "What's good! You ready to get judged?",
  "Ayy, we got a live one.",
  "Yo, you pulled up with confidence. I respect it.",
  "Wassup! Let's see if that fit got aura.",
  "Ayy, what's poppin'!",
  "Yo! You waved, I waved. We're basically friends now.",
  "Heyyy, look at you.",
  "Yo, the sensors are tingling.",
  "What's up! Step right up.",
];

/**
 * WAVE HELLOS — EDIT ME.
 * Waving again before scanning: each wave since the last scan gets a "hi"
 * from the next tier, less enthusiastic every time (lib/kiosk/meltdown.ts
 * decides when it turns into arms crossed and a sulk). The first wave is the
 * greeting above; tier 0 here is the second wave. Past the last tier the last
 * one repeats. Never the same line twice in a row.
 */
export const WAVE_HELLOS: string[][] = [
  // 2nd wave: still happy to see you
  ["Oh hey, you again!", "Hi again!", "Hey hey! Wassup again!", "Ayy, round two. Hi!"],
  // 3rd: the hype is wearing off
  ["Yeah, hi.", "Hey. Hi. Hello.", "Hi. Again.", "Okay, hi."],
  // 4th: tired
  ["...hi.", "Mm. Hi.", "Hi. Yep. Still here.", "Hi, I guess."],
  // 5th: arms crossed
  ["Bro. We've met.", "I'm not waving back anymore. Throw up the deuces.", "You know you can just scan, right?", "Wave one more time. I dare you."],
  // 6th and on: sulking, back turned
  ["Nope. I'm done saying hi.", "That's it. Talk to my back.", "I'm not doing this anymore.", "No more hi's. Scan or leave."],
];

/** The hello tier for the Nth wave since the last scan (N >= 2), or null for the first (the greeting). */
export function helloTier(count: number): string[] | null {
  if (count < 2) return null;
  return WAVE_HELLOS[Math.min(count - 2, WAVE_HELLOS.length - 1)];
}
