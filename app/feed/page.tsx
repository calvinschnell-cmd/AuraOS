import type { Metadata } from "next";
import { FeedScreen } from "@/components/companion/FeedScreen";
import { getScanStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AURA OS · LIVE",
  description: "The latest scan, every card and the live standings from the AURA OS mirror at HackGT 13.",
};

const PAGE = 20;

/** Companion app: the card just scanned, the feed of saved cards, and the live standings (?tab=standings). */
export default async function FeedPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const entries = await getScanStore()
    .feed(PAGE)
    .catch(() => []);
  return <FeedScreen initial={entries} initialNext={entries.length === PAGE ? entries[entries.length - 1].createdAt : null} initialTab={tab === "standings" ? "standings" : "feed"} />;
}
