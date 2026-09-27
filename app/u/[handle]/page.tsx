import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuraChart } from "@/components/charts/AuraChart";
import { AppShell } from "@/components/companion/AppShell";
import { DecodeNumber } from "@/components/companion/DecodeNumber";
import { ShareProfile } from "@/components/companion/ShareProfile";
import { EVENT_NAME, KIOSK_TIMEZONE } from "@/lib/config";
import { formatAura } from "@/lib/scoring";
import { getScanStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const KIND_CHIP = { scan: "SOLO", battle: "1V1", squad: "SQUAD", challenge: "CHALLENGE" } as const;
const MAX_CARDS = 60;

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: KIOSK_TIMEZONE });

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const player = await getScanStore()
    .getPlayer(decodeURIComponent(handle).toUpperCase())
    .catch(() => null);
  const name = player?.name.toUpperCase() ?? "PLAYER";
  return { title: `${name} · AURA OS`, description: `${name}'s cards, battles and aura from the AURA OS mirror at ${EVENT_NAME}.` };
}

/**
 * A player's profile (their AURA ID): every card they saved or claimed (solo
 * scans, battles, squads), which stay here after the public feed's half hour,
 * plus their aura over the event. Made to be shared.
 */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const id = decodeURIComponent(handle).toUpperCase();
  const store = getScanStore();
  const [history, cards] = await Promise.all([store.playerHistory(id).catch(() => null), store.cardsForHandle(id, MAX_CARDS).catch(() => [])]);
  if (!history) notFound();

  const scans = history.scans;
  const best = scans.reduce<(typeof scans)[number] | undefined>((b, s) => (!b || s.aura > b.aura ? s : b), undefined);
  const latest = scans[scans.length - 1];
  const battles = cards.filter((c) => c.kind !== "scan");

  return (
    <AppShell title="PROFILE" profileHandle={history.handle}>
        <div className="wordmark">
          <h1 className="wordmark__title font-heading uppercase">{history.name}</h1>
          <p className="wordmark__sub font-mono uppercase">AURA ID {history.handle}</p>
        </div>

        <dl className="profile__stats">
          <div>
            <dt className="font-heading">CARDS</dt>
            <dd className="font-number">{cards.length}</dd>
          </div>
          <div>
            <dt className="font-heading">BATTLES</dt>
            <dd className="font-number">{battles.length}</dd>
          </div>
          <div>
            <dt className="font-heading">BEST</dt>
            <dd className="font-number">{best ? <DecodeNumber value={best.aura} signed /> : "—"}</dd>
          </div>
          <div>
            <dt className="font-heading">LATEST</dt>
            <dd className="font-number">{latest ? <DecodeNumber value={latest.aura} signed /> : "—"}</dd>
          </div>
        </dl>

        <ShareProfile name={history.name} />

        {cards.length === 0 ? (
          <p className="companion__note">NO CARDS YET. SCAN AT THE MIRROR UNDER YOUR AURA ID, OR OPEN A CARD AND TAP “THIS WAS ME”.</p>
        ) : (
          <ol className="profile__cards">
            {cards.map((c, i) => (
              <li key={c.id} className="rise" style={{ ["--i" as string]: Math.min(i, 8) }}>
                <Link href={`/r/${c.id}`} className="profile__card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt={c.title} loading="lazy" />
                  <span className="profile__card-meta font-heading">
                    <span className="feed__chip">{KIND_CHIP[c.kind]}</span> {time(c.createdAt)}
                  </span>
                  <span className="profile__card-score font-number">{formatAura(c.headline)}</span>
                  <span className="profile__card-react font-mono">
                    {Object.entries(c.reactions)
                      .filter(([, n]) => n > 0)
                      .map(([emoji, n]) => `${emoji}${n}`)
                      .join(" ")}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}

        {scans.length > 1 && <AuraChart title={`${history.name}'s aura over the event`} points={scans.map((s) => ({ label: time(s.createdAt), value: s.aura }))} />}

        <p className="companion__note">
          AURA OS · AURA BATTLES @ {EVENT_NAME}. CARDS YOU CLAIM STAY HERE AFTER THEY LEAVE THE LIVE FEED.
        </p>
    </AppShell>
  );
}
