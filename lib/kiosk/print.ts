"use client";

/**
 * Print the Aura Certificate from a hidden iframe. With Chrome's
 * --kiosk-printing flag no dialog appears. Any failure is swallowed.
 */
export async function printCertificate(url: string, timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      resolve(ok);
      // Keep the frame around long enough for the print job to spool.
      setTimeout(() => iframe.remove(), 60_000);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      if ((e.data as { type?: string })?.type === "aura-certificate-ready") {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          finish(true);
        } catch {
          finish(false);
        }
      }
    };
    window.addEventListener("message", onMessage);
    iframe.onerror = () => finish(false);
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => finish(false), timeoutMs);
  });
}
