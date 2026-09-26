"use client";

import { useEffect, useState } from "react";
import { SLOTS, costumeLabel } from "@/lib/clothing/types";
import type { KioskViewProps } from "./props";

export function DebugOverlay(p: KioskViewProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const { session } = p;
  const o = session.outfit;
  return (
    <aside className="debug-overlay">
      <div className="debug-overlay__title">DEBUG</div>
      <dl>
        <dt>state</dt>
        <dd>
          {p.state} ({((now - p.enteredAt) / 1000).toFixed(1)}s)
        </dd>
        <dt>fps</dt>
        <dd>{p.fps}</dd>
        <dt>mode</dt>
        <dd>
          {p.mode} / flip {p.settings.flipFeed ? "on" : "off"} / perf {p.settings.performanceMode ? "on" : "off"}
        </dd>
        <dt>camera</dt>
        <dd>
          {p.camera.status}
          {p.camera.error ? `: ${p.camera.error}` : ""}
        </dd>
        <dt>analysis</dt>
        <dd>{p.mockMode ? "MOCK (no OPENAI_API_KEY)" : (p.usage?.model ?? "openai")}</dd>
        <dt>openai today</dt>
        <dd>
          {p.usage
            ? `${p.usage.callsToday} calls / ${p.usage.scansToday} scans (cap ${p.usage.cap}) · in ${p.usage.promptTokens} out ${p.usage.outputTokens} think ${p.usage.thoughtTokens} · ~$${p.usage.estimatedSpendUsd.toFixed(4)} · ${p.usage.store}`
            : "loading..."}
        </dd>
        <dt>camera mount</dt>
        <dd>rotate {p.settings.cameraRotation}° (O cycles)</dd>
        <dt>database</dt>
        <dd>{p.databaseConfigured ? "tiger data" : "memory"}</dd>
        <dt>session</dt>
        <dd>
          #{session.id} {session.locked ? "locked" : "rolling"} / wave {session.waveSide ?? "-"} x{session.waveTick} / idol{" "}
          {session.idolPoseIndex ?? "-"} / greet {session.greetingIndex ?? "-"} / roasts {session.roastCount} / meltdown {session.meltdown}
          {session.lobby || session.battle ? ` / battle (${session.lobby?.mode ?? session.battle?.mode})` : ""}
          {session.card ? ` / card ${session.card.id.slice(0, 8)}` : ""}
        </dd>
        <dt>tide chart</dt>
        <dd>
          {p.leaderboard.snapshot
            ? `${p.leaderboard.snapshot.top.length} entries · ${p.leaderboard.snapshot.totalToday} scans today · ${p.leaderboard.snapshot.store} · kings ${p.leaderboard.kingTick}`
            : p.leaderboard.error
              ? "unavailable"
              : "loading"}
        </dd>
        <dt>fit seed</dt>
        <dd>{o.seed}</dd>
        <dt>fit theme</dt>
        <dd>
          {o.theme}
          {o.wildcards.length ? ` (+${o.wildcards.join(", ")})` : ""}
        </dd>
        <dt>costume</dt>
        <dd>
          {costumeLabel(o)}
          {p.generateOptions.costume ? ` (forced: ${p.generateOptions.costume}, C to cycle)` : ""}
        </dd>
        {SLOTS.map((slot) => (
          <DebugSlot key={slot} label={slot} type={`${o[slot].type}${o[slot].pattern !== "solid" ? ` ${o[slot].pattern}` : ""}`} fit={o[slot].fit} color={o[slot].primary} />
        ))}
        <dt>scan</dt>
        <dd>
          {session.scan
            ? `${session.scan.id.slice(0, 8)} aura ${session.scan.aura} rank ${session.scan.rank.position}/${session.scan.rank.total} ${session.scan.cached ? "cached" : ""} ${session.scan.mock ? "mock" : ""} hash ${session.scan.image.hash.slice(0, 8)}`
            : "-"}
        </dd>
        <dt>gestures</dt>
        <dd>
          {p.gestures.status} · detect {p.gestures.debug.detectFps} fps · people {p.gestures.debug.personCount} · waves {p.gestures.debug.waveReversals} rev
          {p.gestures.debug.cooldownMs > 0 ? ` · cooldown ${(p.gestures.debug.cooldownMs / 1000).toFixed(1)}s` : ""}
          {p.gestures.debug.lastEvent ? ` · last ${p.gestures.debug.lastEvent}` : ""}
        </dd>
        <dt>hands</dt>
        <dd>
          {p.gestures.debug.hands.length === 0
            ? "none"
            : p.gestures.debug.hands.map((h) => `${h.handedness[0]}${h.person}:${h.gesture} ${Math.round(h.score * 100)}%`).join(" · ")}
        </dd>
        <dt>ring</dt>
        <dd>{p.gestures.debug.progress.gesture ? `${p.gestures.debug.progress.gesture} ${Math.round(p.gestures.debug.progress.value * 100)}%` : "-"}</dd>
        <dt>keys</dt>
        <dd>Space scan / W wave / B battle / R reset / M mute / D debug / S settings / U N P thumbs+palm / C force costume / O rotate camera / T toggle mode</dd>
      </dl>
    </aside>
  );
}

function DebugSlot({ label, type, fit, color }: { label: string; type: string; fit: string; color: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        <span className="debug-swatch" style={{ background: color }} aria-hidden /> {type} / {fit}
      </dd>
    </>
  );
}
