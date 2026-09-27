import type { KioskMode, KioskState, RemoteSettings, SessionState } from "./types";

/**
 * What the mirror is doing right now, as the operator dashboard sees it. The
 * kiosk posts this to /api/kiosk/status whenever it changes (and as a
 * heartbeat); the laptop's /admin page polls it. Only what is already on
 * the public mirror screen: no photos, no personal data.
 */
export interface KioskStatus {
  at: number;
  state: KioskState;
  mode: KioskMode;
  muted: boolean;
  /** Only the music / only the voice silenced (older mirrors do not send these). */
  musicMuted?: boolean;
  voiceMuted?: boolean;
  camera: string;
  /** People the pose tracker sees, and whether the closest one is framed head to shoes. */
  people: number;
  framing: string;
  scansToday: number;
  /** Solo scan on screen. */
  scan: { nickname: string; aura: number; rank: string | null } | null;
  lobby: {
    mode: "duel" | "squad";
    capacity: number;
    players: { slot: number; status: string; nickname: string | null; fit: number | null; pose: number | null }[];
    error: string | null;
  } | null;
  battle: {
    mode: "duel" | "squad";
    winnerSlot: number | null;
    players: { slot: number; nickname: string; total: number; place: number }[];
    vibe: string | null;
    commentary: string | null;
    /** Squad countdown progress (places called / total). */
    reveal: { shown: number; total: number } | null;
  } | null;
  card: { id: string; pageUrl: string } | null;
  /** The camera and sound settings /admin can change (older mirrors do not send these). */
  settings?: RemoteSettings;
  /** Cameras the mirror's browser can see (labels only once camera access was granted). */
  cameras?: { id: string; label: string }[];
  audio?: KioskAudioReport;
}

/** Whether the mirror can make sound, and which of its sound sources are there. */
export interface KioskAudioReport {
  /** False until the page gets a click or key press (Chrome's autoplay rule). */
  unlocked: boolean;
  /** public/audio/kiosk-bg.flac and result-jingle.flac loaded. */
  music: boolean;
  jingle: boolean;
  /** Crowd reaction clips loaded (the rest are synthesized). */
  crowdClips: number;
  crowdTotal: number;
  /** Browser voices the announcer can use. */
  voices: string[];
}

/** Older than this: the mirror is closed or asleep. */
export const KIOSK_STATUS_STALE_MS = 10_000;

export function buildKioskStatus(input: {
  state: KioskState;
  session: SessionState;
  mode: KioskMode;
  muted: boolean;
  /** Only the music / only the voice silenced (older mirrors do not send these). */
  musicMuted?: boolean;
  voiceMuted?: boolean;
  camera: string;
  people: number;
  framing: string;
  scansToday: number;
  settings?: RemoteSettings;
  cameras?: { id: string; label: string }[];
  audio?: KioskAudioReport;
}): Omit<KioskStatus, "at"> {
  const { session: s } = input;
  const scan = s.scan && !s.battle && !s.lobby ? { nickname: s.scan.analysis.nickname, aura: s.scan.aura, rank: s.scan.rank ? `#${s.scan.rank.position} of ${s.scan.rank.total}` : null } : null;
  return {
    state: input.state,
    mode: input.mode,
    muted: input.muted,
    musicMuted: input.musicMuted,
    voiceMuted: input.voiceMuted,
    camera: input.camera,
    people: input.people,
    framing: input.framing,
    scansToday: input.scansToday,
    scan,
    lobby: s.lobby
      ? {
          mode: s.lobby.mode,
          capacity: s.lobby.capacity,
          players: s.lobby.slots.map((p) => ({ slot: p.slot, status: p.status, nickname: p.scan?.analysis.nickname ?? null, fit: p.scan?.aura ?? null, pose: p.poseResult?.score ?? null })),
          error: s.lobby.error,
        }
      : null,
    battle: s.battle
      ? {
          mode: s.battle.mode,
          winnerSlot: s.battle.winnerSlot,
          players: s.battle.players.map((p) => ({ slot: p.slot, nickname: p.nickname, total: p.total, place: p.place })),
          vibe: s.battle.squad?.vibe ?? null,
          commentary: s.battle.commentary,
          reveal: s.reveal ? { shown: s.reveal.shown, total: s.reveal.total } : null,
        }
      : null,
    card: s.card ? { id: s.card.id, pageUrl: s.card.pageUrl } : null,
    settings: input.settings,
    cameras: input.cameras,
    audio: input.audio,
  };
}

/** Structural check for a posted status (the route stores nothing else). */
export function isKioskStatus(v: unknown): v is Omit<KioskStatus, "at"> {
  const o = v as Partial<KioskStatus> | null;
  return !!o && typeof o.state === "string" && typeof o.mode === "string" && typeof o.people === "number";
}
