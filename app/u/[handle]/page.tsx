import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuraChart } from "@/components/charts/AuraChart";
import { EVENT_NAME, KIOSK_TIMEZONE } from "@/lib/config";
import { formatAura } from "@/lib/scoring";
import { getScanStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "YOUR AURA HISTORY",
  description: "AURA OS · Aura Battles @ HackGT 13",
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: KIOSK_TIMEZONE });

/** Phone-facing: one player's aura over the event (from Tiger Data, via their AURA ID). */
export default async function HistoryPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const history = await getScanStore()
    .playerHistory(decodeURIComponent(handle).toUpperCase())
    .catch(() => null);
  if (!history) notFound();

  const scans = history.scans;
  const first = scans[0];
  const latest = scans[scans.length - 1];
  const best = scans.reduce<(typeof scans)[number] | undefined>((b, s) => (!b || s.aura > b.aura ? s : b), undefined);

  return (
    <main className="card-page">
      <div className="os-window os-window--light card-page__window">
        <header className="os-window__title">
          <span>AURA_HISTORY.EXE</span>
          <span>x</span>
        </header>
        <div className="os-window__body card-page__body history">
          <div className="history__name">{history.name.toUpperCase()}</div>
          <div className="history__handle">AURA ID: {history.handle}</div>
          {scans.length === 0 ? (
            <p className="card-page__note">NO SCANS YET. GIVE THE MIRROR A THUMBS UP AND TYPE YOUR AURA ID.</p>
          ) : (
            <>
              <dl className="history__stats">
                <dt>SCANS</dt>
                <dd>{scans.length}</dd>
                <dt>BEST</dt>
                <dd>{best ? formatAura(best.aura, true) : "—"}</dd>
                <dt>LATEST</dt>
                <dd>{formatAura(latest.aura, true)}</dd>
                {scans.length > 1 && (
                  <>
                    <dt>SINCE FIRST SCAN</dt>
                    <dd>{formatAura(latest.aura - first.aura, true)}</dd>
                  </>
                )}
              </dl>
              <AuraChart title={`${history.name}'s aura over the event`} points={scans.map((s) => ({ label: time(s.createdAt), value: s.aura }))} />
              <ol className="history__list">
                {[...scans].reverse().map((s) => (
                  <li key={s.scanId}>
                    <span>{time(s.createdAt)}</span>
                    <span className="history__nick">{s.nickname.toUpperCase()}</span>
                    <span>{formatAura(s.aura, true)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          <p className="card-page__note">AURA OS · AURA BATTLES @ {EVENT_NAME}. BOOKMARK THIS PAGE TO WATCH YOUR AURA CHANGE.</p>
        </div>
      </div>
    </main>
  );
}
