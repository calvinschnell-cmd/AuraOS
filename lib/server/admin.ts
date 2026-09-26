import { timingSafeEqual } from "node:crypto";
import { getAdminKey } from "@/lib/env";

/** True when the request carries the ADMIN_KEY (header or body). */
export function isAdmin(key: string | null | undefined): boolean {
  const expected = getAdminKey();
  if (!expected || !key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminKeyFrom(request: Request): string | null {
  return request.headers.get("x-admin-key");
}
