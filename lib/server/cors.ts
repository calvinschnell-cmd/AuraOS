import { configuredPublicBaseUrl } from "./baseUrl";

/**
 * CORS for the phone endpoints. The pages and the API share one origin, so
 * browsers never need this there; it only lets the public domain's other
 * names (apex / www, from PUBLIC_BASE_URL) call a server on another one.
 * Everything else gets no CORS headers (same-origin only).
 */
export function allowedOrigins(): Set<string> {
  const base = configuredPublicBaseUrl();
  const out = new Set<string>();
  if (!base) return out;
  try {
    const url = new URL(base);
    out.add(url.origin);
    const host = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    out.add(`${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`);
  } catch {
    // bad PUBLIC_BASE_URL: same-origin only
  }
  return out;
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins().has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-Id",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
