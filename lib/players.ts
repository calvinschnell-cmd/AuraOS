/**
 * Player handles for per-user history without accounts: the typed name plus a
 * short code, e.g. "CALVIN#K7QX". Shown on the card and certificate; typing it
 * at a later thumbs up links the new scan to the same history.
 */

export const HANDLE_CODE_LENGTH = 4;
/** No 0/O, 1/I/L: codes get read off a phone screen and retyped. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newHandleCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < HANDLE_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

export function makeHandle(name: string, code: string): string {
  return `${name.trim().toUpperCase()}#${code.toUpperCase()}`;
}

/** "calvin#k7qx" -> { name: "CALVIN", code: "K7QX", handle: "CALVIN#K7QX" }; null when there is no valid code. */
export function parseHandle(input: string): { name: string; code: string; handle: string } | null {
  const m = /^(.+?)\s*#\s*([A-Za-z0-9]{4})$/.exec(input.trim());
  if (!m) return null;
  const name = m[1].trim().toUpperCase();
  const code = m[2].toUpperCase();
  if (!name || [...code].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return { name, code, handle: makeHandle(name, code) };
}

/** The phone-facing history page for a handle. */
export function historyPath(handle: string): string {
  return `/u/${encodeURIComponent(handle)}`;
}
