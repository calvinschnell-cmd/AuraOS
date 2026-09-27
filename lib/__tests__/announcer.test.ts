import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Announcer } from "@/lib/kiosk/announcer";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fake browser voice: each utterance "speaks" for 30 ms; cancel() ends the current one early. */
function installFakeVoice() {
  const spoken: string[] = [];
  let active: { onend?: () => void } | null = null;
  const g = globalThis as Record<string, unknown>;
  g.SpeechSynthesisUtterance = class {
    text: string;
    onend?: () => void;
    onerror?: () => void;
    constructor(text: string) {
      this.text = text;
    }
  };
  g.speechSynthesis = {
    getVoices: () => [],
    addEventListener: () => undefined,
    speak(u: { text: string; onend?: () => void }) {
      spoken.push(u.text);
      active = u;
      setTimeout(() => {
        if (active === u) active = null;
        u.onend?.();
      }, 30);
    },
    cancel() {
      const u = active;
      active = null;
      u?.onend?.();
    },
  };
  return spoken;
}

describe("announcer stop", () => {
  let spoken: string[];
  beforeEach(() => {
    spoken = installFakeVoice();
  });
  afterEach(() => {
    const g = globalThis as Record<string, unknown>;
    delete g.speechSynthesis;
    delete g.SpeechSynthesisUtterance;
  });

  it("drops the rest of the line being spoken and never runs two voices at once", async () => {
    const a = new Announcer();
    a.say(["one", "two", "three"], 5);
    await sleep(10);
    expect(spoken).toEqual(["one"]);

    a.stop(); // the session ended mid-line
    a.say(["new session"], 5);
    await sleep(250);

    // Before the fix the old item kept going ("two", "three") alongside the new line.
    expect(spoken).toEqual(["one", "new session"]);
    expect(a.busy).toBe(false);
  });
});
