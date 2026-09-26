import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { CertificateScreen } from "@/components/certificate/CertificateScreen";
import { publicBaseUrlForHost } from "@/lib/server/baseUrl";

export const metadata: Metadata = { title: "CERTIFICATE_OF_AURA.EXE" };

/** Hidden print page (US Letter portrait). Opened in an iframe by the kiosk. */
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await headers();
  return (
    <Suspense fallback={null}>
      <CertificateScreen scanId={id} publicBaseUrl={publicBaseUrlForHost(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto") ?? "http")} />
    </Suspense>
  );
}
