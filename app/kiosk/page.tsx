import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { isDatabaseConfigured, isMockMode } from "@/lib/env";
import { publicBaseUrlForHost } from "@/lib/server/baseUrl";
import KioskClient from "./KioskClient";

export const metadata: Metadata = {
  title: "AURA OS // KIOSK",
};

export default async function KioskPage() {
  // Render per request so OPENAI_API_KEY is read at runtime (server-only; the browser never sees it).
  await connection();
  // Card QRs must open on a phone: never "localhost" (see lib/server/baseUrl.ts).
  const h = await headers();
  const publicBaseUrl = publicBaseUrlForHost(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto") ?? "http");
  return (
    <Suspense fallback={null}>
      <KioskClient mockMode={isMockMode()} databaseConfigured={isDatabaseConfigured()} publicBaseUrl={publicBaseUrl} />
    </Suspense>
  );
}
