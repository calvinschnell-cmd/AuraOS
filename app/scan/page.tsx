import type { Metadata } from "next";
import { ScanScreen } from "@/components/companion/ScanScreen";
import { isDuelId } from "@/lib/duels/types";

export const metadata: Metadata = {
  title: "AURA OS · SCAN YOUR FIT",
  description: "Snap your outfit, get an aura score from the AURA OS judges, and battle your friends. HackGT 13.",
  openGraph: { title: "AURA OS · SCAN YOUR FIT", description: "Snap your outfit, get an aura score, battle your friends.", images: [{ url: "/api/og", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "AURA OS · SCAN YOUR FIT", images: ["/api/og"] },
};

/** Phone scans: take or pick a photo, get scored, land on your card's page (or, with ?c=, battle a challenge). */
export default async function ScanPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  return <ScanScreen challengeId={c && isDuelId(c) ? c : null} />;
}
