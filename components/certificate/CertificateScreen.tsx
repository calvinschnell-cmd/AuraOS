"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { generateOutfit } from "@/lib/clothing/generator";
import { EVENT_NAME } from "@/lib/config";
import { makeQrDataUrl } from "@/lib/kiosk/qr";
import type { Rank } from "@/lib/kiosk/types";
import { MannequinScene } from "@/lib/mannequin/scene";
import { SLUMP_POSE, THUMBS_UP_POSE } from "@/lib/poses";
import type { Analysis } from "@/lib/schema";
import { formatAura, judgeName, type ScoreBreakdown } from "@/lib/scoring";

interface ScanPayload {
  id: string;
  analysis: Analysis;
  breakdown: ScoreBreakdown;
  aura: number;
  rank: Rank;
  createdAt: string;
}

/**
 * Aura Certificate: black-and-white AURA OS window with the session's
 * mannequin as line art. Posts "aura-certificate-ready" to its opener when
 * everything is rendered so the kiosk can print it.
 */
export function CertificateScreen({ scanId, publicBaseUrl = null }: { scanId: string; publicBaseUrl?: string | null }) {
  const search = useSearchParams();
  const seed = search.get("seed") ?? scanId;
  const cardId = search.get("card");
  const playerName = search.get("name");
  const playerHandle = search.get("handle");
  const [scan, setScan] = useState<ScanPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    fetch(`/api/scans/${scanId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("NOT FOUND");
        setScan((await r.json()) as ScanPayload);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "UNAVAILABLE"));
  }, [scanId]);

  useEffect(() => {
    if (cardId) makeQrDataUrl(`${publicBaseUrl ?? window.location.origin}/r/${cardId}`, 320).then(setQr).catch(() => setQr(null));
  }, [cardId, publicBaseUrl]);

  // Line art: edges-mode render of the locked fit in its final pose, then inverted to black.
  useEffect(() => {
    if (!scan || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const scene = new MannequinScene(canvas, { mode: "edges", performanceMode: true });
    scene.setOutfit(generateOutfit(seed));
    scene.setYaw(0);
    scene.setIdle(0);
    scene.setTextBand(false);
    scene.setManualPose(scan.aura < 0 ? SLUMP_POSE : THUMBS_UP_POSE);
    const id = window.setTimeout(() => {
      try {
        setArt(scene.snapshot());
      } finally {
        scene.dispose();
      }
    }, 400);
    return () => {
      window.clearTimeout(id);
      scene.dispose();
    };
  }, [scan, seed]);

  const ready = Boolean(scan && art && (!cardId || qr));
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => window.parent?.postMessage({ type: "aura-certificate-ready" }, "*"), 150);
    return () => window.clearTimeout(id);
  }, [ready]);

  if (error) return <main className="cert cert--error">CERTIFICATE UNAVAILABLE: {error}</main>;
  if (!scan) return <main className="cert cert--loading">PREPARING CERTIFICATE...</main>;
  const a = scan.analysis;
  const b = scan.breakdown;
  const date = new Date(scan.createdAt);

  return (
    <main className="cert">
      <canvas ref={canvasRef} className="cert__canvas" width={900} height={1200} aria-hidden />
      <div className="cert__window">
        <header className="cert__title">
          <span>CERTIFICATE_OF_AURA.EXE</span>
          <span>x</span>
        </header>
        <div className="cert__body">
          <h1 className="cert__heading">CERTIFICATE OF AURA</h1>
          <p className="cert__sub">THE AURA DEPARTMENT HEREBY CERTIFIES THE FOLLOWING FIT.</p>
          <div className="cert__columns">
            <div className="cert__art">
              {art && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={art} alt="" className="cert__art-img" />
              )}
            </div>
            <div className="cert__details">
              <div className="cert__nick">{(playerName || a.nickname).toUpperCase()}</div>
              {playerHandle && <div className="cert__handle">AURA ID: {playerHandle}</div>}
              <table className="cert__table">
                <thead>
                  <tr>
                    <th>ITEM</th>
                    <th>EST. PRICE</th>
                    <th>UNIQ</th>
                  </tr>
                </thead>
                <tbody>
                  {a.items.map((i, k) => (
                    <tr key={k}>
                      <td>
                        {i.name.toUpperCase()}
                        {i.is_statement_piece ? " ★" : ""}
                      </td>
                      <td>${Math.round(i.estimated_price_usd).toLocaleString("en-US")}</td>
                      <td>{Math.round(i.uniqueness)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="cert__table">
                <tbody>
                  {b.modifiers.map((m, k) => (
                    <tr key={k}>
                      <td>
                        [{m.tier.toUpperCase()}] {m.label.toUpperCase()}
                      </td>
                      <td colSpan={2} className="cert__num">
                        {m.emoji}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>FIT VALUE</td>
                    <td colSpan={2} className="cert__num">
                      ${b.fitValue.toLocaleString("en-US")}
                    </td>
                  </tr>
                  <tr>
                    <td>COHESION</td>
                    <td colSpan={2} className="cert__num">
                      {b.cohesionScore}
                    </td>
                  </tr>
                  {(b.judges ?? []).map((j, i) => (
                    <tr key={j.judge}>
                      <td>{judgeName(i)}</td>
                      <td colSpan={2} className="cert__num">
                        {formatAura(j.aura, true)}
                      </td>
                    </tr>
                  ))}
                  {b.disagree && (
                    <tr>
                      <td colSpan={3}>THE JUDGES DISAGREE. OFFICIAL AURA IS THEIR AVERAGE.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="cert__aura">
            <span className="cert__label">TOTAL AURA</span>
            <span className="cert__aura-value">{formatAura(scan.aura)}</span>
            <span className="cert__rank">
              #{scan.rank.position} OF {scan.rank.total} FITS TODAY
            </span>
          </div>
          <div className="cert__verdict">&quot;{a.verdict}&quot;</div>
          <div className="cert__footer">
            <div>
              <div className="cert__label">DATE</div>
              <div>{date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</div>
              <div className="cert__label" style={{ marginTop: "0.6em" }}>
                SIGNED
              </div>
              <div className="cert__signature">The Aura Department</div>
              <div className="cert__label">{EVENT_NAME}</div>
            </div>
            {qr && (
              <div className="cert__qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR to your aura card" />
                <div className="cert__label">YOUR CARD</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
