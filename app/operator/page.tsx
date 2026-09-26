import type { Metadata } from "next";
import { OperatorScreen } from "@/components/operator/OperatorScreen";

export const metadata: Metadata = { title: "AURA OS // OPERATOR" };

/** The operator's laptop screen while the mirror shows /kiosk (ADMIN_KEY to unlock). */
export default function OperatorPage() {
  return <OperatorScreen />;
}
