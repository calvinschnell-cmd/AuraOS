import { beforeAll, describe, expect, it } from "vitest";
import { getRelay } from "@/lib/server/relay";

describe("kiosk relay (memory, MOCK MODE)", () => {
  beforeAll(() => {
    delete process.env.TIGER_DATABASE_URL;
  });

  it("uses this server's memory without Tiger Data", () => {
    expect(getRelay().kind).toBe("memory");
  });

  it("relays status, commands and the challenger line", async () => {
    const relay = getRelay();
    await relay.setKioskStatus({ state: "READY", mode: "mirror", muted: false, camera: "live", people: 0, framing: "none", scansToday: 0, scan: null, lobby: null, battle: null, card: null } as never);
    const status = await relay.kioskStatus();
    expect(status?.state).toBe("READY");
    expect(Date.now() - (status?.at ?? 0)).toBeLessThan(1000);

    const { cursor } = await relay.commandsSince(0);
    const cmd = await relay.pushCommand("reset");
    const since = await relay.commandsSince(cursor);
    expect(since.commands.map((c) => c.id)).toEqual([cmd.id]);

    const { position } = await relay.pushChallenge({ name: "Relay Walk-in", target: 0, cardId: "" });
    const line = await relay.challenges();
    expect(line[position - 1]?.name).toBe("Relay Walk-in");
    const called = await relay.callChallenge(line[position - 1].id);
    expect(called?.name).toBe("Relay Walk-in");
    expect((await relay.lastCalled())?.seq).toBe(called?.seq);
    expect((await relay.challenges()).some((c) => c.name === "Relay Walk-in")).toBe(false);
  });

  it("carries a settings change with its command", async () => {
    const relay = getRelay();
    const { cursor } = await relay.commandsSince(0);
    await relay.pushCommand("settings", { cameraRotation: 180, voiceVolume: 0.4 });
    await relay.pushCommand("soundtest");
    const { commands } = await relay.commandsSince(cursor);
    expect(commands.map((c) => [c.command, c.settings])).toEqual([
      ["settings", { cameraRotation: 180, voiceVolume: 0.4 }],
      ["soundtest", undefined],
    ]);
  });

  it("never takes a mirror launch request without a shared database", async () => {
    const relay = getRelay();
    await expect(relay.requestMirrorLaunch()).rejects.toThrow();
    expect(await relay.takeMirrorLaunch()).toBe(false);
  });
});
