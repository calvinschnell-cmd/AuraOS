"use client";

import { useEffect, useState } from "react";
import { auraCallout, useAnnouncer } from "@/lib/kiosk/announcer";
import { useKioskMusic } from "@/lib/kiosk/music";
import { useSoundEngine } from "@/lib/kiosk/sound";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;

/**
 * Developer page to check the kiosk music with the real engine: the loop
 * point (jump just before 1:22 and hear it wrap to 0:00), the result jingle,
 * and ducking under a voice line (the same flow as a solo result).
 */
export function MusicLab() {
  const [volume, setVolume] = useState(0.8);
  const announcer = useAnnouncer(false);
  const sound = useSoundEngine(false);
  const music = useKioskMusic({ sound, announcer, state: "READY", muted: false, volume });
  const [pos, setPos] = useState<number | null>(null);
  const [wraps, setWraps] = useState(0);
  const [status, setStatus] = useState("CLICK ANY BUTTON TO START AUDIO.");

  useEffect(() => {
    announcer.setVolume(volume);
    sound.setVolume(volume);
  }, [announcer, sound, volume]);

  // Playhead readout; count the wraps so the seam is visible.
  useEffect(() => {
    let last = 0;
    const id = window.setInterval(() => {
      const p = music.position();
      if (p !== null && p < last - 1) setWraps((w) => w + 1);
      last = p ?? 0;
      setPos(p);
    }, 100);
    return () => window.clearInterval(id);
  }, [music]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") setVolume((v) => Math.min(1, Math.round((v + 0.1) * 10) / 10));
      if (e.key === "-" || e.key === "_") setVolume((v) => Math.max(0, Math.round((v - 0.1) * 10) / 10));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = async () => {
    sound.unlock();
    await music.load();
    if (music.trackLength === null) setStatus("NO MUSIC FILE: PUT kiosk-bg.flac IN public/audio/.");
    else setStatus("PLAYING.");
  };

  const jumpBeforeSeam = async () => {
    await start();
    music.seek(music.loopEnd - 5);
    setStatus(`JUMPED TO ${clock(music.loopEnd - 5)}: LISTEN FOR THE WRAP TO 0:00 AT ${clock(music.loopEnd)}.`);
  };

  const fakeResult = async () => {
    await start();
    const aura = 128_400;
    setStatus("RESULT: JINGLE FIRST, THEN THE VOICE; THE LOOP STAYS DOWN UNTIL THE VOICE IS DONE.");
    if (music.hasJingle) void announcer.interlude(() => music.playJingle());
    announcer.say(auraCallout(aura), 450);
  };

  const loopEnd = music.loopEnd;
  const pct = pos === null ? 0 : (pos / loopEnd) * 100;

  return (
    <main className="tool-page aura-grid-bg">
      <div className="os-window os-window--light tool-page__window">
        <header className="os-window__title">
          <span>MUSIC_LAB.EXE</span>
          <span>x</span>
        </header>
        <div className="os-window__body music-lab">
          <div className="music-lab__time font-number">
            {pos === null ? "--:--.-" : clock(pos)} <span className="music-lab__dim">/ LOOP AT {clock(loopEnd)}</span>
          </div>
          <div className="music-lab__track" aria-hidden>
            <div className="music-lab__head" style={{ left: `${pct}%` }} />
          </div>
          <div className="font-mono text-[11px] uppercase">
            TRACK {music.trackLength ? clock(music.trackLength) : "?"} · LOOPS 0:00 → {clock(loopEnd)} · WRAPS HEARD: {wraps}
          </div>
          <div className="music-lab__buttons">
            <button type="button" className="tool-page__button" onClick={() => void start().then(() => music.seek(0))}>
              [▶ PLAY FROM 0:00]
            </button>
            <button type="button" className="tool-page__button" onClick={() => void jumpBeforeSeam()}>
              [⏭ 5 S BEFORE THE LOOP POINT]
            </button>
            <button type="button" className="tool-page__button" onClick={() => void start().then(() => music.playJingle())}>
              [♪ RESULT JINGLE]
            </button>
            <button type="button" className="tool-page__button" onClick={() => void fakeResult()}>
              [★ FULL RESULT: JINGLE + VOICE + DUCK]
            </button>
          </div>
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
