"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KioskStatus } from "@/lib/kiosk/status";
import { DEFAULT_SETTINGS, type RemoteSettings } from "@/lib/kiosk/types";

/** Slider drags are coalesced into one command this often. */
const SEND_AFTER_MS = 200;
/** Changes sent from here override what the mirror reports for this long (it confirms them within a few polls). */
const PENDING_TTL_MS = 6_000;

type Pending = { patch: Partial<RemoteSettings>; at: number };

/**
 * The mirror's camera and sound settings as /admin shows them: what the
 * mirror last reported, with changes sent from here shown right away until
 * the mirror reports them back (commands and status each take a poll).
 * `now` is the dashboard's one-second clock.
 */
function useRemoteSettings(adminKey: string, status: KioskStatus | null, now: number) {
  const [pending, setPending] = useState<Pending>({ patch: {}, at: 0 });
  const [error, setError] = useState<string | null>(null);
  const outbox = useRef<Partial<RemoteSettings>>({});
  const timer = useRef(0);
  const reported = status?.settings ?? null;

  const flush = useCallback(async () => {
    const settings = outbox.current;
    outbox.current = {};
    if (Object.keys(settings).length === 0) return;
    try {
      const res = await fetch("/api/remote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ command: "settings", settings }),
      });
      setError(res.ok ? null : `NOT SENT (${res.status})`);
    } catch {
      setError("COULD NOT REACH THE SERVER.");
    }
  }, [adminKey]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const set = useCallback(
    (patch: Partial<RemoteSettings>) => {
      setPending((p) => ({ patch: { ...(Date.now() - p.at < PENDING_TTL_MS ? p.patch : {}), ...patch }, at: Date.now() }));
      outbox.current = { ...outbox.current, ...patch };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SEND_AFTER_MS);
    },
    [flush],
  );

  const values: RemoteSettings | null = reported ? { ...reported, ...(now - pending.at < PENDING_TTL_MS ? pending.patch : {}) } : null;
  return { values, set, error };
}

