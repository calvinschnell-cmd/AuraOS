import type { Metadata } from "next";
import { BoardScreen } from "@/components/companion/BoardScreen";
import { isLeaderboardBoard } from "@/lib/kiosk/types";

export const metadata: Metadata = {
  title: "AURA OS · LEADERBOARD",
  description: "Live AURA OS rankings from the mirror and phones at HackGT 13.",
  openGraph: { title: "AURA OS · LEADERBOARD", images: [{ url: "/api/og?t=LIVE LEADERBOARD", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "AURA OS · LEADERBOARD", images: ["/api/og?t=LIVE LEADERBOARD"] },
};

/** Phone leaderboard (the big-screen Tide Chart lives at /tv); ?board= picks the tab. */
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ board?: string }> }) {
  const { board } = await searchParams;
  return <BoardScreen initialBoard={isLeaderboardBoard(board) ? board : "solo"} />;
}
