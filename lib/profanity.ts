/** Basic profanity filter for nicknames and typed names (the leaderboard is public). */

const BLOCKED = [
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "cunt", "pussy", "cock", "whore", "slut", "fag", "nigg", "retard", "nazi", "rape", "kike", "spic", "chink", "tranny",
];

export function hasProfanity(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z]/g, "");
  return BLOCKED.some((w) => t.includes(w));
}

/** Clean a nickname: strip profanity, collapse whitespace, cap at 30 chars. */
export function cleanNickname(nickname: string, fallback = "Mystery Fit"): string {
  const words = nickname
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !hasProfanity(w));
  let out = words.join(" ").trim();
  if (!out) out = fallback;
  if (out.length > 30) out = out.slice(0, 30).replace(/\s+\S*$/, "").trim() || out.slice(0, 30);
  return out;
}

/** Longest name a player can type for the leaderboard (the column allows 30). */
export const PLAYER_NAME_MAX = 20;

export type PlayerNameCheck = { ok: true; name: string | null } | { ok: false; error: string };

/**
 * Validate a typed leaderboard name. Empty means "use the generated
 * nickname" (name: null). Shared by the kiosk (instant feedback) and
 * /api/cards (enforcement).
 */
export function checkPlayerName(raw: string): PlayerNameCheck {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: true, name: null };
  if (name.length > PLAYER_NAME_MAX) return { ok: false, error: `${PLAYER_NAME_MAX} CHARACTERS MAX.` };
  if (!/^[\p{L}\p{N} '._-]+$/u.test(name)) return { ok: false, error: "LETTERS, NUMBERS AND SPACES ONLY." };
  if (hasProfanity(name)) return { ok: false, error: "THAT NAME IS NOT LEADERBOARD SAFE. TRY ANOTHER." };
  return { ok: true, name };
}
