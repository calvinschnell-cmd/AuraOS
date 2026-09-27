"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { AdminKeyGate, useAdminKey } from "@/components/admin/AdminKeyGate";
import { CameraPanel, SoundPanel } from "@/components/admin/KioskSettingsPanels";
import type { FeedEntry } from "@/lib/feed/types";
import { makeQrDataUrl } from "@/lib/kiosk/qr";
import { KIOSK_STATUS_STALE_MS, type KioskStatus } from "@/lib/kiosk/status";
import type { KioskState, LeaderboardEntry, LeaderboardSnapshot, RemoteCommandName, UsageStats } from "@/lib/kiosk/types";
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

/** Toggle buttons say what pressing them will do, from what the mirror last reported. */
function controlLabel(command: RemoteCommandName, label: string, status: KioskStatus | null): string {
  if (!status) return label;
  if (command === "mute") return status.muted ? "UNMUTE ALL" : label;
  if (command === "music") return status.musicMuted ? "UNMUTE MUSIC" : label;
  if (command === "voice") return status.voiceMuted ? "UNMUTE VOICE" : label;
  return label;
}

/** Remote buttons: queued on the server, the mirror polls them. */
const REMOTE_BUTTONS: { command: RemoteCommandName; label: string; emoji: string }[] = [
  { command: "battle", label: "AURA BATTLE", emoji: "⚔️" },
  { command: "squad", label: "SQUAD", emoji: "👥" },
  { command: "scan", label: "SCAN / CAPTURE", emoji: "✌️✌️" },
  { command: "start", label: "START BATTLE", emoji: "▶" },
  { command: "wave", label: "SIMULATE WAVE", emoji: "👋" },
  { command: "reset", label: "RESET", emoji: "↺" },
  { command: "mute", label: "MUTE ALL", emoji: "🔇" },
  { command: "music", label: "MUTE MUSIC", emoji: "🎵" },
  { command: "voice", label: "MUTE VOICE", emoji: "🗣️" },
  { command: "mode", label: "MODE TOGGLE", emoji: "🪞" },
];

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
      const body = (await res.json().catch(() => ({}))) as { error?: string; relayed?: boolean };
      setMsg(
        !res.ok
          ? (body.error ?? `FAILED (${res.status}).`)
          : body.relayed
            ? "SENT TO THE KIOSK LAPTOP: THE MIRROR OPENS IN A FEW SECONDS (ITS SERVER MUST BE RUNNING)."
            : "MIRROR OPENING ON THE PORTRAIT SCREEN (FIRST LOAD TAKES A FEW SECONDS).",
      );
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
          <dd className={status.muted || status.voiceMuted ? "op-warn" : ""}>{status.muted || status.voiceMuted ? "MUTED" : "ON"}</dd>
        </div>
        <div>
          <dt>MUSIC</dt>
          <dd className={status.muted || status.musicMuted ? "op-warn" : ""}>{status.muted || status.musicMuted ? "MUTED" : "ON"}</dd>
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

