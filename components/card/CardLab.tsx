"use client";

import { useEffect, useState } from "react";
import { computeOutcome } from "@/lib/battle/score";
import { grainDataUrl } from "@/lib/card/render";
import { FIXTURES } from "@/lib/fixtures";
import { makeQrDataUrl } from "@/lib/kiosk/qr";
import type { BattleResult, ScanResult } from "@/lib/kiosk/types";
import { POSE_MODEL } from "@/lib/pose/model";
import { scorePose } from "@/lib/pose/score";
import { MOCK_POSES, jitteredSnapshot } from "@/lib/pose/synthetic";
import { gptJudge, scoreScan } from "@/lib/scoring";
import { ShareCardView, type ShareCardProps } from "./ShareCardView";

/** A plain silhouette photo stand-in (no real people in dev samples). */
function silhouette(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${hue},25%,18%)"/><circle cx="150" cy="80" r="38" fill="#d8d8d4"/><rect x="95" y="125" width="110" height="130" fill="hsl(${hue},55%,55%)"/><rect x="100" y="255" width="45" height="120" fill="#3a3c40"/><rect x="155" y="255" width="45" height="120" fill="#3a3c40"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function sampleScan(i: number): ScanResult {
  const analysis = FIXTURES[i % FIXTURES.length];
  const breakdown = scoreScan(analysis, [gptJudge(analysis, "gpt-4o-mini")]);
  return {
    id: `sample-${i}`,
    analysis,
    aura: breakdown.aura,
    breakdown,
    rank: { position: i + 2, total: 41 },
    capturedAt: 0,
    image: { dataUrl: silhouette(i * 67), width: 300, height: 400, hash: `h${i}`, placeholder: true },
    cached: false,
    mock: true,
  };
}

function sampleBattle(n: number): BattleResult {
  const poses = Object.values(MOCK_POSES);
  const scans = Array.from({ length: n }, (_, i) => sampleScan(i + (n > 2 ? 1 : 0)));
  const outcome = computeOutcome(
    n > 2 ? "squad" : "duel",
    scans.map((s, i) => ({
      slot: i,
      scanId: s.id,
      nickname: s.analysis.nickname,
      fitAura: s.aura,
      pose: scorePose(POSE_MODEL, jitteredSnapshot(poses[(i * 2 + 1) % poses.length], `lab${i}`), "mock"),
      topStyle: s.analysis.style_mix[0]?.style ?? null,
      cohesion: s.breakdown.cohesionScore,
    })),
  );
  return {
    ...outcome,
    id: `battle-${n}`,
    commentary:
      n > 2
        ? "Certified multiverse crossover episode, and the group chat knows it.\nP1: The racing jacket did the heavy lifting."
        : "Drip check goes to Player 1's racing jacket, but Player 2 hit a superhero stance like the camera owed them money. Player 1's fit was stronger, but that pose sealed it.",
    createdAt: new Date(0).toISOString(),
    capturedAt: 0,
    players: outcome.players.map((p, i) => ({ ...p, scan: scans[i] })),
  };
}

/** Dev tool (/card-lab): the three card modes side by side, for design iteration. */
export function CardLab() {
  const [cards, setCards] = useState<ShareCardProps[]>([]);
  useEffect(() => {
    void (async () => {
      const url = "https://aura.example.tech/r/00000000-0000-4000-8000-000000000000";
      const qr = await makeQrDataUrl(url);
      const grain = grainDataUrl();
      const scan = sampleScan(0);
      const duel = sampleBattle(2);
      const squad = sampleBattle(4);
      const photos = (b: BattleResult) => Object.fromEntries(b.players.map((p) => [p.slot, p.scan.image.dataUrl]));
      setCards([
        { kind: "scan", scan, photo: scan.image.dataUrl, qr, pageUrl: url, grain },
        { kind: "battle", battle: duel, photos: photos(duel), qr, pageUrl: url, grain },
        { kind: "squad", battle: squad, photos: photos(squad), qr, pageUrl: url, grain },
      ]);
    })();
  }, []);
  return (
    <main className="card-lab aura-grid-bg">
      {cards.map((c) => (
        <div key={c.kind} className="card-lab__slot">
          <ShareCardView {...c} />
        </div>
      ))}
    </main>
  );
}
