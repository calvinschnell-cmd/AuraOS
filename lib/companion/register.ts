import type { PlayerInfo } from "@/lib/kiosk/types";

/**
 * Register a new player ({ name }) or look up a returning one ({ handle }).
 * "unknown": that AURA ID does not exist. null: the registry is offline or
 * slow (the claim goes on without a history link; never blocks the kiosk).
 * Lives apart from lib/kiosk/api so phone pages don't bundle the server-side
 * analysis code it imports.
 */
export async function registerPlayer(input: { name: string } | { handle: string }, timeoutMs = 4000): Promise<PlayerInfo | "unknown" | null> {
  try {
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) return "unknown";
    if (!res.ok) return null;
    return (await res.json()) as PlayerInfo;
  } catch {
    return null;
  }
}
