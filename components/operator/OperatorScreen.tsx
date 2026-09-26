"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminKeyGate, useAdminKey } from "@/components/admin/AdminKeyGate";
import { REMOTE_BUTTONS } from "@/components/remote/RemoteScreen";
import type { FeedEntry } from "@/lib/feed/types";
import { KIOSK_STATUS_STALE_MS, type KioskStatus } from "@/lib/kiosk/status";
import type { KioskState, RemoteCommandName, UsageStats } from "@/lib/kiosk/types";
import type { CalledChallenger, QueuedChallenger } from "@/lib/kiosk/useChallenges";
import { useLeaderboard } from "@/lib/kiosk/useLeaderboard";
import { handleName, rivalryLine } from "@/lib/leaderboard/narrative";
import { formatAura } from "@/lib/scoring";

/** What each kiosk state means to the person running the booth. */
const STATE_LABEL: Record<KioskState, string> = {
  BOOT: "BOOTING",
  SPINNING: "IDLE · WAITING FOR SOMEONE",
  ATTRACT: "ATTRACT MODE · NOBODY AROUND",
  LOCKING: "SAYING HI",
  GREETING: "SAYING HI",
  POSE_FOR_FANS: "SAYING HI",
  READY: "MENU · PICK A MODE",
  CHARGING: "SOLO SCAN · GET READY",
  COUNTDOWN: "SOLO SCAN · 3-2-1",
  ANALYZING: "SOLO SCAN · JUDGING",
  RESULT: "SOLO SCAN · RESULT ON SCREEN",
  NAME_ENTRY: "TYPING A NAME",
  CLAIM: "CARD READY · SCAN THE QR",
  LOBBY: "BATTLE LOBBY · PLAYERS STEPPING UP",
  LOBBY_COUNTDOWN: "BATTLE LOBBY · CAPTURING",
  BATTLE_INTRO: "VS SCREEN · SCORING",
  BATTLE_RESULT: "BATTLE RESULT ON SCREEN",
  SULKING: "SULKING (TOO MUCH WAVING)",
};

