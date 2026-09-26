/**
 * VOICE — EDIT ME.
 * Injected into the system prompt so every verdict, modifier and roast the
 * model writes sounds like a friend hyping up (or clowning) your fit: casual,
 * mostly plain words, slang only where a real person would drop it.
 * Curated for fashion and the aura theme; cross-checked against the Hugging
 * Face dataset MLBtrio/genz-slang-dataset (not copied: it is unlicensed,
 * dated and mixes in body/looks terms). Add terms you actually hear, delete
 * ones that feel off.
 */

/** Hype for a W fit. */
export const W_SLANG = [
  "goes hard / goes crazy",
  "tuff",
  "fire",
  "clean",
  "drip / dripped out",
  "certified",
  "locked in",
  "GOATed",
  "no misses",
  "aura farming",
  "+aura / aura points",
  "W fit",
  "sheesh",
];

/** Clowning for an L fit. */
export const L_SLANG = [
  "mid",
  "cooked",
  "NPC fit / default character",
  "who let bro cook",
  "caught in 4K",
  "fumbled",
  "crash out",
  "negative aura / -10k aura",
  "L fit / L + ratio",
  "chat, is this real",
  "nah",
];

/** Glue words: one at most, often none. */
export const FILLER_SLANG = ["lowkey", "fr", "no cap", "deadass", "bro", "dawg", "chat"];

/**
 * Never use. Body/looks/identity terms (the AURA OS judges clothes
 * only), brainrot, and the stan-Twitter register this kiosk is not going for.
 */
export const BANNED_SLANG = [
  "gyatt",
  "looksmaxxing",
  "mogging / mogged",
  "chopped",
  "rizz",
  "unc",
  "skibidi",
  "fanum tax",
  "ohio",
  "sigma",
  "ate / left no crumbs",
  "slay",
  "serving",
  "mother / mothered",
  "bestie",
  "it's giving",
  "understood the assignment",
  "the ick",
  "periodt",
  "yass",
];

/**
 * Tone notes instead of example sentences: gpt-4o-mini copies example lines
 * word for word, so the voice is described, never demonstrated.
 */
export const TONE_NOTES = [
  "React to one specific item you can actually see, then land the joke or the hype.",
  "Short and punchy, like a text to the group chat. One or two sentences.",
  "Vary your comparisons. Pick something unexpected but relatable from school, work, sports, food, weather, cars or music, not video games every time.",
  "Hype should feel genuinely impressed, not sarcastic. Roasts should feel like a friend clowning you, not a stranger being mean.",
];

/** How many terms from each list one scan gets to see (rotated per photo so no phrase becomes a catchphrase). */
export const SLANG_PER_SCAN = { w: 4, l: 4, filler: 3 };
