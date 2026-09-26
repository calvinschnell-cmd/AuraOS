import type { Metadata } from "next";
import { AdminScreen } from "@/components/admin/AdminScreen";

export const metadata: Metadata = { title: "AURA OS // ADMIN" };

export default function AdminPage() {
  return <AdminScreen />;
}
