"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Screens people watch from across the room: the link only shows while the mouse moves. */
const AUTO_HIDE = ["/kiosk", "/leaderboard"];
/** No floating link: the print page, and the phone app (its tab bar has HOME). */
const NONE = ["/certificate", "/feed", "/r/", "/u/", "/me", "/scan", "/c/"];
const IDLE_MS = 2_500;

/** Back to the launcher (/) from every page. */
export function HomeLink() {
  const pathname = usePathname() ?? "/";
  const autoHide = AUTO_HIDE.some((p) => pathname.startsWith(p));
  const [awake, setAwake] = useState(false);

  useEffect(() => {
    if (!autoHide) return;
    let timer = 0;
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAwake(false), IDLE_MS);
    };
    window.addEventListener("pointermove", wake);
    return () => {
      window.removeEventListener("pointermove", wake);
      window.clearTimeout(timer);
    };
  }, [autoHide]);

  if (pathname === "/" || NONE.some((p) => pathname.startsWith(p))) return null;
  return (
    <Link href="/" className={`home-link font-heading ${autoHide && !awake ? "home-link--hidden" : ""}`} aria-label="Home">
      ⌂ HOME
    </Link>
  );
}
