"use client";

import { useState } from "react";

/** Share this profile: the phone's share sheet, or copy the link. */
export function ShareProfile({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    const text = `${name}'s aura at the AURA OS mirror`;
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url });
        return;
      } catch {
        // dismissed: fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // no clipboard: nothing else to do
    }
  };
  return (
    <button type="button" className="companion__big-btn" onClick={() => void share()}>
      {copied ? "LINK COPIED" : "SHARE MY PROFILE"}
    </button>
  );
}
