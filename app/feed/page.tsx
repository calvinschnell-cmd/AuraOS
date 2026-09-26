import type { Metadata } from "next";
import { FeedScreen } from "@/components/companion/FeedScreen";
import { getScanStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AURA OS · FEED",
  description: "Every Aura Battle and scan from the AURA OS mirror at HackGT 13.",
};

const PAGE = 20;

/** Companion app: the public feed of saved cards (react, open, beat the score). */
export default async function FeedPage() {
  const entries = await getScanStore()
    .feed(PAGE)
    .catch(() => []);
  return <FeedScreen initial={entries} initialNext={entries.length === PAGE ? entries[entries.length - 1].createdAt : null} />;
}
