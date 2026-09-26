import { networkInterfaces } from "node:os";

/** Virtual adapters a phone can never reach (WSL, Hyper-V, VMs, Docker). */
const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Loopback/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Rank for picking the address people's phones can reach: home/event LAN first. */
function lanRank(ip: string): number {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 3;
  if (ip.startsWith("169.254.")) return 9; // link-local: no DHCP, useless
  return 2; // routable (campus networks hand these out)
}

/** This machine's best network IPv4 for phones on the same network, or null (offline). */
export function lanAddress(): string | null {
  const candidates: string[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) candidates.push(a.address);
  }
  candidates.sort((a, b) => lanRank(a) - lanRank(b));
  const best = candidates[0];
  return best && lanRank(best) < 9 ? best : null;
}

/**
 * The origin a phone should use to reach this server. A kiosk opened at
 * localhost would otherwise bake "localhost" into its QR codes, which on a
 * phone means the phone itself; swap in this machine's network address
 * (same port). Anything else (a real host or IP) is already reachable.
 */
export function reachableOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return origin;
  }
  if (!LOCAL_HOSTS.has(url.hostname)) return url.origin;
  const lan = lanAddress();
  if (!lan) return url.origin;
  url.hostname = lan;
  return url.origin;
}

/** PUBLIC_BASE_URL when configured (no trailing slash), else null. */
export function configuredPublicBaseUrl(): string | null {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  return configured ? configured.replace(/\/+$/, "") : null;
}

/**
 * Public origin for links that leave the kiosk (card QRs, NFT metadata, share
 * links): PUBLIC_BASE_URL when set (the deploy / .tech domain), else the
 * origin of the incoming request, with localhost swapped for this machine's
 * network address so a phone can open it. Never a hardcoded localhost.
 */
export function publicBaseUrl(request: Request): string {
  return configuredPublicBaseUrl() ?? reachableOrigin(new URL(request.url).origin);
}

/** Same, for a server component that only has the Host header (the kiosk page). */
export function publicBaseUrlForHost(host: string | null, protocol = "http"): string | null {
  return configuredPublicBaseUrl() ?? (host ? reachableOrigin(`${protocol}://${host}`) : null);
}
