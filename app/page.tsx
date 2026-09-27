import Link from "next/link";
import type { CSSProperties } from "react";
import { APP_VERSION } from "@/lib/config";
import { FOOTER_LINES } from "@/lib/copy";

const ROUTES: { href: string; label: string; note: string }[] = [
  { href: "/kiosk?mode=digital", label: "KIOSK (DIGITAL)", note: "flipped camera feed" },
  { href: "/kiosk?mode=mirror", label: "KIOSK (MIRROR)", note: "two-way mirror, pure black" },
  { href: "/feed", label: "FEED", note: "companion app: every card, reactions" },
  { href: "/tv", label: "TIDE CHART (TV)", note: "big-screen board, rivalries, squad champion" },
  { href: "/scan", label: "PHONE APP", note: "scan, leaderboard, feed, challenges" },
  { href: "/admin", label: "ADMIN", note: "mirror, controls, feed, board edits, ADMIN_KEY" },
];

export default function Home() {
  return (
    <main className="aura-grid-bg flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <header className="text-center">
        <p className="font-heading text-xs uppercase tracking-widest text-aura-cyan">
          AURA OS
        </p>
        <h1 className="aura-text-glow font-heading text-4xl uppercase text-aura-cyan sm:text-6xl">
          AURA BATTLES
        </h1>
        <p className="mt-2 font-mono text-xs uppercase text-aura-cyan/70">
          AURA OS {APP_VERSION} · SOCIAL OUTFIT BATTLE ENVIRONMENT
        </p>
      </header>

      <section className="fx-wipe w-full max-w-md border border-aura-cyan bg-aura-black">
        <div className="flex items-center justify-between border-b border-aura-cyan bg-aura-cyan px-2 py-1 font-heading text-[10px] uppercase text-aura-ink">
          <span>LAUNCHER.EXE</span>
          <span aria-hidden>x</span>
        </div>
        <ul className="divide-y divide-aura-cyan/30">
          {ROUTES.map((r, i) => (
            <li key={r.href} className="fx-rise" style={{ "--i": i } as CSSProperties}>
              <Link
                href={r.href}
                className="fx-nudge flex items-baseline justify-between gap-4 px-3 py-2 font-heading text-xs uppercase text-aura-cyan hover:bg-aura-cyan hover:text-aura-ink"
              >
                <span>&gt; {r.label}</span>
                <span className="font-mono text-[10px] normal-case opacity-70">
                  {r.note}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer className="max-w-lg text-center font-mono text-[10px] uppercase text-aura-cyan/60">
        {FOOTER_LINES[0]}
      </footer>
    </main>
  );
}
