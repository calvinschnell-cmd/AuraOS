import type { Metadata } from "next";
import { MusicLab } from "@/components/kiosk/MusicLab";

export const metadata: Metadata = { title: "AURA OS // MUSIC LAB" };

/** Developer tool: check the kiosk music loop point, jingle and ducking. */
export default function MusicLabPage() {
  return <MusicLab />;
}
