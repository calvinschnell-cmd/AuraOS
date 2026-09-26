"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Announcer } from "./announcer";
import type { SoundEngine } from "./sound";
import type { KioskState } from "./types";

/**
 * Kiosk music (the mirror only): a quiet background loop and a short jingle
 * when a result lands. The files live on the kiosk laptop in public/audio/
 * and are gitignored (not ours to redistribute), so a server without them,
 * like the public deploy, just stays silent.
 *
 * Nothing talks over anything: the loop fades out while the voice queue is
 * working, during the scan hum and during the jingle, and only fades back in
 * after the voice has been quiet for a moment. The jingle waits for the line
 * being spoken to finish, and lines queued meanwhile wait for the jingle
 * (Announcer.interlude).
 */

const BG_URL = "/audio/kiosk-bg.flac";
const JINGLE_URL = "/audio/result-jingle.flac";
/** The loop is the first 1:22 of the track (the rest is its ending). */
const BG_LOOP_END_S = 82;
/** Quiet: under the room, never over the voice. */
const BG_LEVEL = 0.12;
const JINGLE_LEVEL = 0.5;
/** Fade out fast when something starts talking; come back slowly, and only after a pause. */
const DUCK_TC_S = 0.12;
const RETURN_TC_S = 0.9;
const RETURN_AFTER_VOICE_MS = 1_500;

/** States with their own sound (the charge hum, the countdown, judging): no music under them. */
const QUIET_STATES: ReadonlySet<KioskState> = new Set(["CHARGING", "COUNTDOWN", "ANALYZING", "LOBBY_COUNTDOWN", "BATTLE_INTRO"]);

async function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private bgGain: GainNode | null = null;
  private bgSource: AudioBufferSourceNode | null = null;
  private bg: AudioBuffer | null = null;
  private jingle: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  private volume = 1;
  private muted = false;
  /** Why the loop is down right now ("voice", "scan", "jingle"); it plays only when empty. */
  private ducks = new Set<string>();

  constructor(private readonly getContext: () => AudioContext | null) {}

  /** Bumped by stop(): a load still in flight from before must not start the loop. */
  private generation = 0;
  private buffers: Promise<[AudioBuffer | null, AudioBuffer | null]> | null = null;

  /** Build the graph and start the loop; the files are fetched and decoded once (missing file = no music). */
  load(): Promise<void> {
    this.loading ??= (async () => {
      const gen = this.generation;
      const ctx = this.getContext();
      if (!ctx) return;
      this.ctx = ctx;
      this.out = ctx.createGain();
      this.out.gain.value = this.outLevel();
      this.out.connect(ctx.destination);
      this.bgGain = ctx.createGain();
      this.bgGain.gain.value = 0;
      this.bgGain.connect(this.out);
      this.buffers ??= Promise.all([loadBuffer(ctx, BG_URL), loadBuffer(ctx, JINGLE_URL)]);
      [this.bg, this.jingle] = await this.buffers;
      if (gen === this.generation) this.startLoop();
    })();
    return this.loading;
  }

  get hasJingle(): boolean {
    return this.jingle !== null;
  }

  private outLevel(): number {
    return this.muted ? 0 : this.volume;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.outLevel(), this.ctx.currentTime, 0.05);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.outLevel(), this.ctx.currentTime, 0.05);
  }

  duck(reason: string, on: boolean): void {
    if (on) this.ducks.add(reason);
    else this.ducks.delete(reason);
    this.applyBgLevel();
  }

  private applyBgLevel(): void {
    if (!this.bgGain || !this.ctx) return;
    const down = this.ducks.size > 0;
    const now = this.ctx.currentTime;
    this.bgGain.gain.cancelScheduledValues(now);
    this.bgGain.gain.setTargetAtTime(down ? 0 : BG_LEVEL, now, down ? DUCK_TC_S : RETURN_TC_S);
  }

  /** Where the loop was started: context time, and the track position it started from. */
  private loopStartedAt = { ctxTime: 0, offset: 0 };

  private startLoop(offset = 0): void {
    if (!this.ctx || !this.bg || !this.bgGain || this.bgSource) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.bg;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = this.loopEnd;
    source.connect(this.bgGain);
    source.start(0, offset);
    this.bgSource = source;
    this.loopStartedAt = { ctxTime: this.ctx.currentTime, offset };
    this.applyBgLevel();
  }

  get loopEnd(): number {
    return Math.min(BG_LOOP_END_S, this.bg?.duration ?? BG_LOOP_END_S);
  }

  get trackLength(): number | null {
    return this.bg?.duration ?? null;
  }

  /** Current position in the track (seconds, wraps at the loop point); null before it plays. */
  position(): number | null {
    if (!this.ctx || !this.bgSource) return null;
    const t = this.loopStartedAt.offset + (this.ctx.currentTime - this.loopStartedAt.ctxTime);
    return t < this.loopEnd ? t : t % this.loopEnd;
  }

  /** Restart the loop from a track position (the music lab uses it to hear the seam). */
  seek(seconds: number): void {
    try {
      this.bgSource?.stop();
    } catch {
      // not started
    }
    this.bgSource?.disconnect();
    this.bgSource = null;
    this.startLoop(Math.max(0, Math.min(seconds, this.loopEnd - 0.05)));
  }

  /** Play the result jingle now; returns its length in ms (null: no jingle file). */
  playJingle(): number | null {
    if (!this.ctx || !this.jingle || !this.out) return null;
    const gain = this.ctx.createGain();
    gain.gain.value = JINGLE_LEVEL;
    gain.connect(this.out);
    const source = this.ctx.createBufferSource();
    source.buffer = this.jingle;
    source.connect(gain);
    this.duck("jingle", true);
    source.onended = () => {
      gain.disconnect();
      this.duck("jingle", false);
    };
    source.start();
    return Math.round(this.jingle.duration * 1000);
  }

  /** Silence and tear down the graph (load() builds it again; decoded files are kept). */
  stop(): void {
    this.generation += 1;
    try {
      this.bgSource?.stop();
    } catch {
      // never started
    }
    this.bgSource = null;
    this.out?.disconnect();
    this.out = null;
    this.bgGain = null;
    this.loading = null;
  }
}

/**
 * The kiosk's music, wired to its voice and state: ducks under every voice
 * line (back after RETURN_AFTER_VOICE_MS of quiet), sits out the scan states,
 * follows mute and the master volume.
 */
export function useKioskMusic({ sound, announcer, state, muted, volume }: { sound: SoundEngine; announcer: Announcer; state: KioskState; muted: boolean; volume: number }): MusicEngine {
  const music = useMemo(() => new MusicEngine(() => sound.context()), [sound]);

  useEffect(() => {
    void music.load();
    return () => music.stop();
  }, [music]);

  useEffect(() => music.setMuted(muted), [music, muted]);
  useEffect(() => music.setVolume(volume), [music, volume]);
  useEffect(() => music.duck("scan", QUIET_STATES.has(state)), [music, state]);

  const returnTimer = useRef(0);
  useEffect(() => {
    const onBusy = (busy: boolean) => {
      window.clearTimeout(returnTimer.current);
      if (busy) music.duck("voice", true);
      else returnTimer.current = window.setTimeout(() => music.duck("voice", false), RETURN_AFTER_VOICE_MS);
    };
    onBusy(announcer.busy);
    const off = announcer.onBusyChange(onBusy);
    return () => {
      off();
      window.clearTimeout(returnTimer.current);
    };
  }, [music, announcer]);

  return music;
}
