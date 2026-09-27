import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChallengeScreen } from "@/components/companion/ChallengeScreen";
import { isDuelId } from "@/lib/duels/types";
import { duelView } from "@/lib/server/duels";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string }> };

const load = async (id: string) => (isDuelId(id) ? duelView(id, null).catch(() => null) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const view = await load(id);
  if (!view) return { title: "AURA OS" };
  const title = `${view.challenger.name} CHALLENGED YOU · AURA OS`;
  const description = "Scan your fit and battle them. The judges score you both and roast the result.";
  // Not the card: it would give the score away before the friend scans.
  const image = `/api/og?t=${encodeURIComponent(`CAN YOU BEAT ${view.challenger.name.slice(0, 24)}?`)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** A challenge link: /c/[id] (random id). `?a=` highlights the accept that just happened. */
export default async function ChallengePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { a } = await searchParams;
  const view = await load(id);
  if (!view) notFound();
  return <ChallengeScreen initial={view} highlightAccept={a ?? null} />;
}
