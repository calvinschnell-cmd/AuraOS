import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultScreen } from "@/components/companion/ResultScreen";
import { feedDetail } from "@/lib/server/feed";
import { formatAura } from "@/lib/scoring";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await feedDetail(id).catch(() => null);
  if (!detail) return { title: "AURA OS" };
  const { entry } = detail;
  const title = `${entry.title} · ${formatAura(entry.target)} AURA`;
  return {
    title,
    description: entry.caption ?? "Think you can beat this score? AURA OS · Aura Battles.",
    openGraph: { title, description: entry.caption ?? undefined, images: [{ url: entry.imageUrl, width: 1080, height: 1350 }] },
  };
}

/** The deep link every card's QR points at: that exact battle / scan. */
export default async function ResultPage({ params }: Props) {
  const { id } = await params;
  const detail = await feedDetail(id).catch(() => null);
  if (!detail) notFound();
  return <ResultScreen detail={detail} />;
}
