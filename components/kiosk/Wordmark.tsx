import { APP_VERSION } from "@/lib/config";

/** AURA OS is the platform; Aura Battles is the headline mode (solo scan is one mode inside it). */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`wordmark ${compact ? "wordmark--compact" : ""}`}>
      <h1 className="wordmark__title font-heading uppercase">AURA BATTLES</h1>
      <p className="wordmark__sub font-mono uppercase">AURA OS {APP_VERSION} · SOCIAL OUTFIT BATTLE ENVIRONMENT</p>
    </div>
  );
}
