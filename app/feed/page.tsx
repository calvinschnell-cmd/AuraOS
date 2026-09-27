import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeedScreen } from "@/components/companion/FeedScreen";
import { getScanStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AURA OS · LIVE",
  description: "Every AURA OS result from the mirror and phones at HackGT 13, live.",
  openGraph: { title: "AURA OS · LIVE FEED", images: [{ url: "/api/og?t=LIVE FEED", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", images: ["/api/og?t=LIVE FEED"] },
};

const PAGE = 20;

/** Companion app: every card from the mirror and phones, newest first, live. */
export default async function FeedPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  // Old links (the Tide Chart QR, shared URLs): the standings are their own page now.
  if (tab === "standings") redirect("/leaderboard");
  const entries = await getScanStore()
    .feed(PAGE, null, null)
    .catch(() => []);
  return <FeedScreen initial={entries} initialNext={entries.length === PAGE ? entries[entries.length - 1].createdAt : null} />;
}