/** Every entry on the board (top + recent), with delete. */
function BoardEditor({ adminKey, snapshot }: { adminKey: string; snapshot: LeaderboardSnapshot | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  // Hidden right away; the next leaderboard poll (5 s) confirms it.
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(() => new Set());
  const byId = new Map<string, LeaderboardEntry>();
  for (const e of [...(snapshot?.top ?? []), ...(snapshot?.recent ?? [])]) byId.set(e.id, e);
  const entries = [...byId.values()].filter((e) => !deleted.has(e.id)).sort((a, b) => b.aura - a.aura);

  const remove = async (e: LeaderboardEntry) => {
    if (!window.confirm(`Delete ${e.nickname} (${formatAura(e.aura)}) from the board?`)) return;
    setMsg("DELETING...");
    const res = await fetch(`/api/admin/entry/${e.id}`, { method: "DELETE", headers: { "x-admin-key": adminKey } });
    setMsg(res.ok ? `${e.nickname.toUpperCase()} DELETED.` : `FAILED (${res.status}).`);
    if (res.ok) setDeleted((d) => new Set(d).add(e.id));
  };

  return (
    <>
      <div className="op-note">{msg ?? `${entries.length} ENTRIES · ✕ REMOVES ONE FROM THE BOARD`}</div>
      <ol className="op-board">
        {entries.map((e, i) => (
          <li key={e.id} className="op-board__row op-board__row--edit">
            <span className="font-number op-board__rank">{i + 1}</span>
            <span className="op-board__who">
              {e.nickname}
              <span className="op-dim"> · {new Date(e.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
            </span>
            <span className="font-number op-glow">{formatAura(e.aura, true)}</span>
            <button type="button" className="op-btn" onClick={() => void remove(e)} aria-label={`Delete ${e.nickname}`}>
              ✕
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Scan-to-open QR for the phone site (show it to judges); tap it for full screen. */
function PhoneQr({ url }: { url: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  useEffect(() => {
    makeQrDataUrl(url, 720).then(setQr).catch(() => setQr(null));
  }, [url]);
  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBig(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);
  const label = url.replace(/^https?:\/\//, "").toUpperCase();
  if (!qr) return <div className="op-note">MAKING QR...</div>;
  return (
    <>
      <button type="button" className="op-qr" onClick={() => setBig(true)} title="Show full screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR code for ${url}`} />
        <span className="op-qr__label font-heading">{label}</span>
      </button>
      <div className="op-note">SCAN FOR THE LIVE FEED + STANDINGS · TAP FOR FULL SCREEN</div>
      {big && (
        <button type="button" className="op-qr-full" onClick={() => setBig(false)} aria-label="Close full-screen QR">
          <span className="op-qr-full__title font-heading">SCAN ME · AURA BATTLES</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR code for ${url}`} />
          <span className="op-qr-full__url font-heading">{label}</span>
          <span className="op-note">TAP OR ESC TO CLOSE</span>
        </button>
      )}
    </>
  );
}

const noSubscribe = () => () => {};

/** The mirror reports to (and takes commands from) the server on its own laptop. */
function useIsLocalHost(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname),
    () => true,
  );
}

/**
 * The one admin page (ADMIN_KEY): what the mirror is doing, OPEN MIRROR, the
 * remote controls, who is signed up next, the live feed, the standings (with
 * board edits), today's numbers and a phone QR for the site. Updates on its own.
 */
export function AdminDashboard({ publicBaseUrl = null }: { publicBaseUrl?: string | null }) {
  const { key, verified, setKey, verify, error } = useAdminKey();
  const isLocal = useIsLocalHost();
  const [now, setNow] = useState(() => Date.now());
  const [sent, setSent] = useState<string | null>(null);
  const [editBoard, setEditBoard] = useState(false);
  const status = usePoll<{ status: KioskStatus | null; relay?: "tiger" | "memory" }>("/api/kiosk/status", POLL.status);
  const queue = usePoll<{ challenges: QueuedChallenger[]; called: CalledChallenger | null }>("/api/challenges", POLL.queue);
  const stats = usePoll<UsageStats>("/api/stats", POLL.stats);
  const feed = usePoll<{ entries: FeedEntry[] }>("/api/feed", POLL.feed);
  // Cards hidden from here disappear right away; the next feed poll confirms it.
  const [hiddenCards, setHiddenCards] = useState<ReadonlySet<string>>(() => new Set());
  const hideCard = async (c: FeedEntry) => {
    if (!window.confirm(`Remove "${c.title}" from the feed, the board and its page?`)) return;
    const res = await fetch("/api/admin/remove", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": key }, body: JSON.stringify({ cardId: c.id }) });
    if (res.ok) setHiddenCards((h) => new Set(h).add(c.id));
    else window.alert(`Remove failed (${res.status}).`);
  };
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
            <span>ADMIN.EXE · UNLOCK</span>
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
  const liveStatus = status.data?.status && now - status.data.status.at < KIOSK_STATUS_STALE_MS ? status.data.status : null;
  const phoneUrl = `${publicBaseUrl ?? window.location.origin}/feed`;
  return (
    <main className="op aura-grid-bg">
      <header className="op__bar font-heading">
        <span>AURA OS · ADMIN</span>
        <nav className="op__links">
          <a href="/feed" target="_blank" rel="noreferrer">
            PHONE FEED ↗
          </a>
          <a href="/tv" target="_blank" rel="noreferrer">
            BIG SCREEN ↗
          </a>
          <a href="/pose-lab" target="_blank" rel="noreferrer">
            POSE LAB ↗
          </a>
        </nav>
        <span className="op-note">{new Date(now).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
      </header>
      {!isLocal && status.data?.relay === "memory" && (
        <div className="op-banner font-mono">
          NO SHARED DATABASE ON THIS SERVER: THE MIRROR, ITS CONTROLS AND SIGN-UPS ONLY SHOW UP ON THE KIOSK LAPTOP. OPEN <b>LOCALHOST:3000/ADMIN</b> THERE.
        </div>
      )}
      <div className="op__grid">
        <div className="op__col">
          <Win title="MIRROR_NOW.EXE">
            <MirrorNow status={status.data?.status ?? null} now={now} adminKey={key} />
          </Win>
          <Win title="CONTROLS.EXE">
            <div className="op-controls">
              {REMOTE_BUTTONS.map((b) => (
                <button key={b.command} type="button" className="op-btn op-btn--big" onClick={() => void command(b.command)}>
                  <span className="op-btn__emoji" aria-hidden>
                    {b.emoji}
                  </span>
                  <span>{controlLabel(b.command, b.label, liveStatus)}</span>
                </button>
              ))}
            </div>
            <div key={sent ?? ""} className={`op-note ${sent ? "op-note--flash" : ""}`}>
              {sent ?? "SENDS STRAIGHT TO THE MIRROR."}
            </div>
          </Win>
          <Win title="CAMERA.EXE">
            <CameraPanel adminKey={key} status={liveStatus} now={now} />
          </Win>
          <Win title="SOUND.EXE">
            <SoundPanel adminKey={key} status={liveStatus} now={now} />
          </Win>
          <Win title="PHONE_QR.EXE">
            <PhoneQr url={phoneUrl} />
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
          <Win title={`FEED.EXE · ${feed.data?.entries.length ?? 0} CARDS`}>
            <div className="op-cards op-cards--feed">
              {(feed.data?.entries ?? []).filter((c) => !hiddenCards.has(c.id)).map((c) => (
                <div key={c.id} className="op-card-wrap">
                <a href={`/r/${c.id}`} target="_blank" rel="noreferrer" className="op-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt="" loading="lazy" />
                  <span className="op-card__title">{c.title}</span>
                  <span className="op-note">
                    {ago(now - new Date(c.createdAt).getTime())} AGO ·{" "}
                    {Object.entries(c.reactions)
                      .filter(([, n]) => n > 0)
                      .map(([emoji, n]) => `${emoji}${n}`)
                      .join(" ") || "NO REACTIONS"}
                  </span>
                </a>
                <button type="button" className="op-btn op-card__hide" onClick={() => void hideCard(c)} aria-label={`Remove ${c.title}`}>
                  HIDE
                </button>
                </div>
              ))}
              {feed.data && feed.data.entries.length === 0 && <div className="op-note">NO CARDS YET.</div>}
            </div>
          </Win>
        </div>

        <div className="op__col">
          <Win title={editBoard ? "STANDINGS.EXE · EDIT" : "STANDINGS.EXE"}>
            <div className="op-tabs">
              <button type="button" className={`op-btn ${editBoard ? "" : "op-btn--go"}`} onClick={() => setEditBoard(false)}>
                TOP 12
              </button>
              <button type="button" className={`op-btn ${editBoard ? "op-btn--go" : ""}`} onClick={() => setEditBoard(true)}>
                EDIT / DELETE
              </button>
            </div>
            {editBoard ? (
              <BoardEditor adminKey={key} snapshot={snapshot} />
            ) : (
              <>
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
              </>
            )}
          </Win>
        </div>
      </div>
    </main>
  );
}
