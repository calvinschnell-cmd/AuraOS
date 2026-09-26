"use client";

import { useEffect, useMemo, useRef } from "react";
import { VOICE_CLIENT_TIMEOUT_MS } from "@/lib/config";

/**
 * Web Speech API announcer in an over-the-top ring announcer style. Each
 * line is its own utterance with a dramatic pause between them. Verdicts and
 * roasts go through sayPremium: an ElevenLabs clip (/api/voice), prefetched
 * when queued and played in order, falling back to the browser voice if it
 * is not back in time or fails. Audio never blocks anything else.
 */

/** ElevenLabs clip for a line, or null (voice off, slow, or failed). */
async function fetchVoiceClip(text: string): Promise<Blob | null> {
  try {
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(VOICE_CLIENT_TIMEOUT_MS),
    });
    if (res.status === 404) premiumVoiceOff = true; // no ELEVENLABS_API_KEY: stop asking this page load
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}
let premiumVoiceOff = false;

const PREFERRED = ["Google UK English Male", "Microsoft Guy", "Microsoft David", "Daniel", "Google US English", "Alex"];

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices();
  for (const name of PREFERRED) {
    const v = voices.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? voices[0] ?? null;
}

/** Hooks for a queued line: the kiosk syncs visuals to the voice (the squad countdown). */
export interface Cue {
  /** Silence before the line (a dramatic beat). */
  pauseMs?: number;
  /** Fires as the line starts: also when muted or voiceless, on an estimated timeline. */
  onStart?: () => void;
  onEnd?: () => void;
}

interface QueueItem extends Cue {
  lines: string[];
  gapMs: number;
  /** Premium (ElevenLabs) line: fetched a couple of items ahead, not all at once. */
  premium: boolean;
  clip?: Promise<Blob | null>;
}

/** Roughly how long a line takes to say (for silent cues). */
function estimateMs(lines: readonly string[]): number {
  const words = lines.join(" ").split(/\s+/).filter(Boolean).length;
  return 600 + words * 330;
}

/** Premium clips requested ahead of playback (a long countdown must not fire ten requests at once). */
const PREFETCH_AHEAD = 2;

export class Announcer {
  muted = false;
  private queue: QueueItem[] = [];
  private speaking = false;
  private audio: HTMLAudioElement | null = null;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof speechSynthesis !== "undefined") {
      this.voice = pickVoice();
      speechSynthesis.addEventListener?.("voiceschanged", () => {
        this.voice = pickVoice();
      });
    }
  }

  get available(): boolean {
    return typeof speechSynthesis !== "undefined";
  }

  /** Speak lines with a pause between each (dramatic pauses = separate utterances). */
  say(lines: string[], gapMs = 380): void {
    if (!this.available || this.muted) return;
    const clean = lines.map((l) => l.trim()).filter(Boolean);
    if (clean.length === 0) return;
    this.queue.push({ lines: clean, gapMs, premium: false });
    if (!this.speaking) void this.drain();
  }

  /**
   * Like say(), in the ElevenLabs voice when available (one clip for all
   * lines). With a cue, the line still "plays" silently when muted, so
   * anything synced to it keeps its pacing.
   */
  sayPremium(lines: string[], gapMs = 380, cue: Cue = {}): void {
    const hooked = Boolean(cue.onStart || cue.onEnd);
    if (this.muted && !hooked) return;
    const clean = lines.map((l) => l.trim()).filter(Boolean);
    if (clean.length === 0 && !hooked) return;
    this.queue.push({ lines: clean, gapMs, premium: true, ...cue });
    this.prefetch();
    if (!this.speaking) void this.drain();
  }

  /** Start fetching the clips of the next few premium items. */
  private prefetch(): void {
    for (const item of this.queue.slice(0, PREFETCH_AHEAD)) {
      if (item.premium && !item.clip && item.lines.length > 0 && !this.muted) item.clip = premiumVoiceOff ? Promise.resolve(null) : fetchVoiceClip(item.lines.join(" "));
    }
  }

  stop(): void {
    // Anything synced to queued lines still happens (all at once), so nothing is left half revealed.
    const pending = this.queue;
    this.queue = [];
    for (const item of pending) {
      item.onStart?.();
      item.onEnd?.();
    }
    if (this.available) speechSynthesis.cancel();
    this.audio?.pause();
    this.audio = null;
    this.speaking = false;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  private async drain(): Promise<void> {
    this.speaking = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.prefetch();
      if (item.pauseMs) await sleep(item.pauseMs);
      await this.speak(item);
    }
    this.speaking = false;
  }

  /** One queue item: its hooks around the clip, the browser voice, or (muted / voiceless) an estimated silence. */
  private async speak(item: QueueItem): Promise<void> {
    const hooked = Boolean(item.onStart || item.onEnd);
    const silent = async () => {
      item.onStart?.();
      if (hooked) await sleep(estimateMs(item.lines));
      item.onEnd?.();
    };
    if (this.muted || item.lines.length === 0) return silent();
    if (item.premium) {
      const clip = await (item.clip ?? (premiumVoiceOff ? Promise.resolve(null) : fetchVoiceClip(item.lines.join(" "))));
      if (this.muted) return silent();
      if (clip) {
        item.onStart?.();
        const played = await this.play(clip);
        if (played) {
          item.onEnd?.();
          return;
        }
        if (!this.available) return void item.onEnd?.();
        await this.utterAll(item);
        item.onEnd?.();
        return;
      }
    }
    if (!this.available) return silent();
    item.onStart?.();
    await this.utterAll(item);
    item.onEnd?.();
  }

  private async utterAll(item: QueueItem): Promise<void> {
    for (let i = 0; i < item.lines.length; i++) {
      if (this.muted) break;
      await this.utter(item.lines[i]);
      if (i < item.lines.length - 1) await sleep(item.gapMs);
    }
  }

  /** Play a clip to the end; false if the browser refused to play it (then the browser voice takes over). */
  private play(clip: Blob): Promise<boolean> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(clip);
      const audio = new Audio(url);
      this.audio = audio;
      let settled = false;
      const done = (played: boolean) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        if (this.audio === audio) this.audio = null;
        resolve(played);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.onpause = () => done(true); // stop() / mute
      audio.play().catch(() => done(false));
      setTimeout(() => done(true), 30_000); // safety: never hold the queue forever
    });
  }

  private utter(text: string): Promise<void> {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = 0.92;
      u.pitch = 0.72;
      u.volume = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
      // Safety: some browsers never fire onend for cancelled utterances.
      setTimeout(resolve, Math.min(15000, 2500 + text.length * 90));
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Ring-announcer phrasing for an aura number. */
export function auraCallout(aura: number): string[] {
  const n = Math.abs(aura).toLocaleString("en-US");
  if (aura <= -500_000) return ["Your aura is...", `negative ${n}.`, "Chat, we're cooked.", "Someone call the fashion police."];
  if (aura < 0) return ["Your aura is...", `negative ${n}.`, "That's rough, bro."];
  if (aura >= 500_000) return ["Your aura is...", `${n}!`, "Unbelievable scenes.", "Somebody frame this shit."];
  if (aura >= 150_000) return ["Your aura is...", `${n}!`, "That fit goes hard."];
  return ["Your aura is...", `${n}.`];
}

export function useAnnouncer(muted: boolean): Announcer {
  const announcer = useMemo(() => new Announcer(), []);
  const ref = useRef(announcer);
  useEffect(() => {
    ref.current.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    const a = ref.current;
    return () => a.stop();
  }, []);
  return announcer;
}
