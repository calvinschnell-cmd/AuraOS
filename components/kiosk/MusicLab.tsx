"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { AdminKeyGate, useAdminKey } from "@/components/admin/AdminKeyGate";
import { auraCallout, useAnnouncer } from "@/lib/kiosk/announcer";
import { fetchLoop, useKioskMusic } from "@/lib/kiosk/music";
import { DEFAULT_LOOP, formatLoopTime, parseLoop, type MusicLoop } from "@/lib/kiosk/musicLoop";
import { REACTIONS, REACTION_SFX, reactionFor } from "@/lib/kiosk/reactionTiers";
import { useReactions } from "@/lib/kiosk/reactions";
import { useSoundEngine } from "@/lib/kiosk/sound";

const same = (a: MusicLoop, b: MusicLoop) => a.start === b.start && a.end === b.end;
const round = (s: number) => Math.round(s * 100) / 100;
/** How far before the loop end "HEAR THE SEAM" starts. */
const SEAM_LEAD_S = 4;

function LoopPoint({
  label,
  value,
  max,
  onChange,
  onPlayhead,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (s: number) => void;
  onPlayhead: () => void;
}) {
  return (
    <div className="music-lab__point">
      <div className="music-lab__point-row font-mono text-[11px] uppercase">
        <span className="music-lab__point-label">{label}</span>
        <span className="font-number music-lab__point-time">{formatLoopTime(value)}</span>
        <input
          type="number"
          className="tool-page__input music-lab__seconds"
          value={value}
          min={0}
          max={max}
          step={0.01}
          onChange={(e) => onChange(round(Number(e.target.value)))}
          aria-label={`${label} in seconds`}
        />
        <span>S</span>
      </div>
      <input type="range" className="music-lab__range" min={0} max={max} step={0.01} value={value} onChange={(e) => onChange(round(Number(e.target.value)))} aria-label={label} />
      <div className="music-lab__buttons">
        <button type="button" className="tool-page__button" onClick={() => onChange(round(Math.max(0, value - 0.1)))}>
          [−0.1 S]
        </button>
        <button type="button" className="tool-page__button" onClick={() => onChange(round(Math.min(max, value + 0.1)))}>
          [+0.1 S]
        </button>
        <button type="button" className="tool-page__button" onClick={onPlayhead}>
          [SET = PLAYHEAD]
        </button>
      </div>
    </div>
  );
}

/**
 * Developer page for the kiosk music, with the real engine: set where the
 * background track loops (live while it plays), hear the seam, SAVE it for
 * the mirror (/api/music-loop, ADMIN_KEY), and check the jingle and ducking.
 */
