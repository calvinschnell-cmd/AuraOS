"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { historyPath } from "@/lib/players";
import { useIdentity } from "./Identity";

export type AppTab = "home" | "feed" | "board" | "me";

/** 7x7 pixel icons, drawn as rects so they stay crisp at any size. */
const ICONS: Record<AppTab, [number, number, number, number][]> = {
  home: [
    [3, 0, 1, 1],
    [2, 1, 3, 1],
    [1, 2, 5, 1],
    [0, 3, 7, 1],
    [1, 4, 5, 1],
    [1, 5, 2, 2],
    [4, 5, 2, 2],
  ],
  feed: [
    [0, 0, 2, 2],
    [3, 0, 4, 1],
    [3, 1, 3, 1],
    [0, 5, 2, 2],
    [3, 5, 4, 1],
    [3, 6, 3, 1],
    [0, 3, 7, 1],
  ],
  board: [
    [3, 0, 1, 1],
    [2, 2, 3, 5],
    [0, 4, 2, 3],
    [5, 5, 2, 2],
  ],
  me: [
    [2, 0, 3, 3],
    [1, 4, 5, 1],
    [0, 5, 7, 2],
  ],
};

function PixelIcon({ tab }: { tab: AppTab }) {
  return (
    <svg className="app-nav__icon" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
      {ICONS[tab].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * The phone app's frame: a sticky bar on top (live dot, where you are) and a
 * tab bar at the bottom (HOME, FEED, BOARD, ME) with a sliding indicator.
 * `profileHandle`: on a profile page, ME lights up when it is your own.
 */
export function AppShell({
  title,
  tab = null,
  profileHandle,
  action,
  children,
}: {
  title: string;
  tab?: AppTab | null;
  profileHandle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [player] = useIdentity();
  const active: AppTab | null = profileHandle ? (player && player.handle.toUpperCase() === profileHandle.toUpperCase() ? "me" : null) : tab;
  const items: { tab: AppTab; label: string; href: string }[] = [
    { tab: "home", label: "HOME", href: "/" },
    { tab: "feed", label: "FEED", href: "/feed" },
    { tab: "board", label: "BOARD", href: "/feed?tab=standings" },
    { tab: "me", label: player ? "ME" : "JOIN", href: player ? historyPath(player.handle) : "/me" },
  ];
  const index = active ? items.findIndex((i) => i.tab === active) : -1;

  return (
    <main className="companion app aura-grid-bg">
      <header className="app-bar">
        <span className="app-bar__brand font-heading">
          <span className="app-bar__dot" aria-hidden />
          AURA OS
        </span>
        <span className="app-bar__title font-heading">{title}</span>
        {action && <span className="app-bar__action">{action}</span>}
      </header>
      <div className="companion__col">{children}</div>
      <nav className="app-nav" aria-label="App">
        {index >= 0 && <span className="app-nav__bar" style={{ transform: `translateX(${index * 100}%)` }} aria-hidden />}
        {items.map((item) => (
          <Link key={item.tab} href={item.href} className={`app-nav__item font-heading ${item.tab === active ? "app-nav__item--on" : ""}`} aria-current={item.tab === active ? "page" : undefined}>
            <PixelIcon tab={item.tab} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