const POLL = { status: 1_000, queue: 3_000, stats: 10_000, feed: 8_000 };

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}S`;
  if (s < 3600) return `${Math.floor(s / 60)}M`;
  return `${Math.floor(s / 3600)}H`;
};

function usePoll<T>(url: string, everyMs: number): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok && !cancelled) setData((await res.json()) as T);
      } catch {
        // keep the last good data
      }
    };
    void load();
    const id = window.setInterval(load, everyMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [url, everyMs, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, reload };
}

function Win({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`os-window os-window--dark op-win ${className}`}>
      <header className="os-window__title">
        <span>{title}</span>
        <span>x</span>
      </header>
      <div className="os-window__body op-win__body">{children}</div>
    </section>
  );
}

/**
 * Open the mirror: full screen on the portrait monitor (the kiosk laptop runs
 * scripts/launch-kiosk.ps1), or as a window in this browser (one screen).
 */
function OpenMirror({ adminKey, live }: { adminKey: string; live: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const launch = async () => {
    setBusy(true);
    setMsg("OPENING THE MIRROR...");
    try {
      const res = await fetch("/api/operator/mirror", { method: "POST", headers: { "x-admin-key": adminKey } });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(res.ok ? "MIRROR OPENING ON THE PORTRAIT SCREEN (FIRST LOAD TAKES A FEW SECONDS)." : (body.error ?? `FAILED (${res.status}).`));
    } catch {
      setMsg("COULD NOT REACH THE SERVER.");
    } finally {
      setBusy(false);
    }
  };
  const here = () => window.open("/kiosk?mode=mirror", "aura-mirror", "popup,width=720,height=1280");
  return (
    <div className="op-open">
      <div className="op-add">
        <button type="button" className="op-btn op-btn--go op-btn--big op-open__main" onClick={() => void launch()} disabled={busy || live}>
          {live ? "MIRROR IS OPEN" : "🪞 OPEN MIRROR"}
        </button>
        <button type="button" className="op-btn op-btn--big" onClick={here} title="Open the kiosk as a window in this browser (single screen)">
          OPEN IN THIS BROWSER
        </button>
      </div>
      {msg && <div className="op-note">{msg}</div>}
    </div>
  );
}

/** What is on the mirror right now. */
function MirrorNow({ status, now, adminKey }: { status: KioskStatus | null; now: number; adminKey: string }) {
  const live = status !== null && now - status.at < KIOSK_STATUS_STALE_MS;
  if (!status || !live) {
    return (
      <div className="op-mirror">
        <div className="op-mirror__state op-mirror__state--off font-heading">MIRROR OFFLINE</div>
        <p className="op-note">LAST SEEN {status ? `${ago(now - status.at)} AGO` : "NEVER"}</p>
        <OpenMirror adminKey={adminKey} live={false} />
      </div>
    );
  }
  const { lobby, battle, scan } = status;
  return (
    <div className="op-mirror">
      <div className="op-mirror__state font-heading">
        <span className="op-dot" aria-hidden /> {STATE_LABEL[status.state] ?? status.state}
      </div>
      <dl className="op-facts">
        <div>
          <dt>IN FRAME</dt>
          <dd className={status.people === 0 ? "op-dim" : ""}>{status.people === 0 ? "NOBODY" : `${status.people} ${status.people === 1 ? "PERSON" : "PEOPLE"}`}</dd>
        </div>
        <div>
          <dt>FRAMING</dt>
          <dd className={status.framing === "full" ? "" : "op-warn"}>{status.framing === "full" ? "HEAD TO SHOES ✓" : status.framing.toUpperCase().replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt>CAMERA</dt>
          <dd className={status.camera === "live" ? "" : "op-warn"}>{status.camera.toUpperCase()}</dd>
        </div>
        <div>
          <dt>VOICE</dt>
          <dd className={status.muted ? "op-warn" : ""}>{status.muted ? "MUTED" : "ON"}</dd>
        </div>
        <div>
          <dt>MODE</dt>
          <dd>{status.mode.toUpperCase()}</dd>
        </div>
        <div>
          <dt>SCANS TODAY</dt>
          <dd className="font-number">{status.scansToday}</dd>
        </div>
      </dl>

      {scan && (
        <div className="op-block">
          <div className="op-block__title font-heading">SOLO SCAN</div>
          <div className="op-row">
            <span>{scan.nickname}</span>
            <span className="font-number op-glow">{formatAura(scan.aura, true)}</span>
          </div>
          {scan.rank && <div className="op-note">{scan.rank.toUpperCase()} TODAY</div>}
        </div>
      )}

      {lobby && !battle && (
        <div className="op-block">
          <div className="op-block__title font-heading">
            {lobby.mode === "squad" ? "SQUAD" : "1V1"} LOBBY · {lobby.players.length}/{lobby.capacity}
          </div>
          {lobby.players.length === 0 && <div className="op-note">WAITING FOR PLAYER 1 (DOUBLE PEACE)</div>}
          {lobby.players.map((p) => (
            <div key={p.slot} className="op-row">
              <span>
                P{p.slot + 1} · {p.nickname ?? (p.status === "failed" ? "RETAKE NEEDED" : "SCORING...")}
              </span>
              <span className="font-number">{p.fit !== null ? `${formatAura(p.fit, true)} · POSE ${p.pose ?? "–"}` : ""}</span>
            </div>
          ))}
          {lobby.error && <div className="op-warn op-note">{lobby.error}</div>}
        </div>
      )}

      {battle && (
        <div className="op-block">
          <div className="op-block__title font-heading">
            {battle.mode === "squad" ? `SQUAD · ${battle.vibe?.toUpperCase() ?? ""}` : "1V1 RESULT"}
            {battle.reveal && battle.reveal.shown < battle.reveal.total ? ` · COUNTDOWN ${battle.reveal.shown}/${battle.reveal.total}` : ""}
          </div>
          {[...battle.players]
            .sort((a, b) => a.place - b.place)
            .map((p) => (
              <div key={p.slot} className={`op-row ${p.slot === battle.winnerSlot ? "op-row--win" : ""}`}>
                <span>
                  #{p.place} · P{p.slot + 1} {p.nickname}
                </span>
                <span className="font-number">{formatAura(p.total, true)}</span>
              </div>
            ))}
          {battle.commentary && <p className="op-quote">&ldquo;{battle.commentary.replace(/\n+/g, " ")}&rdquo;</p>}
        </div>
      )}

      {status.card && (
        <a className="op-link" href={status.card.pageUrl} target="_blank" rel="noreferrer">
          CARD SAVED · OPEN {status.card.pageUrl.replace(/^https?:\/\//, "")}
        </a>
      )}
      <OpenMirror adminKey={adminKey} live />
    </div>
  );
}

/** Who is waiting: card challengers (BEAT THIS SCORE) and walk-ins signed up here. */
function SignUps({ adminKey, queue, called, onChange, now }: { adminKey: string; queue: QueuedChallenger[]; called: CalledChallenger | null; onChange: () => void; now: number }) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const headers = { "Content-Type": "application/json", "x-admin-key": adminKey };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/challenges", { method: "POST", headers, body: JSON.stringify({ name }) });
    const body = (await res.json().catch(() => ({}))) as { position?: number; error?: string };
    setMsg(res.ok ? `${name.toUpperCase()} IS #${body.position} IN LINE.` : (body.error ?? "COULD NOT ADD."));
    if (res.ok) setName("");
    onChange();
  };
  const act = async (id: number, method: "POST" | "DELETE") => {
    await fetch(`/api/challenges/${id}`, { method, headers });
    onChange();
  };

  return (
    <div className="op-signups">
      <form className="op-add" onSubmit={add}>
        <input className="op-input font-mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="WALK-IN NAME" maxLength={24} aria-label="Walk-in name" />
        <button type="submit" className="op-btn" disabled={!name.trim()}>
          + ADD
        </button>
      </form>
      {msg && <div className="op-note">{msg}</div>}
      {queue.length === 0 ? (
        <div className="op-note">NOBODY IN LINE. ADD WALK-INS HERE, OR PEOPLE TAP “BEAT THIS SCORE” ON A CARD.</div>
      ) : (
        <ol className="op-queue">
          {queue.map((c, i) => (
            <li key={c.id} className="op-queue__row">
              <span className="font-number op-queue__pos">{i + 1}</span>
              <span className="op-queue__who">
                <span className="font-heading">{c.name.toUpperCase()}</span>
                <span className="op-note">
                  {c.target ? `WANTS TO BEAT ${formatAura(c.target)}` : "WALK-IN"}
                  {c.at ? ` · WAITING ${ago(now - c.at)}` : ""}
                </span>
              </span>
              <button type="button" className="op-btn op-btn--go" onClick={() => void act(c.id, "POST")} title="The mirror calls their name">
                CALL UP
              </button>
              <button type="button" className="op-btn" onClick={() => void act(c.id, "DELETE")} aria-label={`Remove ${c.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      {called && <div className="op-note">LAST CALLED: {called.name.toUpperCase()} · {ago(now - called.at)} AGO</div>}
    </div>
  );
}

/**
 * The operator's laptop screen (the mirror shows /kiosk): what the mirror is
 * doing, who is signed up next, the live standings, today's numbers and the
 * newest cards, plus the remote controls. Everything updates on its own.
 */
export function OperatorScreen() {
  const { key, verified, setKey, verify, error } = useAdminKey();
  const [now, setNow] = useState(() => Date.now());
  const [sent, setSent] = useState<string | null>(null);
  const status = usePoll<{ status: KioskStatus | null }>("/api/kiosk/status", POLL.status);
  const queue = usePoll<{ challenges: QueuedChallenger[]; called: CalledChallenger | null }>("/api/challenges", POLL.queue);
  const stats = usePoll<UsageStats>("/api/stats", POLL.stats);
  const feed = usePoll<{ entries: FeedEntry[] }>("/api/feed", POLL.feed);
  const { snapshot } = useLeaderboard(5_000);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const command = async (c: RemoteCommandName) => {
    const res = await fetch("/api/remote", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": key }, body: JSON.stringify({ command: c }) });
    setSent(res.ok ? `${c.toUpperCase()} SENT` : `FAILED (${res.status})`);
  };

  if (!verified) {
    return (
      <main className="tool-page aura-grid-bg">
        <div className="os-window os-window--light tool-page__window">
          <header className="os-window__title">
            <span>OPERATOR.EXE · UNLOCK</span>
            <span>x</span>
          </header>
          <div className="os-window__body">
            <AdminKeyGate value={key} onChange={setKey} onSubmit={verify} error={error} />
          </div>
        </div>
      </main>
    );
  }

  const narrative = snapshot?.narrative ?? null;
  const u = stats.data;
  return (
    <main className="op aura-grid-bg">
      <header className="op__bar font-heading">
        <span>AURA OS · OPERATOR</span>
        <span className="op-note">{new Date(now).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
      </header>
      <div className="op__grid">
        <div className="op__col">
          <Win title="MIRROR_NOW.EXE">
            <MirrorNow status={status.data?.status ?? null} now={now} adminKey={key} />
          </Win>
          <Win title="CONTROLS.EXE">
            <div className="op-controls">
              {REMOTE_BUTTONS.map((b) => (
                <button key={b.command} type="button" className="op-btn op-btn--big" onClick={() => void command(b.command)}>
                  <span aria-hidden>{b.emoji}</span> {b.label}
                </button>
              ))}
            </div>
            <div className="op-note">{sent ?? "SENDS STRAIGHT TO THE MIRROR."}</div>
          </Win>
        </div>

        <div className="op__col">
          <Win title={`UP_NEXT.EXE · ${queue.data?.challenges.length ?? 0} IN LINE`}>
            <SignUps adminKey={key} queue={queue.data?.challenges ?? []} called={queue.data?.called ?? null} onChange={queue.reload} now={now} />
          </Win>
          <Win title="TODAY.EXE">
            <dl className="op-stats">
              <div>
                <dt>SCANS</dt>
                <dd className="font-number">
                  {u?.scansToday ?? "–"}
                  <span className="op-dim"> / {u?.cap ?? "–"}</span>
                </dd>
              </div>
              <div>
                <dt>ON THE BOARD</dt>
                <dd className="font-number">{snapshot?.totalToday ?? "–"}</dd>
              </div>
              <div>
                <dt>AI SPEND</dt>
                <dd className="font-number">${u ? u.estimatedSpendUsd.toFixed(2) : "–"}</dd>
              </div>
              <div>
                <dt>AI CALLS</dt>
                <dd className="font-number">{u?.callsToday ?? "–"}</dd>
              </div>
              <div>
                <dt>JUDGES SPLIT</dt>
                <dd className="font-number">{snapshot ? `${snapshot.judgeSplit.disagreements}/${snapshot.judgeSplit.scans}` : "–"}</dd>
              </div>
              <div>
                <dt>HOTTEST HOUR</dt>
                <dd className="font-number">{snapshot?.hottestHour ? new Date(snapshot.hottestHour.hour).toLocaleTimeString("en-US", { hour: "numeric" }) : "–"}</dd>
              </div>
            </dl>
            <div className="op-note">
              {u?.mock ? "MOCK MODE (NO AI KEYS)" : `MODEL ${u?.model.toUpperCase() ?? "…"}`} · {snapshot?.store === "tiger" ? "TIGER DATA" : "IN-MEMORY"}
            </div>
          </Win>
        </div>

        <div className="op__col">
          <Win title="STANDINGS.EXE">
            {narrative?.squadChampion && (
              <div className="op-special font-heading">
                👑 SQUAD CHAMPION · {narrative.squadChampion.vibe.toUpperCase()} · {formatAura(narrative.squadChampion.score)}
              </div>
            )}
            {narrative?.rivalry && <div className="op-note">⚔️ {rivalryLine(narrative.rivalry)}</div>}
            <ol className="op-board">
              {(snapshot?.top ?? []).slice(0, 12).map((e, i) => {
                const streak = e.handle ? narrative?.streaks[e.handle] : undefined;
                return (
                  <li key={e.id} className="op-board__row">
                    <span className="font-number op-board__rank">{i + 1}</span>
                    <span className="op-board__who">
                      {e.nickname}
                      {e.handle ? <span className="op-dim"> · {handleName(e.handle)}</span> : null}
                      {streak ? ` 🔥${streak}` : ""}
                    </span>
                    <span className="font-number op-glow">{formatAura(e.aura, true)}</span>
                  </li>
                );
              })}
              {snapshot && snapshot.top.length === 0 && <li className="op-note">NOBODY ON THE BOARD YET.</li>}
            </ol>
          </Win>
          <Win title="NEWEST_CARDS.EXE">
            <div className="op-cards">
              {(feed.data?.entries ?? []).slice(0, 6).map((c) => (
                <a key={c.id} href={`/r/${c.id}`} target="_blank" rel="noreferrer" className="op-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt="" loading="lazy" />
                  <span className="op-card__title">{c.title}</span>
                  <span className="op-note">
                    {Object.entries(c.reactions)
                      .filter(([, n]) => n > 0)
                      .map(([emoji, n]) => `${emoji}${n}`)
                      .join(" ") || "NO REACTIONS YET"}
                  </span>
                </a>
              ))}
            </div>
          </Win>
        </div>
      </div>
    </main>
  );
}