export function MusicLab() {
  const [volume, setVolume] = useState(0.8);
  const announcer = useAnnouncer(false);
  const sound = useSoundEngine(false);
  const music = useKioskMusic({ sound, announcer, state: "READY", muted: false, volume });
  const admin = useAdminKey();
  const reactions = useReactions(sound);
  const [clipsReady, setClipsReady] = useState(false);
  const [pos, setPos] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [length, setLength] = useState<number | null>(null);
  const [draft, setDraft] = useState<MusicLoop>(DEFAULT_LOOP);
  const [saved, setSaved] = useState<MusicLoop>(DEFAULT_LOOP);
  const [status, setStatus] = useState("CLICK ANY BUTTON TO START AUDIO.");
  const [askKey, setAskKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchLoop().then(({ loop }) => {
      if (cancelled) return;
      setDraft(loop);
      setSaved(loop);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    announcer.setVolume(volume);
    sound.setVolume(volume);
  }, [announcer, sound, volume]);

  // Playhead + track length readout.
  useEffect(() => {
    const id = window.setInterval(() => {
      setPos(music.position());
      setPaused(music.paused);
      setLength(music.trackLength);
    }, 100);
    return () => window.clearInterval(id);
  }, [music]);

  // + / - volume, except while typing a number.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "+" || e.key === "=") setVolume((v) => Math.min(1, Math.round((v + 0.1) * 10) / 10));
      if (e.key === "-" || e.key === "_") setVolume((v) => Math.max(0, Math.round((v - 0.1) * 10) / 10));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = useCallback(async () => {
    sound.unlock();
    await music.load();
    if (music.trackLength === null) setStatus("NO MUSIC FILE: PUT kiosk-bg.flac IN public/audio/.");
  }, [music, sound]);

  const max = length ?? 120;
  const valid = parseLoop(draft, length ?? undefined);

  /** Edit one end of the loop; a valid loop applies to the playing track at once. */
  const edit = (patch: Partial<MusicLoop>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const loop = parseLoop(next, length ?? undefined);
    if (loop) music.setLoop(loop);
  };

  const hearSeam = async () => {
    await start();
    const loop = valid ?? saved;
    music.setLoop(loop);
    music.seek(Math.max(loop.start, loop.end - SEAM_LEAD_S));
    setStatus(`PLAYING ${SEAM_LEAD_S} S BEFORE ${formatLoopTime(loop.end)}: IT WRAPS TO ${formatLoopTime(loop.start)}.`);
  };

  const save = async () => {
    if (!valid) return setStatus("FIX THE LOOP FIRST: START BEFORE END, AT LEAST 1 S APART.");
    if (!admin.verified) {
      setAskKey(true);
      return setStatus("UNLOCK WITH ADMIN_KEY TO SAVE.");
    }
    const res = await fetch("/api/music-loop", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": admin.key }, body: JSON.stringify(valid) });
    const body = (await res.json().catch(() => ({}))) as { loop?: MusicLoop; error?: string };
    if (res.ok && body.loop) {
      setSaved(body.loop);
      setDraft(body.loop);
      setStatus(`SAVED ${formatLoopTime(body.loop.start)} → ${formatLoopTime(body.loop.end)}. THE MIRROR PICKS IT UP WITHIN 30 S.`);
    } else setStatus(body.error ?? `SAVE FAILED (${res.status}).`);
  };

  const seekTo = async (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - box.left) / box.width) * max;
    await start();
    music.seek(t);
  };

  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / max) * 100))}%`;
  const dirty = !same(draft, saved);

  return (
    <main className="tool-page aura-grid-bg">
      <div className="os-window os-window--light tool-page__window music-lab__window">
        <header className="os-window__title">
          <span>MUSIC_LAB.EXE</span>
          <span>x</span>
        </header>
        <div className="os-window__body music-lab">
          <div className="music-lab__time font-number">
            {pos === null ? "-:--.-" : formatLoopTime(pos)}
            <span className="music-lab__dim">
              {" "}
              / TRACK {length ? formatLoopTime(length) : "?"}
            </span>
          </div>

          <div className="music-lab__track" onClick={(e) => void seekTo(e)} title="Click to play from here" role="presentation">
            <div className="music-lab__region" style={{ left: pct(draft.start), width: `calc(${pct(draft.end)} - ${pct(draft.start)})` }} />
            {pos !== null && <div className="music-lab__head" style={{ left: pct(pos) }} />}
          </div>
          <div className="font-mono text-[11px] uppercase">
            PLAYS 0:00 → {formatLoopTime(draft.end)}, THEN LOOPS {formatLoopTime(draft.start)} → {formatLoopTime(draft.end)} · CLICK THE BAR TO SEEK
          </div>

          <LoopPoint label="LOOP START" value={draft.start} max={max} onChange={(s) => edit({ start: s })} onPlayhead={() => pos !== null && edit({ start: round(pos) })} />
          <LoopPoint label="LOOP END" value={draft.end} max={max} onChange={(s) => edit({ end: s })} onPlayhead={() => pos !== null && edit({ end: round(pos) })} />
          {!valid && <p className="music-lab__warn font-mono text-[11px] uppercase">START MUST BE BEFORE END, AT LEAST 1 S APART (NOT APPLIED).</p>}

          <div className="music-lab__buttons">
            <button
              type="button"
              className="tool-page__button music-lab__save-btn"
              onClick={() =>
                void start().then(() => {
                  if (music.paused) music.resume();
                  else music.pause();
                  setPaused(music.paused);
                })
              }
            >
              [{paused ? "▶ RESUME" : "⏸ PAUSE"}]
            </button>
            <button type="button" className="tool-page__button" onClick={() => void hearSeam()}>
              [⏭ HEAR THE SEAM]
            </button>
            <button type="button" className="tool-page__button" onClick={() => void start().then(() => music.seek(0))}>
              [▶ FROM 0:00]
            </button>
            <button type="button" className="tool-page__button" onClick={() => void start().then(() => music.playJingle())}>
              [♪ JINGLE]
            </button>
            <button
              type="button"
              className="tool-page__button"
              onClick={() =>
                void start().then(() => {
                  setStatus("RESULT: JINGLE FIRST, THEN THE VOICE; THE LOOP STAYS DOWN UNTIL THE VOICE IS DONE.");
                  if (music.hasJingle) void announcer.interlude(() => music.playJingle());
                  announcer.say(auraCallout(128_400), 450);
                  announcer.sound(() => reactions.play(reactionFor(128_400)), 200);
                })
              }
            >
              [★ FULL RESULT]
            </button>
          </div>

          <div className="music-lab__reactions">
            <span className="font-heading text-[10px]">CROWD REACTIONS (AFTER THE AURA IS SAID)</span>
            <div className="music-lab__buttons">
              {REACTIONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="tool-page__button"
                  onClick={() =>
                    void start()
                      .then(() => reactions.load())
                      .then(() => {
                        setClipsReady(true);
                        reactions.play(name);
                      })
                  }
                >
                  [{REACTION_SFX[name].label}
                  {clipsReady ? (reactions.hasClip(name) ? " · CLIP" : " · SYNTH") : ""}]
                </button>
              ))}
            </div>
          </div>

          <div className="music-lab__save">
            <span className={`font-heading text-[10px] ${dirty ? "music-lab__warn" : ""}`}>
              {dirty ? "UNSAVED CHANGES" : `SAVED · ${formatLoopTime(saved.start)} → ${formatLoopTime(saved.end)}`}
            </span>
            <div className="music-lab__buttons">
              <button type="button" className="tool-page__button music-lab__save-btn" onClick={() => void save()} disabled={!dirty || !valid}>
                [SAVE]
              </button>
              <button
                type="button"
                className="tool-page__button"
                disabled={!dirty}
                onClick={() => {
                  setDraft(saved);
                  music.setLoop(saved);
                }}
              >
                [REVERT]
              </button>
              <button type="button" className="tool-page__button" onClick={() => edit(DEFAULT_LOOP)}>
                [DEFAULT 0:00 → 1:22]
              </button>
            </div>
          </div>
          {askKey && !admin.verified && (
            <AdminKeyGate
              value={admin.key}
              onChange={admin.setKey}
              onSubmit={() => {
                void admin.verify();
              }}
              error={admin.error}
            />
          )}

          <label className="music-lab__volume font-mono text-[11px] uppercase">
            VOLUME {Math.round(volume * 100)}% (+ / -)
            <input type="range" min={0} max={1} step={0.1} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </label>
          <p className="font-mono text-[11px] uppercase opacity-70">{status}</p>
        </div>
      </div>
    </main>
  );
}
