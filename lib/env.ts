/**
 * Feature flags derived from the environment. Everything degrades to a working
 * MOCK MODE when a key is missing.
 */

/**
 * True when no OPENAI_API_KEY is set: /api/analyze serves lib/fixtures.ts.
 * Server-only: in the browser the key is always undefined (app/kiosk/page.tsx
 * evaluates this and passes it down).
 */
export function isMockMode(): boolean {
  return !process.env.OPENAI_API_KEY?.trim();
}

/** Server-only: scans, leaderboard and history persist in Tiger Data (else in memory). */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.TIGER_DATABASE_URL?.trim());
}

export function getAdminKey(): string | null {
  return process.env.ADMIN_KEY?.trim() || null;
}

/** Aura Certificate printing (Stage 13). Off unless PRINTING_ENABLED=true. */
export function isPrintingEnabled(): boolean {
  return process.env.PRINTING_ENABLED?.trim().toLowerCase() === "true";
}
