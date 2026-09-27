import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultScreen } from "@/components/companion/ResultScreen";
import { feedDetail } from "@/lib/server/feed";
import { formatAura } from "@/lib/scoring";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await feedDetail(id).catch(() => null);
  if (!detail) return { title: "AURA OS" };
  const { entry } = detail;
  const title = `${entry.title} · ${formatAura(entry.target)} AURA`;
  const description = entry.caption ?? entry.verdict ?? "Think you can beat this score? AURA OS · Aura Battles.";
  // The card itself is the preview (4:5); metadataBase makes the URL absolute.
  const image = { url: entry.imageUrl, width: 1080, height: 1350, alt: `AURA OS card: ${entry.title}` };
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [entry.imageUrl] },
  };
}

/** The deep link every card's QR points at: that exact battle / scan. `?t=` = ms from photo to card (phone scans). */
export default async function ResultPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { t } = await searchParams;
  const detail = await feedDetail(id).catch(() => null);
  if (!detail) notFound();
  const ms = Number.parseInt(t ?? "", 10);
  return <ResultScreen detail={detail} timingMs={Number.isFinite(ms) && ms > 0 && ms < 600_000 ? ms : null} />;
}
