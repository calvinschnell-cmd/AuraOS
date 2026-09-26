import type { Metadata } from "next";
import { PoseEditorClient } from "./PoseEditorClient";

export const metadata: Metadata = { title: "AURA OS // POSE EDITOR", robots: { index: false } };

/** Developer tool (hidden, no links). */
export default function PoseEditorPage() {
  return <PoseEditorClient />;
}
