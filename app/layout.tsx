import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Silkscreen, VT323 } from "next/font/google";
import { HomeLink } from "@/components/HomeLink";
import "./globals.css";

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

const vt323 = VT323({
  variable: "--font-vt323",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

/** Link previews need absolute image URLs: the public origin (PUBLIC_BASE_URL) when set. */
function metadataBase(): URL | undefined {
  try {
    return process.env.PUBLIC_BASE_URL ? new URL(process.env.PUBLIC_BASE_URL) : undefined;
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: "AURA OS",
  description: "AURA OS: a social outfit-battling platform. Aura Battles, 1v1 and squads, judged on fit and pose. HackGT 13.",
};

export const viewport: Viewport = {
  themeColor: "#161616",
  width: "device-width",
  initialScale: 1,
  // Phones: draw under the notch / home bar; the app shell pads with safe-area insets.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${silkscreen.variable} ${vt323.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <HomeLink />
      </body>
    </html>
  );
}
