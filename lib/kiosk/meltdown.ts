/**
 * Wave meltdown tracker (pure). Waving is a gimmick, not a step: every wave
 * gets a "hi" back, and each one before the next scan gets a little less
 * enthusiastic. It counts waves since the last scan (the caller resets it
 * when a scan or battle starts, and when the mirror goes idle):
 *   1     the greeting (full hype)
 *   2-3   "hi again", "yeah, hi"    (smaller waves back)
 *   4     "tired"                   (a flat "...hi.")
 *   5     "annoyed"                 (arms crossed, foot tapping, anger mark)
 *   6     "sulk"                    (turns its back and sits)
 * Once sulking, `resumeMs` without a wave ends the sulk; the very next wave
 * after that sulks again straight away.
 */

export interface MeltdownConfig {
  /** Wave counts (since the last scan) where each level starts. */
  tiredAt: number;
  annoyedAt: number;
  sulkAt: number;
  resumeMs: number;
}

export const DEFAULT_MELTDOWN: MeltdownConfig = {
  tiredAt: 4,
  annoyedAt: 5,
  sulkAt: 6,
  resumeMs: 3000,
};

export type MeltdownSignal = "tired" | "annoyed" | "sulk" | null;

export interface WaveOutcome {
  /** Waves since the last scan, this one included. */
  count: number;
  /** Level change, if this wave caused one. */
  signal: MeltdownSignal;
}

export class MeltdownTracker {
  private count = 0;
  private lastWaveAt = 0;
  private level: 0 | 1 | 2 | 3 = 0;

  constructor(private readonly cfg: MeltdownConfig = DEFAULT_MELTDOWN) {}

  get waves(): number {
    return this.count;
  }

  /** A wave happened at `t`. */
  onWave(t: number): WaveOutcome {
    this.count++;
    this.lastWaveAt = t;
    const c = this.count;
    let signal: MeltdownSignal = null;
    if (this.level < 3 && c >= this.cfg.sulkAt) {
      this.level = 3;
      signal = "sulk";
    } else if (this.level < 2 && c >= this.cfg.annoyedAt) {
      this.level = 2;
      signal = "annoyed";
    } else if (this.level < 1 && c >= this.cfg.tiredAt) {
      this.level = 1;
      signal = "tired";
    }
    return { count: c, signal };
  }

  /** Called periodically while sulking; true when the waving has stopped long enough. */
  shouldResume(t: number): boolean {
    return this.level === 3 && t - this.lastWaveAt >= this.cfg.resumeMs;
  }

  /** The sulk ended: still annoyed, so one more wave sulks again. */
  resumed(): void {
    if (this.level === 3) this.level = 2;
  }

  /** A scan or battle started, or the mirror went idle: back to full hype. */
  reset(): void {
    this.count = 0;
    this.lastWaveAt = 0;
    this.level = 0;
  }
}
