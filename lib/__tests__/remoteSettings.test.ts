import { describe, expect, it } from "vitest";
import { parseSettingsPatch, pickRemoteSettings } from "@/lib/kiosk/remoteSettings";
import { DEFAULT_SETTINGS, REMOTE_SETTING_KEYS } from "@/lib/kiosk/types";

describe("remote kiosk settings (/admin CAMERA + SOUND)", () => {
  it("accepts valid camera and sound changes", () => {
    expect(parseSettingsPatch({ cameraDeviceId: "abc123", cameraRotation: 270, flipFeed: false, feedFit: "cover" })).toEqual({
      cameraDeviceId: "abc123",
      cameraRotation: 270,
      flipFeed: false,
      feedFit: "cover",
    });
    expect(parseSettingsPatch({ cameraDeviceId: null, voiceName: null })).toEqual({ cameraDeviceId: null, voiceName: null });
    expect(parseSettingsPatch({ volume: 0, musicVolume: 1, voiceVolume: 0.35, effectsVolume: 0.5, voiceRate: 1.2, voicePitch: 0 })).not.toBeNull();
    expect(parseSettingsPatch({ muted: true, musicMuted: false, voiceMuted: true, voiceName: "Microsoft David" })).not.toBeNull();
  });

  it("rejects empty, unknown or out-of-range changes", () => {
    for (const bad of [
      null,
      "volume",
      [],
      {},
      { volume: 1.5 },
      { volume: Number.NaN },
      { musicVolume: -0.1 },
      { cameraRotation: 45 },
      { feedFit: "stretch" },
      { flipFeed: "yes" },
      { cameraDeviceId: "" },
      { voiceRate: 3 },
      { textScale: 2 },
      { volume: 0.5, printingEnabled: true },
    ]) {
      expect(parseSettingsPatch(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("reports exactly the remotely settable keys", () => {
    const picked = pickRemoteSettings(DEFAULT_SETTINGS);
    expect(Object.keys(picked).sort()).toEqual([...REMOTE_SETTING_KEYS].sort());
    expect(parseSettingsPatch(picked)).toEqual(picked);
  });
});
