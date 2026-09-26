"use client";

import { useState } from "react";
import { clientId } from "@/lib/companion/identity";
import { REACTIONS } from "@/lib/feed/types";

/** Tap-to-react (one per emoji per phone). Optimistic, then the server's counts. */
export function Reactions({ cardId, initial, compact = false }: { cardId: string; initial: Record<string, number>; compact?: boolean }) {
  const [counts, setCounts] = useState(initial);
  const [mine, setMine] = useState<Set<string>>(() => new Set());
  // The last tap: restarts the pop + "+1" (the key changes every tap).
  const [pop, setPop] = useState<{ emoji: string; n: number } | null>(null);
  const react = async (emoji: string) => {
    if (mine.has(emoji)) return;
    setMine((m) => new Set(m).add(emoji));
    setPop((p) => ({ emoji, n: (p?.n ?? 0) + 1 }));
    setCounts((c) => ({ ...c, [emoji]: (c[emoji] ?? 0) + 1 }));
    try {
      const res = await fetch(`/api/feed/${cardId}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji, clientId: clientId() }) });
      const body = (await res.json()) as { reactions?: Record<string, number> };
      if (body.reactions) setCounts(body.reactions);
    } catch {
      // keep the optimistic count
    }
  };
  return (
    <div className={`reactions ${compact ? "reactions--compact" : ""}`}>
      {REACTIONS.map((emoji) => {
        const popping = pop?.emoji === emoji;
        return (
          <button
            key={popping ? `${emoji}-${pop.n}` : emoji}
            type="button"
            className={`reactions__btn ${mine.has(emoji) ? "reactions__btn--mine" : ""} ${popping ? "reactions__btn--pop" : ""}`}
            onClick={(e) => {
              // Inside a feed row link: react without opening the result.
              e.preventDefault();
              e.stopPropagation();
              void react(emoji);
            }}
            aria-label={`React ${emoji}`}
            aria-pressed={mine.has(emoji)}
          >
            <span aria-hidden>{emoji}</span>
            <span className="reactions__n">{counts[emoji] ?? 0}</span>
            {popping && (
              <span className="reactions__plus font-heading" aria-hidden>
                +1
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
