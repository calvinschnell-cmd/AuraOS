"use client";

import { useEffect, useMemo } from "react";
import { REACTIONS, type Reaction } from "./reactionTiers";
import type { SoundEngine } from "./sound";

/** Crowd clips sit under the voice's loudness. */
const CLIP_LEVEL = 0.7;

/**
 * Crowd reactions after a solo aura (see reactionTiers.ts). Clips come from
 * /api/sfx/[name] (ElevenLabs sound effects, generated once per machine);
 * without them (MOCK MODE, offline) each one is synthesized, so the kiosk
 * always reacts. Everything plays through the effects master: MUTE ALL and
 * the + / - volume apply, MUTE MUSIC / MUTE VOICE do not.
 */
export class ReactionPlayer {
  private clips = new Map<Reaction, AudioBuffer>();
  private loading: Promise<void> | null = null;

  constructor(private readonly sound: SoundEngine) {}

  load(): Promise<void> {
    this.loading ??= (async () => {
      const ctx = this.sound.context();
      if (!ctx) return;
      await Promise.all(
        REACTIONS.map(async (name) => {
          try {
            const res = await fetch(`/api/sfx/${name}`);
            if (!res.ok) return;
            this.clips.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
          } catch {
            // synthesized instead
          }
        }),
      );
    })();
    return this.loading;
  }

  /** Is this reaction a real clip (vs synthesized)? */
  hasClip(name: Reaction): boolean {
    return this.clips.has(name);
  }

  /** Play one now; returns its length in ms (null: no audio). */
  play(name: Reaction): number | null {
    const ctx = this.sound.context();
    const out = this.sound.output();
    if (!ctx || !out) return null;
    const clip = this.clips.get(name);
    if (clip) {
      const gain = ctx.createGain();
      gain.gain.value = CLIP_LEVEL;
      gain.connect(out);
      const src = ctx.createBufferSource();
      src.buffer = clip;
      src.connect(gain);
      src.onended = () => gain.disconnect();
      src.start();
      return Math.round(clip.duration * 1000);
    }
    return Math.round(SYNTH[name](ctx, out) * 1000);
  }
}

// ---------------------------------------------------------------- synthesized fallbacks (seconds long)

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Crowd wash: band-passed noise with a swell. */
function crowd(ctx: AudioContext, out: AudioNode, t0: number, seconds: number, peak: number, centerHz: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = centerHz;
  band.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.25);
  g.gain.setValueAtTime(peak, t0 + seconds * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  src.connect(band).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + seconds);
}

/** Scattered claps: short high-passed noise ticks. */
function claps(ctx: AudioContext, out: AudioNode, t0: number, seconds: number, count: number, level: number): void {
  const tick = noiseBuffer(ctx, 0.03);
  for (let i = 0; i < count; i++) {
    const t = t0 + Math.random() * seconds * 0.8;
    const src = ctx.createBufferSource();
    src.buffer = tick;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1_200 + Math.random() * 1_500;
    const g = ctx.createGain();
    g.gain.value = level * (0.5 + Math.random() * 0.5);
    src.connect(hp).connect(g).connect(out);
    src.start(t);
  }
}

/** A few voices gliding between pitches through a vowel-ish filter ("wooo", "awww"). */
function voices(ctx: AudioContext, out: AudioNode, t0: number, seconds: number, from: number, to: number, vowelHz: number, level: number, n = 5): void {
  for (let i = 0; i < n; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const detune = 1 + (Math.random() - 0.5) * 0.12;
    const start = t0 + Math.random() * 0.12;
    osc.frequency.setValueAtTime(from * detune, start);
    osc.frequency.exponentialRampToValueAtTime(to * detune, start + seconds * 0.8);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5 + Math.random() * 2;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 6;
    vib.connect(vibGain).connect(osc.frequency);
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = vowelHz;
    formant.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(level / n, start + 0.15);
    g.gain.setValueAtTime(level / n, start + seconds * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(formant).connect(g).connect(out);
    osc.start(start);
    vib.start(start);
    osc.stop(start + seconds);
    vib.stop(start + seconds);
  }
}

const SYNTH: Record<Reaction, (ctx: AudioContext, out: AudioNode) => number> = {
  woo: (ctx, out) => {
    const t = ctx.currentTime;
    crowd(ctx, out, t, 2.8, 0.5, 1_400);
    claps(ctx, out, t, 2.8, 70, 0.35);
    voices(ctx, out, t, 2.4, 330, 520, 700, 0.5, 6);
    return 2.8;
  },
  cheer: (ctx, out) => {
    const t = ctx.currentTime;
    crowd(ctx, out, t, 2.2, 0.25, 1_600);
    claps(ctx, out, t, 2.2, 45, 0.3);
    return 2.2;
  },
  aww: (ctx, out) => {
    const t = ctx.currentTime;
    voices(ctx, out, t, 1.9, 420, 250, 850, 0.45, 5);
    crowd(ctx, out, t, 1.9, 0.06, 900);
    return 1.9;
  },
  flop: (ctx, out) => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 1);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 22;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 28;
    wobble.connect(wobbleGain).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.04);
    g.gain.setValueAtTime(0.6, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(lp).connect(g).connect(out);
    osc.start(t);
    wobble.start(t);
    osc.stop(t + 1.1);
    wobble.stop(t + 1.1);
    crowd(ctx, out, t, 1.1, 0.12, 300);
    return 1.1;
  },
  crickets: (ctx, out) => {
    const t = ctx.currentTime;
    // Two crickets, a little apart in pitch: bursts of 3-4 fast pulses, twice a second.
    for (const [hz, offset] of [
      [4_600, 0],
      [4_150, 0.23],
    ] as const) {
      for (let chirp = 0; chirp < 6; chirp++) {
        const pulses = 3 + (chirp % 2);
        for (let p = 0; p < pulses; p++) {
          const at = t + offset + chirp * 0.5 + p * 0.045;
          const osc = ctx.createOscillator();
          osc.frequency.value = hz;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.09, at + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
          osc.connect(g).connect(out);
          osc.start(at);
          osc.stop(at + 0.035);
        }
      }
    }
    return 3.1;
  },
};

/** One player per kiosk; clips load in the background at start. */
export function useReactions(sound: SoundEngine): ReactionPlayer {
  const player = useMemo(() => new ReactionPlayer(sound), [sound]);
  useEffect(() => {
    void player.load();
  }, [player]);
  return player;
}
