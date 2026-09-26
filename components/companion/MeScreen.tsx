"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { historyPath } from "@/lib/players";
import { AppShell } from "./AppShell";
import { IdentityForm, useIdentity } from "./Identity";

/** The ME tab: your profile, or (first time on this phone) pick a name and get an AURA ID. */
export function MeScreen() {
  const router = useRouter();
  const [player, setPlayer] = useIdentity();

  useEffect(() => {
    if (player) router.replace(historyPath(player.handle));
  }, [player, router]);

  return (
    <AppShell title="JOIN" tab="me">
      <div className="wordmark">
        <h1 className="wordmark__title font-heading uppercase">GET AN AURA ID</h1>
        <p className="wordmark__sub font-mono uppercase">ONE NAME · NO PASSWORD · NO ACCOUNT</p>
      </div>
      {player ? (
        <p className="companion__note">OPENING YOUR PROFILE...</p>
      ) : (
        <>
          <section className="os-window os-window--dark">
            <header className="os-window__title">
              <span>WHO_ARE_YOU.EXE</span>
              <span>x</span>
            </header>
            <div className="os-window__body companion__claim">
              <p className="companion__note">TYPE A NAME AND YOU GET AN AURA ID (NAME#CODE). ALREADY HAVE ONE? TYPE IT TO PICK UP YOUR HISTORY.</p>
              <IdentityForm
                cta="CREATE"
                onDone={(p) => {
                  setPlayer(p);
                  router.push(historyPath(p.handle));
                }}
              />
            </div>
          </section>
          <ol className="me-steps">
            {[
              ["01", "SCAN AT THE MIRROR", "WAVE, THEN DOUBLE PEACE. YOUR CARD SHOWS UP IN THE FEED."],
              ["02", "TAP “THIS WAS ME”", "ON YOUR CARD. IT STAYS ON YOUR PROFILE AFTER THE LIVE FEED MOVES ON."],
              ["03", "CLIMB THE BOARD", "STREAKS, RIVALRIES AND YOUR AURA OVER THE EVENT."],
            ].map(([n, title, body]) => (
              <li key={n} className="me-steps__step">
                <span className="me-steps__n font-number">{n}</span>
                <span>
                  <span className="font-heading me-steps__title">{title}</span>
                  <span className="companion__note">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </AppShell>
  );
}
