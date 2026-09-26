// Relay check: `npm run relay:check`. Exercises the kiosk relay (lib/server/relay.ts)
// against the Tiger database in .env.local: mirror status, remote commands, the
// challenger line and mirror launch requests. Test rows are removed afterwards.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { getRelay } = await import("../lib/server/relay");
  const { getScanStore } = await import("../lib/server/store");
  const relay = getRelay();
  console.log("kind", relay.kind);
  const pool = await (getScanStore() as unknown as { connection(): Promise<import("pg").Pool> }).connection();
  const ok = (label: string, cond: boolean) => console.log(cond ? "PASS" : "FAIL", label);
  try {
    const sample = { state: "READY", mode: "mirror", muted: false, camera: "live", people: 1, framing: "full", scansToday: 3, scan: null, lobby: null, battle: null, card: null } as never;
    await relay.setKioskStatus(sample);
    const st = await relay.kioskStatus();
    ok(`status round-trip (age ${st ? Date.now() - st.at : "-"} ms)`, !!st && st.state === "READY" && Date.now() - st.at < 3000);

    const c0 = (await relay.commandsSince(0)).cursor;
    const cmd = await relay.pushCommand("wave");
    const since = await relay.commandsSince(c0);
    ok("command visible after cursor", since.commands.some((c) => c.id === cmd.id && c.command === "wave") && since.cursor === cmd.id);
    ok("nothing after new cursor", (await relay.commandsSince(since.cursor)).commands.length === 0);

    const p1 = await relay.pushChallenge({ name: "RELAY TEST", target: 1234, cardId: "" });
    const p2 = await relay.pushChallenge({ name: "relay test", target: 1234, cardId: "" });
    ok(`challenger queued, no duplicate (pos ${p1.position}/${p2.position})`, p1.position === p2.position);
    const line = await relay.challenges();
    const me = line.find((c) => c.name === "RELAY TEST");
    ok("challenger in line", !!me && me.target === 1234);
    const called = await relay.callChallenge(me!.id);
    ok("call up", !!called && called.name === "RELAY TEST");
    ok("left the line", !(await relay.challenges()).some((c) => c.id === me!.id));
    ok("last called", (await relay.lastCalled())?.seq === called!.seq);

    const p3 = await relay.pushChallenge({ name: "RELAY TEST 2", target: 0, cardId: "" });
    const me2 = (await relay.challenges()).find((c) => c.name === "RELAY TEST 2");
    ok(`remove (pos ${p3.position})`, !!me2 && (await relay.removeChallenge(me2.id)) && !(await relay.removeChallenge(me2.id)));

    await relay.requestMirrorLaunch();
    ok("launch taken once", (await relay.takeMirrorLaunch()) && !(await relay.takeMirrorLaunch()));

    await pool.query(`DELETE FROM remote_commands WHERE id = $1`, [cmd.id]);
  } finally {
    await pool.query(`DELETE FROM challengers WHERE name IN ('RELAY TEST', 'RELAY TEST 2')`);
    await pool.query(`DELETE FROM kiosk_status WHERE id = 1`);
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
