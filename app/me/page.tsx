import type { Metadata } from "next";
import { MeScreen } from "@/components/companion/MeScreen";

export const metadata: Metadata = { title: "ME · AURA OS" };

export default function MePage() {
  return <MeScreen />;
}
