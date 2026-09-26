import type { Metadata } from "next";
import { headers } from "next/headers";
import { LeaderboardScreen } from "@/components/leaderboard/LeaderboardScreen";
import { publicBaseUrlForHost } from "@/lib/server/baseUrl";

export const metadata: Metadata = { title: "AURA OS // TIDE CHART" };

export default async function LeaderboardPage() {
  // The follow-along QR must open on a phone, even when this display is at localhost.
  const h = await headers();
  return <LeaderboardScreen publicBaseUrl={publicBaseUrlForHost(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto") ?? "http")} />;
}
