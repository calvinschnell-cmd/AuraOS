import { describe, expect, it } from "vitest";
import { GREETINGS } from "@/lib/copy";
import { VOICE_PROMPTS } from "@/lib/copy/voicePrompts";
import { createRng } from "@/lib/prng";
import { createPromptPicker, nudgeFor } from "@/lib/kiosk/useVoicePrompts";

describe("spoken prompts", () => {
  it("never repeats the same variant twice in a row", () => {
    const rng = createRng("prompts");
    const pick = createPromptPicker(() => rng.next());
    let last = "";
    for (let i = 0; i < 50; i++) {
      const line = pick("ready");
      expect(VOICE_PROMPTS.ready).toContain(line);
      expect(line).not.toBe(last);
      last = line;
    }
  });

  it("tells people the actual gestures", () => {
    expect(VOICE_PROMPTS.ready.join(" ")).toMatch(/deuces|double peace/i);
    expect(VOICE_PROMPTS.resultActions.every((l) => /thumbs up/i.test(l))).toBe(true);
    expect(VOICE_PROMPTS.personSeen.join(" ")).toMatch(/wassup/i);
  });

  it("greetings are hellos only (the deuces prompt follows right after)", () => {
    for (const g of GREETINGS) expect(g).not.toMatch(/peace|deuces/i);
  });

  it("only nudges while idle or ready, battle first", () => {
    expect(nudgeFor("SPINNING", "step_back", false)).toBe("stepBack");
    expect(nudgeFor("READY", "step_closer", false)).toBe("comeCloser");
    expect(nudgeFor("READY", "step_back", true)).toBe("battleWaiting");
    expect(nudgeFor("READY", "full", false)).toBeNull();
    expect(nudgeFor("RESULT", "step_back", true)).toBeNull();
    expect(nudgeFor("COUNTDOWN", "step_back", false)).toBeNull();
  });
});
