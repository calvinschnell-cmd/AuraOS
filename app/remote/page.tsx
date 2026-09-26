import type { Metadata } from "next";
import { RemoteScreen } from "@/components/remote/RemoteScreen";

export const metadata: Metadata = { title: "AURA OS // REMOTE" };

export default function RemotePage() {
  return <RemoteScreen />;
}
