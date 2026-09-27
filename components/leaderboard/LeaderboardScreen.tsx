"use client";

import { useEffect, useState } from "react";
import { EVENT_NAME } from "@/lib/config";
import { makeQrDataUrl } from "@/lib/kiosk/qr";
import { useLeaderboard } from "@/lib/kiosk/useLeaderboard";
import { handleName, rivalryLine } from "@/lib/leaderboard/narrative";
import { formatAura } from "@/lib/scoring";
import { AuraChart } from "../charts/AuraChart";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Full-screen Tide Chart for a second display. `publicBaseUrl`: an origin
 * phones can reach (the display itself may be open at localhost).
 */
export function LeaderboardScreen({ publicBaseUrl = null }: { publicBaseUrl?: string | null }) {
  const { snapshot, kingTick, error } = useLeaderboard(4000);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    // Phones open the live standings (tap a row for that card), not this big-screen page.
    makeQrDataUrl(`${publicBaseUrl ?? window.location.origin}/leaderboard`, 480).then(setQr).catch(() => setQr(null));
  }, [publicBaseUrl]);

  const top = snapshot?.top ?? [];
  const narrative = snapshot?.narrative ?? null;
  const lowestId = top.length > 1 ? top[top.length - 1].id : null;
  const ticker = (snapshot?.recent ?? []).map((e) => `${formatAura(e.aura, true)} AURA FROM ${(e.standout ?? e.nickname).toUpperCase()}`);

  return (
    <main className="lb aura-grid-bg" data-mode="digital">
      <header className="top-bar">
        <span className="font-heading text-[11px] uppercase tracking-[0.2em]">AURA OS · TIDE CHART</span>
        <span className="font-mono text-[10px] uppercase">{snapshot ? `${snapshot.totalToday} SCANS TODAY` : error ? "OFFLINE" : "LOADING"}</span>
      </header>
      <div className="lb__body">
        <section className={`os-window lb__list ${kingTick > 0 ? "tide-chart--king" : ""}`}>
          <header className="os-window__title">
            <span>TIDE_CHART.EXE · TOP 50</span>
            <span>x</span>
          </header>
          <ol className="os-window__body lb__entries" key={kingTick}>
            {/* Special rows: a different axis (squad score) and the day's story (rivalry), tinted apart. */}
            {narrative?.squadChampion && (
              <li className="lb__entry lb__entry--squad">
                <span className="lb__rank">👑</span>
                <span className="lb__nick">
                  SQUAD CHAMPION · {narrative.squadChampion.vibe.toUpperCase()} · {narrative.squadChampion.players} PLAYERS
                </span>
                <span className="lb__aura font-number">{formatAura(narrative.squadChampion.score)}</span>
              </li>
            )}
            {narrative?.rivalry && (
              <li className="lb__entry lb__entry--rivalry">
                <span className="lb__rank">⚔️</span>
                <span className="lb__nick">RIVALRY OF THE DAY · {rivalryLine(narrative.rivalry)}</span>
                <span className="lb__aura font-heading">{narrative.rivalry.leadChanges} LEAD CHANGES</span>
              </li>
            )}
            {top.length === 0 && <li className="lb__empty">NO FITS YET. GIVE THE MIRROR A THUMBS UP.</li>}
            {top.map((e, i) => {
              const streak = e.handle ? narrative?.streaks[e.handle] : undefined;
              const delta = e.handle ? narrative?.improved[e.handle] : undefined;
              return (
                <li key={e.id} className={`lb__entry ${i === 0 ? "lb__entry--top" : ""} ${e.id === lowestId ? "lb__entry--low" : ""}`}>
                  <span className="lb__rank">#{i + 1}</span>
                  <span className="lb__nick">
                    {(e.handle ? handleName(e.handle) : e.nickname).toUpperCase()}
                    {streak && (
                      <span className="lb__badge" title={`${streak} battle wins in a row`}>
                        🔥{streak}
                      </span>
                    )}
                    {delta && <span className="lb__badge lb__badge--up">↑ {formatAura(delta, true)} SINCE LAST SCAN</span>}
                  </span>
                  <span className="lb__aura font-number">{formatAura(e.aura)}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <aside className="lb__side">
          <div className="wordmark">
            <h1 className="wordmark__title font-heading uppercase">AURA BATTLES</h1>
            <p className="wordmark__sub font-mono uppercase">AURA OS · TIDE CHART · {EVENT_NAME}</p>
          </div>
          <section className="os-window os-window--light lb__qr">
            <header className="os-window__title">
              <span>FOLLOW_ALONG.EXE</span>
              <span>x</span>
            </header>
            <div className="os-window__body flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr ? <img src={qr} alt="QR code to this leaderboard" className="lb__qr-img" /> : <div className="qr-placeholder" />}
              <div className="font-heading text-[10px] uppercase">SCAN FOR STANDINGS + CARDS</div>
            </div>
          </section>
          {snapshot && snapshot.timeline.length > 0 && (
            <section className="os-window lb__timeline">
              <header className="os-window__title">
                <span>AURA_OVER_TIME.EXE</span>
                <span>x</span>
              </header>
              <div className="os-window__body">
                <AuraChart title="Average aura every 15 minutes today" points={snapshot.timeline.map((b) => ({ label: clock(b.bucket), value: b.avgAura }))} />
                <dl className="lb__facts">
                  {snapshot.hottestHour && (
                    <>
                      <dt>HOTTEST HOUR</dt>
                      <dd>
                        {clock(snapshot.hottestHour.hour)} · {snapshot.hottestHour.scans} SCANS
                      </dd>
                    </>
                  )}
                  <dt>WIDE SWINGS</dt>
                  <dd>{snapshot.timeline.reduce((n, b) => n + b.swings, 0)}</dd>
                  {snapshot.judgeSplit.scans > 0 && (
                    <>
                      <dt>JUDGES DISAGREED</dt>
                      <dd>
                        {snapshot.judgeSplit.disagreements} OF {snapshot.judgeSplit.scans} FITS
                      </dd>
                    </>
                  )}
                </dl>
                <div className="lb__source">{snapshot.store === "tiger" ? "LIVE FROM TIGER DATA (TIMESCALEDB)" : "IN-MEMORY (SET TIGER_DATABASE_URL)"}</div>
              </div>
            </section>
          )}
          {kingTick > 0 && <div className="lb__king font-heading aura-text-glow">NEW AURA KING</div>}
        </aside>
      </div>
      <footer className="lb__ticker">
        <div className="lb__ticker-track font-heading">
          {(ticker.length ? [...ticker, ...ticker] : ["WAVE AT THE MIRROR TO JOIN THE TIDE CHART"]).map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </footer>
    </main>
  );
}
