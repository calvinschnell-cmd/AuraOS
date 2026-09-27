"use client";

import dynamic from "next/dynamic";

// The kiosk is browser-only (camera, WebGL, localStorage): never prerender it.
const KioskApp = dynamic(() => import("@/components/kiosk/KioskApp"), {
  ssr: false,
  loading: () => (
    <div className="boot-screen">
      <div className="boot-screen__box">
        <div className="boot-screen__line">
          <span className="opacity-60">&gt;</span> LOADING AURA OS...
        </div>
      </div>
    </div>
  ),
});

export default function KioskClient({
  mockMode,
  databaseConfigured,
  publicBaseUrl,
  preferredCamera,
}: {
  mockMode: boolean;
  databaseConfigured: boolean;
  publicBaseUrl: string | null;
  preferredCamera: string | null;
}) {
  return <KioskApp mockMode={mockMode} databaseConfigured={databaseConfigured} publicBaseUrl={publicBaseUrl} preferredCamera={preferredCamera} />;
}
