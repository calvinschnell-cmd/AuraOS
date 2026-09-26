import type { Metadata } from "next";
import { PoseLabClient } from "./PoseLabClient";

export const metadata: Metadata = { title: "AURA OS // POSE LAB", robots: { index: false } };

/** Developer tool (hidden, no links): live pose classifier + labeled sample recorder. */
export default function PoseLabPage() {
  return <PoseLabClient />;
}