function Offline({ status }: { status: KioskStatus | null }) {
  return (
    <div className="op-note op-warn">
      {status ? "THIS MIRROR IS TOO OLD TO REPORT ITS SETTINGS: RELOAD IT." : "MIRROR OFFLINE: OPEN IT TO CHANGE THESE."}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Slider({ id, label, value, min = 0, max = 1, step = 0.05, format = pct, onChange }: { id: string; label: string; value: number; min?: number; max?: number; step?: number; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <span className="op-form__range">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="font-number op-form__value">{format(value)}</span>
      </span>
    </>
  );
}

function Check({ id, label, text, checked, onChange }: { id: string; label: string; text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <label className="op-form__check" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {text}
      </label>
    </>
  );
}

/** Which camera the mirror uses and how its feed is shown. */
export function CameraPanel({ adminKey, status, now }: { adminKey: string; status: KioskStatus | null; now: number }) {
  const { values: v, set, error } = useRemoteSettings(adminKey, status, now);
  if (!status || !v) return <Offline status={status} />;
  const cameras = status.cameras ?? [];
  const known = v.cameraDeviceId === null || cameras.some((c) => c.id === v.cameraDeviceId);
  return (
    <>
      <div className="op-form">
        <label htmlFor="op-camera">CAMERA</label>
        <select id="op-camera" className="op-input" value={v.cameraDeviceId ?? ""} onChange={(e) => set({ cameraDeviceId: e.target.value || null })}>
          <option value="">DEFAULT (USER FACING)</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          {!known && <option value={v.cameraDeviceId ?? ""}>SAVED CAMERA (NOT CONNECTED)</option>}
        </select>

        <label htmlFor="op-rotation">MOUNT</label>
        <select id="op-rotation" className="op-input" value={v.cameraRotation} onChange={(e) => set({ cameraRotation: Number(e.target.value) as RemoteSettings["cameraRotation"] })}>
          <option value={0}>UPRIGHT (0°)</option>
          <option value={90}>SIDEWAYS, ROTATE 90°</option>
          <option value={180}>UPSIDE DOWN (180°)</option>
          <option value={270}>SIDEWAYS, ROTATE 270°</option>
        </select>

        <label htmlFor="op-fit">FEED FIT</label>
        <select id="op-fit" className="op-input" value={v.feedFit} onChange={(e) => set({ feedFit: e.target.value === "cover" ? "cover" : "contain" })}>
          <option value="contain">FULL FRAME (LETTERBOX)</option>
          <option value="cover">FILL SCREEN (CROPS EDGES)</option>
        </select>

        <Check id="op-flip" label="FEED" text="MIRROR THE LIVE FEED" checked={v.flipFeed} onChange={(flipFeed) => set({ flipFeed })} />
      </div>
      <div className={`op-note ${status.camera === "live" ? "" : "op-warn"}`}>
        CAMERA {status.camera.toUpperCase()} · {cameras.length} FOUND
        {cameras.length === 0 ? " (THE MIRROR LISTS CAMERAS ONCE IT HAS CAMERA ACCESS)" : ""}
      </div>
      {error && <div className="op-note op-warn">{error}</div>}
    </>
  );
}

/** Everything the mirror plays: levels per channel, mutes, the announcer's voice, and what is missing. */
export function SoundPanel({ adminKey, status, now }: { adminKey: string; status: KioskStatus | null; now: number }) {
  const { values: v, set, error } = useRemoteSettings(adminKey, status, now);
  const [tested, setTested] = useState<string | null>(null);
  if (!status || !v) return <Offline status={status} />;
  const audio = status.audio;
  const voices = audio?.voices ?? [];

  const test = async () => {
    const res = await fetch("/api/remote", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify({ command: "soundtest" }) });
    setTested(res.ok ? "TEST SENT: THE MIRROR SHOULD CHIME AND SAY “SOUND CHECK”." : `NOT SENT (${res.status})`);
  };

  return (
    <>
      {audio && !audio.unlocked && !v.muted && (
        <div className="op-banner op-banner--inline font-mono">
          THE MIRROR&apos;S BROWSER IS BLOCKING SOUND UNTIL SOMEONE CLICKS OR PRESSES A KEY ON IT (CHROME&apos;S AUTOPLAY RULE). CLICK THE MIRROR ONCE, OR START IT WITH <b>NPM RUN KIOSK:LAUNCH</b>, WHICH TURNS THE RULE OFF.
        </div>
      )}

      <div className="op-form">
        <Check id="op-mute" label="ALL SOUND" text="MUTE EVERYTHING" checked={v.muted} onChange={(muted) => set({ muted })} />
        <Slider id="op-master" label="MASTER" value={v.volume} onChange={(volume) => set({ volume })} />

        <Check id="op-music-mute" label="MUSIC" text="MUTE MUSIC" checked={v.musicMuted} onChange={(musicMuted) => set({ musicMuted })} />
        <Slider id="op-music" label="MUSIC LEVEL" value={v.musicVolume} onChange={(musicVolume) => set({ musicVolume })} />

        <Check id="op-voice-mute" label="VOICE" text="MUTE ANNOUNCER" checked={v.voiceMuted} onChange={(voiceMuted) => set({ voiceMuted })} />
        <Slider id="op-voice" label="JUDGE VOICE" value={v.voiceVolume} onChange={(voiceVolume) => set({ voiceVolume })} />

        <Slider id="op-fx" label="EFFECTS" value={v.effectsVolume} onChange={(effectsVolume) => set({ effectsVolume })} />

        <label htmlFor="op-voice-name">BROWSER VOICE</label>
        <select id="op-voice-name" className="op-input" value={v.voiceName ?? ""} onChange={(e) => set({ voiceName: e.target.value || null })}>
          <option value="">AUTO (ANNOUNCER DEFAULT)</option>
          {voices.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {v.voiceName && !voices.includes(v.voiceName) && <option value={v.voiceName}>{v.voiceName} (NOT ON THIS MIRROR)</option>}
        </select>
        <Slider id="op-rate" label="VOICE SPEED" value={v.voiceRate} min={0.5} max={1.6} step={0.02} format={(x) => `${x.toFixed(2)}×`} onChange={(voiceRate) => set({ voiceRate })} />
        <Slider id="op-pitch" label="VOICE PITCH" value={v.voicePitch} min={0} max={2} step={0.02} format={(x) => x.toFixed(2)} onChange={(voicePitch) => set({ voicePitch })} />
      </div>

      <div className="op-add">
        <button type="button" className="op-btn op-btn--go" onClick={() => void test()}>
          🔊 TEST SOUND
        </button>
        <button
          type="button"
          className="op-btn"
          onClick={() =>
            set({
              volume: DEFAULT_SETTINGS.volume,
              musicVolume: DEFAULT_SETTINGS.musicVolume,
              voiceVolume: DEFAULT_SETTINGS.voiceVolume,
              effectsVolume: DEFAULT_SETTINGS.effectsVolume,
              voiceName: DEFAULT_SETTINGS.voiceName,
              voiceRate: DEFAULT_SETTINGS.voiceRate,
              voicePitch: DEFAULT_SETTINGS.voicePitch,
            })
          }
        >
          RESET LEVELS + VOICE
        </button>
      </div>
      {tested && <div className="op-note">{tested}</div>}
      {error && <div className="op-note op-warn">{error}</div>}

      {audio && (
        <dl className="op-facts op-facts--sound">
          <div>
            <dt>SOUND</dt>
            <dd className={audio.unlocked ? "" : "op-warn"}>{audio.unlocked ? "UNLOCKED ✓" : "BLOCKED"}</dd>
          </div>
          <div>
            <dt>MUSIC FILE</dt>
            <dd className={audio.music ? "" : "op-warn"}>{audio.music ? "LOADED ✓" : "MISSING"}</dd>
          </div>
          <div>
            <dt>RESULT JINGLE</dt>
            <dd className={audio.jingle ? "" : "op-warn"}>{audio.jingle ? "LOADED ✓" : "MISSING"}</dd>
          </div>
          <div>
            <dt>CROWD CLIPS</dt>
            <dd className={audio.crowdClips === audio.crowdTotal ? "" : "op-dim"}>
              {audio.crowdClips}/{audio.crowdTotal}
              {audio.crowdClips < audio.crowdTotal ? " (REST SYNTHESIZED)" : ""}
            </dd>
          </div>
          <div>
            <dt>BROWSER VOICES</dt>
            <dd className={voices.length ? "" : "op-warn"}>{voices.length}</dd>
          </div>
        </dl>
      )}
      {audio && (!audio.music || !audio.jingle) && (
        <div className="op-note">
          MUSIC FILES ARE NOT IN GIT: COPY KIOSK-BG.FLAC AND RESULT-JINGLE.FLAC INTO PUBLIC/AUDIO/ ON THE MIRROR&apos;S MACHINE, THEN RELOAD THE MIRROR.
        </div>
      )}
    </>
  );
}
