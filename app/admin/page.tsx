import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { publicBaseUrlForHost } from "@/lib/server/baseUrl";

export const metadata: Metadata = { title: "AURA OS // ADMIN" };

/** The one admin page (ADMIN_KEY): mirror, controls, sign-ups, feed, board edits, phone QR. */
export default async function AdminPage() {
  // The phone QR must open on a phone, even when this page is at localhost.
  const h = await headers();
  return <AdminDashboard publicBaseUrl={publicBaseUrlForHost(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto") ?? "http")} />;
}
