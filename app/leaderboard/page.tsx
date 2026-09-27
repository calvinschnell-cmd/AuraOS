import type { Metadata } from "next";
import { BoardScreen } from "@/components/companion/BoardScreen";

export const metadata: Metadata = {
  title: "AURA OS · LEADERBOARD",
  description: "Live AURA OS rankings from the mirror and phones at HackGT 13.",
  openGraph: { title: "AURA OS · LEADERBOARD", images: [{ url: "/api/og?t=LIVE LEADERBOARD", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "AURA OS · LEADERBOARD", images: ["/api/og?t=LIVE LEADERBOARD"] },
};

/** Phone leaderboard (the big-screen Tide Chart lives at /tv). */
export default function LeaderboardPage() {
  return <BoardScreen />;
}
