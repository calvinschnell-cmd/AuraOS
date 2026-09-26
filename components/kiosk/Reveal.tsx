"use client";

import { useEffect, useState } from "react";
import { boxToPercent } from "@/lib/kiosk/reveal";
import { personMaskDataUrl } from "@/lib/kiosk/segment";
import type { ScanResult } from "@/lib/kiosk/types";
import type { Reveal } from "@/lib/kiosk/useReveal";
import { auraMagnitude, formatAura } from "@/lib/scoring";
import { JudgesPanel } from "./Judges";
import { StatRows } from "./StatRows";

/**
 * Frozen captured photo with the aura glow (segmentation mask) and bounding
 * boxes drawing in one by one.
 */
export function RevealPhoto({ scan, reveal, glow }: { scan: ScanResult; reveal: Reveal; glow: boolean }) {
  const [mask, setMask] = useState<string | null>(null);
  const { state } = reveal;

  useEffect(() => {
    if (!glow) return;
    let cancelled = false;
    personMaskDataUrl(scan.image.dataUrl).then((m) => {
      if (!cancelled) setMask(m);
    });
    return () => {
      cancelled = true;
    };
  }, [glow, scan.image.dataUrl]);

  const items = scan.analysis.items;
  const held = scan.analysis.held_objects;
  const total = items.length + held.length;

  return (
    <div className="reveal-photo" style={{ aspectRatio: `${scan.image.width} / ${scan.image.height}` }}>
      {glow && mask && state.glow && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mask} alt="" className="reveal-photo__glow reveal-photo__glow--outer" aria-hidden />
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={scan.image.dataUrl} alt="Captured outfit" className="reveal-photo__img" />
      {glow && mask && state.glow && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mask} alt="" className="reveal-photo__glow reveal-photo__glow--inner" aria-hidden />
        </>
      )}
      {items.slice(0, state.boxesShown).map((item, i) => {
        const b = boxToPercent(item.box_2d);
        return (
          <div
            key={`item-${i}`}
            className={`reveal-box ${item.is_statement_piece ? "reveal-box--statement" : ""}`}
            style={{ top: `${b.top}%`, left: `${b.left}%`, width: `${b.width}%`, height: `${b.height}%` }}
          >
            <span className="reveal-box__label">
              {item.name.toUpperCase()} · UNIQ {Math.round(item.uniqueness)}
              {item.is_statement_piece ? " ★" : ""}
            </span>
          </div>
        );
      })}
      {held.slice(0, Math.max(0, state.boxesShown - items.length)).map((h, i) => {
        const b = boxToPercent(h.box_2d);
        return (
          <div
            key={`held-${i}`}
            className="reveal-box reveal-box--held"
            style={{ top: `${b.top}%`, left: `${b.left}%`, width: `${b.width}%`, height: `${b.height}%` }}
          >
            <span className="reveal-box__label">HOLDING: {h.name.toUpperCase()}</span>
          </div>
        );
      })}
      {state.boxesShown < total && <div className="reveal-photo__scanline" aria-hidden />}
      {scan.image.placeholder && <div className="reveal-photo__badge">PLACEHOLDER FRAME</div>}
    </div>
  );
}

/** Terminal lines, typed aura, stats, modifiers, rank and verdict. */
export function RevealPanel({ scan, reveal }: { scan: ScanResult; reveal: Reveal }) {
  const { state, timeline } = reveal;
  const a = scan.analysis;
  const b = scan.breakdown;
  const items = a.items;
  const held = a.held_objects;
  const lines: string[] = [
    ...items.slice(0, state.boxesShown).map((i) => `> DETECTED: ${i.name.toUpperCase()} ... UNIQ ${Math.round(i.uniqueness)}${i.is_statement_piece ? " *" : ""}`),
    ...held.slice(0, Math.max(0, state.boxesShown - items.length)).map((h) => `> HOLDING: ${h.name.toUpperCase()}`),
  ];
  if (!a.is_outfit_photo && state.boxesShown >= items.length + held.length) lines.push("> NO OUTFIT DETECTED. JUDGING WHAT WE CAN SEE.");
  const auraTyped = timeline.auraText.slice(0, state.auraChars);
  const auraDone = state.auraChars >= timeline.auraText.length;
  const magnitude = auraMagnitude(scan.aura);

  return (
    <div className="reveal-panel">
      <div className="terminal reveal-panel__terminal">
        {lines.map((line, i) => (
          <div key={i} className="terminal__line">
            {line}
          </div>
        ))}
        {lines.length === 0 && <div className="terminal__line">&gt; SCANNING FRAME...</div>}
      </div>

      {state.auraChars > 0 && (
        <div className={`reveal-aura reveal-aura--${magnitude} ${auraDone ? "reveal-aura--done" : ""}`}>
          <span className="reveal-aura__label">AURA</span>
          <span className="reveal-aura__value font-number">
            {auraTyped}
            {!auraDone && <span className="terminal__cursor" aria-hidden />}
          </span>
        </div>
      )}

      {state.stats && (
        <div className="reveal-stats">
          <div className="reveal-mix">
            {a.style_mix.map((m) => (
              <div key={m.style} className="reveal-mix__row">
                <span className="reveal-mix__name">{m.style}</span>
                <span className="reveal-mix__track">
                  <span className="reveal-mix__fill" style={{ width: `${m.percent}%` }} />
                </span>
                <span className="reveal-mix__pct">{Math.round(m.percent)}%</span>
              </div>
            ))}
          </div>
          <StatRows
            rows={[
              { label: "FIT VALUE", value: `$${b.fitValue.toLocaleString("en-US")}` },
              { label: "UNIQUENESS", value: String(b.avgUniqueness) },
              { label: "COHESION", value: String(b.cohesionScore) },
              { label: "STATEMENT", value: b.statementCount > 0 ? "★".repeat(b.statementCount) : "—" },
              ...(b.bummyPercent > 0 ? [{ label: "BUMMY", value: `${b.bummyPercent}%` }] : []),
            ]}
          />
        </div>
      )}

      {state.modifiersShown > 0 && (
        <div className="reveal-mods">
          {b.modifiers.slice(0, state.modifiersShown).map((m, i) => (
            <div key={i} className={`reveal-mod reveal-mod--${m.tier}`}>
              <span className="reveal-mod__tier">[{m.tier.toUpperCase()}]</span>
              <span className="reveal-mod__emoji" aria-hidden>
                {m.emoji}
              </span>
              <span className="reveal-mod__label">{m.label.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}

      {state.rank && (
        <div className="reveal-rank">
          <span className="reveal-rank__nick">{a.nickname.toUpperCase()}</span>
          <span className="reveal-rank__pos">
            #{scan.rank.position} OF {scan.rank.total} FITS TODAY
          </span>
        </div>
      )}

      {state.verdict && <JudgesPanel breakdown={b} verdict={a.verdict} />}

      {state.done && (
        <div className="reveal-foot">
          {scan.cached ? "CACHED RESULT · " : ""}
          {scan.mock ? "MOCK ANALYSIS · " : ""}
          AURA {formatAura(scan.aura)}
        </div>
      )}
    </div>
  );
}
