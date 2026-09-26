"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Web Audio synthesized kiosk sounds (all original, no clips):
 * charge-up hum, aura impact hit, sad descending tones, slot machine ticks.
 * The AudioContext unlocks on the first key press or pointer event.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode; lfo: OscillatorNode } | null = null;
  private mutedFlag = false;
  /** 0..1, the kiosk master volume (+ / - keys). */
  private volume = 1;

  private level(): number {
    return this.mutedFlag ? 0 : 0.8 * this.volume;
  }

  /** The shared AudioContext (the kiosk music plays through it too). */
  context(): AudioContext | null {
    return this.ensure();
  }

  private ensure(): AudioContext | null {
    if (typeof window === "undefined" || !("AudioContext" in window)) return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.level();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call from a user gesture to unlock audio (Web Audio and the browser voice). */
  unlock(): void {
    this.ensure();
    // Chrome also gates speechSynthesis on a gesture: a silent utterance inside one opens it.
    if (typeof speechSynthesis !== "undefined" && !this.speechPrimed) {
      this.speechPrimed = true;
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  }
  private speechPrimed = false;

  /**
   * Whether the browser will play sound yet. Chrome blocks audio until the
   * page gets a click or key press (camera gestures do not count), unless it
   * was started with --autoplay-policy=no-user-gesture-required.
   */
  audioAllowed(): boolean {
    if (typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive) return true;
    return this.ensure()?.state === "running";
  }

  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
  }

  /** Low hum that rises while charging / analyzing. */
  startHum(rising = true): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.hum) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    filter.Q.value = 6;
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    osc2.frequency.value = 110.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(filter.frequency);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.master);
    const t = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(0.18, t + 0.4);
    if (rising) {
      osc1.frequency.exponentialRampToValueAtTime(110, t + 6);
      osc2.frequency.exponentialRampToValueAtTime(221, t + 6);
      filter.frequency.linearRampToValueAtTime(900, t + 6);
    }
    osc1.start();
    osc2.start();
    lfo.start();
    this.hum = { osc: [osc1, osc2], gain, filter, lfo };
  }

  stopHum(): void {
    const ctx = this.ctx;
    if (!ctx || !this.hum) return;
    const h = this.hum;
    this.hum = null;
    const t = ctx.currentTime;
    h.gain.gain.cancelScheduledValues(t);
    h.gain.gain.setTargetAtTime(0, t, 0.12);
    setTimeout(() => {
      h.osc.forEach((o) => o.stop());
      h.lfo.stop();
    }, 600);
  }

  /** Impact on the aura reveal: noise burst + sub thump. */
  hit(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    noise.buffer = buf;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    noise.connect(nf).connect(ng).connect(this.master);
    noise.start(t);
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.9, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    sub.connect(sg).connect(this.master);
    sub.start(t);
    sub.stop(t + 0.65);
  }

  /** Sad descending tones for a negative aura. */
  sad(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const notes = [392, 311, 262, 185];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.38;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.94, t + 0.36);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  /** Slot machine tick as a clothing slot locks. */
  tick(index = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 900 + index * 120;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  /** Bright chime for a claimed card or a new aura king. */
  chime(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  }
}

export function useSoundEngine(muted: boolean): SoundEngine {
  const engine = useMemo(() => new SoundEngine(), []);
  useEffect(() => {
    engine.setMuted(muted);
  }, [engine, muted]);
  useEffect(() => {
    const unlock = () => engine.unlock();
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [engine]);
  return engine;
}

/** False until the browser allows sound (see SoundEngine.audioAllowed). */
export function useAudioAllowed(engine: SoundEngine): boolean {
  const [allowed, setAllowed] = useState(true); // assume yes until checked (no flash on SSR)
  useEffect(() => {
    const check = () => setAllowed(engine.audioAllowed());
    check();
    // Re-check just after the gesture handlers above have run.
    const later = () => window.setTimeout(check, 50);
    window.addEventListener("keydown", later);
    window.addEventListener("pointerdown", later);
    return () => {
      window.removeEventListener("keydown", later);
      window.removeEventListener("pointerdown", later);
    };
  }, [engine]);
  return allowed;
}
