import type { Metadata } from "next";
import { CardLab } from "@/components/card/CardLab";

export const metadata: Metadata = { title: "AURA OS // CARD LAB" };

/** Developer tool (hidden, like /pose-editor): solo, battle and squad cards from sample data. */
export default function CardLabPage() {
  return <CardLab />;
}
