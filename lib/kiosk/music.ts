"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Announcer } from "./announcer";
import { DEFAULT_LOOP, parseLoop, type MusicLoop } from "./musicLoop";
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
/** How often the mirror re-reads the saved loop points (set in /music-lab). */
const LOOP_REFRESH_MS = 30_000;
/** Quiet: under the room, never over the voice. */
const BG_LEVEL = 0.12;
const JINGLE_LEVEL = 0.5;
/** Fade out fast when something starts talking; come back slowly, and only after a pause. */
const DUCK_TC_S = 0.12;
const RETURN_TC_S = 0.9;
const RETURN_AFTER_VOICE_MS = 1_500;

/** States with their own sound (the charge hum, the countdown, judging): no music under them. */
const QUIET_STATES: ReadonlySet<KioskState> = new Set(["CHARGING", "COUNTDOWN", "ANALYZING", "LOBBY_COUNTDOWN", "BATTLE_INTRO"]);

/** The saved loop points (the default when none were saved or the server is unreachable). */
export async function fetchLoop(): Promise<{ loop: MusicLoop; saved: boolean }> {
  try {
    const res = await fetch("/api/music-loop", { cache: "no-store" });
    const body = (await res.json()) as { loop?: unknown; saved?: boolean };
    const loop = parseLoop(body.loop);
    if (loop) return { loop, saved: Boolean(body.saved) };
  } catch {
    // offline: default
  }
  return { loop: DEFAULT_LOOP, saved: false };
}

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
      const [[bg, jingle], saved] = await Promise.all([this.buffers, fetchLoop()]);
      [this.bg, this.jingle] = [bg, jingle];
      this.loopPoints = saved.loop;
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

  /** Where the track loops ([start, end), seconds); the saved one replaces the default on load. */
  private loopPoints: MusicLoop = DEFAULT_LOOP;
  /** Anchor for position(): a context time and the track position playing at that time. */
  private anchor = { ctxTime: 0, offset: 0 };

  private startLoop(offset = 0): void {
    if (!this.ctx || !this.bg || !this.bgGain || this.bgSource) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.bg;
    source.loop = true;
    source.loopStart = this.loop.start;
    source.loopEnd = this.loop.end;
    source.connect(this.bgGain);
    source.start(0, offset);
    this.bgSource = source;
    this.anchor = { ctxTime: this.ctx.currentTime, offset };
    this.applyBgLevel();
  }

  /** The loop in effect, clamped to the track once it is loaded. */
  get loop(): MusicLoop {
    const length = this.bg?.duration;
    if (!length) return this.loopPoints;
    const end = Math.min(this.loopPoints.end, length);
    return { start: Math.min(this.loopPoints.start, Math.max(0, end - 1)), end };
  }

  get trackLength(): number | null {
    return this.bg?.duration ?? null;
  }

  /** Change the loop points, live: the playing source picks them up without a restart. */
  setLoop(loop: MusicLoop): void {
    const pos = this.position();
    this.loopPoints = loop;
    const { start, end } = this.loop;
    if (this.bgSource && this.ctx) {
      this.bgSource.loopStart = start;
      this.bgSource.loopEnd = end;
      // Past the new end, the source wraps to the new start right away.
      if (pos !== null) this.anchor = { ctxTime: this.ctx.currentTime, offset: pos < end ? pos : start };
    }
  }

  /** Re-read the saved loop (the mirror calls this every LOOP_REFRESH_MS). */
  async refreshLoop(): Promise<void> {
    const { loop } = await fetchLoop();
    const { start, end } = this.loopPoints;
    if (loop.start !== start || loop.end !== end) this.setLoop(loop);
  }

  /** Track position the loop was paused at (null: not paused). */
  private pausedAt: number | null = null;

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  /** Stop the loop where it is (resume() continues from there). */
  pause(): void {
    const at = this.position();
    if (at === null || this.pausedAt !== null) return;
    try {
      this.bgSource?.stop();
    } catch {
      // not started
    }
    this.bgSource?.disconnect();
    this.bgSource = null;
    this.pausedAt = at;
  }

  resume(): void {
    if (this.pausedAt === null) return;
    const at = this.pausedAt;
    this.pausedAt = null;
    this.startLoop(at);
  }

  /** Current position in the track (seconds, following the loop); null before it plays. */
  position(): number | null {
    if (this.pausedAt !== null) return this.pausedAt;
    if (!this.ctx || !this.bgSource) return null;
    const { start, end } = this.loop;
    const t = this.anchor.offset + (this.ctx.currentTime - this.anchor.ctxTime);
    return t < end ? t : start + ((t - end) % (end - start));
  }

  /** Restart the loop from a track position (the music lab uses it to hear the seam). */
  seek(seconds: number): void {
    this.pausedAt = null;
    try {
      this.bgSource?.stop();
    } catch {
      // not started
    }
    this.bgSource?.disconnect();
    this.bgSource = null;
    this.startLoop(Math.max(0, Math.min(seconds, this.loop.end - 0.05)));
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
    this.pausedAt = null;
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

  // A loop saved in /music-lab reaches the mirror without a reload.
  useEffect(() => {
    const id = window.setInterval(() => void music.refreshLoop(), LOOP_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [music]);

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
