/**
 * Sliding-window rate limits for phone scans, per server process (the
 * public site runs as one process). Keys are "device:<id>" and "ip:<addr>".
 */

const g = globalThis as unknown as { __auraRate?: Map<string, number[]> };

export interface RateVerdict {
  ok: boolean;
  /** Seconds until the oldest hit in the window expires (when blocked). */
  retryAfterSec: number;
}

export class RateLimiter {
  constructor(private readonly hits: Map<string, number[]> = new Map()) {}

  /**
   * Checks every (key, limit) pair; records a hit on all of them only when
   * none is over its limit, so a blocked attempt never extends the block.
   */
  take(checks: readonly { key: string; limit: number }[], windowMs: number, now = Date.now()): RateVerdict {
    let retry = 0;
    for (const { key, limit } of checks) {
      const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
      this.hits.set(key, recent);
      if (recent.length >= limit) retry = Math.max(retry, Math.ceil((recent[0] + windowMs - now) / 1000));
    }
    if (retry > 0) return { ok: false, retryAfterSec: retry };
    for (const { key } of checks) this.hits.get(key)!.push(now);
    if (this.hits.size > 20_000) this.prune(windowMs, now);
    return { ok: true, retryAfterSec: 0 };
  }

  private prune(windowMs: number, now: number): void {
    for (const [key, times] of this.hits) if (times.every((t) => now - t >= windowMs)) this.hits.delete(key);
  }
}

export function scanLimiter(): RateLimiter {
  g.__auraRate ??= new Map();
  return new RateLimiter(g.__auraRate);
}

/** The caller's IP behind Caddy (first X-Forwarded-For hop), else a constant. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip")?.trim() || "local";
}

/** A device id from the phone (its random client id): short, URL-safe, or null. */
export function deviceIdFrom(value: string | null | undefined): string | null {
  const v = value?.trim() ?? "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}
