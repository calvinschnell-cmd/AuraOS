import type { Analysis } from "@/lib/schema";
import type { Outfit } from "@/lib/clothing/types";
import type { ScoreBreakdown } from "@/lib/scoring";
import type { BattleMode, BattlePlayerScore, BattleRecord } from "@/lib/battle/types";
import type { PoseSnapshot } from "@/lib/pose/landmarks";
import type { PoseResult } from "@/lib/pose/score";
import type { LeaderboardNarrative } from "@/lib/leaderboard/narrative";

export const KIOSK_STATES = [
  "BOOT",
  "SPINNING",
  "LOCKING",
  "GREETING",
  "POSE_FOR_FANS",
  "READY",
  "CHARGING",
  "COUNTDOWN",
  "ANALYZING",
  "RESULT",
  "NAME_ENTRY",
  "CLAIM",
  /** Aura Battles lobby: players step up one by one (duel: 2, squad: up to 5). */
  "LOBBY",
  /** 3-2-1 for the player stepping up (or both at once for a two-person duel). */
  "LOBBY_COUNTDOWN",
  /** VS intro: plays while the last scores land and the battle is computed. */
  "BATTLE_INTRO",
  "BATTLE_RESULT",
  "SULKING",
  "ATTRACT",
] as const;
export type KioskState = (typeof KIOSK_STATES)[number];

export type KioskMode = "digital" | "mirror";

/** Screen side as the viewer sees it (after any feed flipping). */
export type ScreenSide = "left" | "right";

/** Physical camera mounting: rotate the feed so a sideways camera shows upright. */
export type CameraRotation = 0 | 90 | 180 | 270;
export const CAMERA_ROTATIONS: readonly CameraRotation[] = [0, 90, 180, 270];

/** Wave meltdown escalation (Stage 12). */
export type MeltdownLevel = "none" | "tired" | "annoyed";

/** Squad results revealed as a countdown, last place first. */
export interface SquadReveal {
  battleId: string;
  /** Places called so far (0 = nobody yet). */
  shown: number;
  /** Places to call (ties share one). */
  total: number;
  /** When the last step landed (the result timeout counts from here). */
  at: number;
  /** What the host is saying before the next name ("IN DEAD LAST....."), shown big on screen. */
  callout: string | null;
}

export interface WaveHello {
  /** Waves since the last scan when this line was picked (0: none yet). */
  count: number;
  line: string | null;
  /** Index into its tier, so the same line never plays twice in a row. */
  index: number | null;
  tick: number;
}

export type KioskEvent =
  | { type: "BOOT_DONE" }
  /** `count`: waves since the last scan, this one included (lib/kiosk/meltdown.ts). */
  | { type: "WAVE"; side: ScreenSide; count?: number }
  | { type: "LOCK_DONE" }
  | { type: "GREETING_DONE" }
  | { type: "POSE_DONE" }
  | { type: "SCAN" }
  | { type: "CHARGE_DONE" }
  | { type: "CHARGE_CANCEL" }
  | { type: "COUNTDOWN_DONE" }
  | { type: "ANALYSIS_DONE"; scan: ScanResult }
  | { type: "BATTLE_ANALYSIS_DONE"; battle: BattleResult }
  | { type: "ANALYSIS_FAILED"; message: string }
  | { type: "THUMB_UP" }
  /** Leaderboard name typed (null: keep the generated nickname) and its NAME#CODE handle when registered. */
  | { type: "NAME_SUBMIT"; name: string | null; handle: string | null }
  | { type: "NAME_CANCEL" }
  | { type: "THUMB_DOWN" }
  | { type: "ROAST_READY"; text: string }
  | { type: "OPEN_PALM" }
  | { type: "BATTLE" }
  /** Two fists held up with nobody else in frame: clowned, no battle. */
  | { type: "SOLO_BATTLE" }
  /** Open the Aura Battles lobby (mode select: BATTLE = duel, SQUAD = squad). */
  | { type: "OPEN_LOBBY"; mode: BattleMode }
  /** A lobby capture landed (two at once for a two-person duel). */
  | { type: "SLOT_CAPTURED"; slots: LobbySlot[] }
  | { type: "CAPTURE_FAILED"; message: string }
  /** A capture's single-judge score + pose sub-score came back. */
  | { type: "SLOT_SCORED"; captureId: string; scan: ScanResult; pose: PoseResult }
  /** A capture could not be scored: that player steps up again. */
  | { type: "SLOT_FAILED"; captureId: string; message: string }
  /** Lock the lobby in (squad: 2+ players). */
  | { type: "START_BATTLE" }
  /** Streamed battle commentary so far. */
  | { type: "COMMENTARY"; battleId: string; text: string; done: boolean }
  /** Squad countdown: `step` places have now been called (lib/battle/reveal.ts); `callout`: the line being said ("In dead last....."). */
  | { type: "REVEAL_STEP"; battleId: string; step: number; callout?: string }
  | { type: "CARD_READY"; card: CardInfo }
  /** Solana badge for the saved card (best-effort, never blocks the card). */
  | { type: "BADGE"; badge: BadgeStatus }
  | { type: "CARD_FAILED"; message: string }
  | { type: "PRINTING" }
  | { type: "MELTDOWN"; level: MeltdownLevel }
  | { type: "SULK" }
  | { type: "SULK_DONE" }
  | { type: "TIMEOUT" }
  | { type: "PERSON_SEEN" }
  | { type: "RESET" };

export type KioskEventType = KioskEvent["type"];

export type GestureId =
  | "double_peace"
  | "double_fist"
  | "wave"
  | "thumb_up"
  | "thumb_down"
  | "open_palm";

export interface Rank {
  position: number;
  total: number;
}

/** Captured frame kept on the client only (never uploaded beyond analysis). */
export interface CapturedImage {
  dataUrl: string;
  width: number;
  height: number;
  hash: string;
  /** True when no camera was available and a placeholder frame was used. */
  placeholder: boolean;
}

export interface ScanResult {
  id: string;
  analysis: Analysis;
  aura: number;
  breakdown: ScoreBreakdown;
  rank: Rank;
  capturedAt: number;
  image: CapturedImage;
  cached: boolean;
  mock: boolean;
}

/** A battle player on the kiosk: their numbers plus the local scan (with the captured photo). */
export interface BattlePlayerView extends BattlePlayerScore {
  scan: ScanResult;
}

/** A finished battle on the kiosk (duel or squad). Commentary streams in after the result shows. */
export interface BattleResult extends Omit<BattleRecord, "players"> {
  players: BattlePlayerView[];
  capturedAt: number;
}

/** One lobby slot: a player who stepped up and captured. */
export interface LobbySlot {
  slot: number;
  /** Unique per capture (a retake gets a new one). */
  captureId: string;
  image: CapturedImage;
  /** Live landmarks at capture time (null: nobody detected / no camera). */
  pose: PoseSnapshot | null;
  status: "scoring" | "ready" | "failed";
  scan: ScanResult | null;
  poseResult: PoseResult | null;
}

export interface Lobby {
  mode: BattleMode;
  capacity: number;
  slots: LobbySlot[];
  /** The slot the next capture fills. */
  next: number;
  /** Two people triggered the battle together: one countdown captures both (split by pose boxes). */
  pair: boolean;
  /** Last lobby problem shown to the players (failed capture or score). */
  error: string | null;
}

/** Solana badge mint for a claimed card. */
export type BadgeStatus = { status: "minting" } | { status: "minted"; signature: string; explorerUrl: string } | { status: "failed" };

/** Saved share card (rendered PNG on the server, QR to /r/[id]). */
export interface CardInfo {
  id: string;
  url: string;
  pageUrl: string;
  qrDataUrl: string;
  kind: "scan" | "battle" | "squad";
}

/** Server usage snapshot (D debug overlay). */
export interface UsageStats {
  day: string;
  callsToday: number;
  scansToday: number;
  cap: number;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  estimatedSpendUsd: number;
  store: StoreKind;
  model: string;
  mock: boolean;
}

/** JSON body returned by POST /api/analyze. */
export interface AnalyzeResponse {
  id: string;
  analysis: Analysis;
  aura: number;
  breakdown: ScoreBreakdown;
  rank: Rank;
  cached: boolean;
  mock: boolean;
  usage: UsageStats;
}

/** POST /api/battle/scan: one lobby capture, single judge, plus its pose sub-score. */
export interface BattleScanResponse {
  scan: Omit<AnalyzeResponse, "usage">;
  pose: PoseResult;
  usage: UsageStats;
}

/** POST /api/battle: the scored, stored battle. */
export interface BattleCreateResponse {
  battle: BattleRecord;
}

export interface LeaderboardEntry {
  id: string;
  scanId: string;
  nickname: string;
  aura: number;
  createdAt: string;
  /** Standout item name for the ticker. */
  standout: string | null;
  /** Player handle (NAME#CODE) when they typed a name, for their history page. */
  handle: string | null;
  /** Their card (/r/[id]) when one was saved: the phone standings open it. */
  cardId?: string | null;
  /** Scanned at the mirror or on a phone (/scan). Older rows: mirror. */
  source?: ScanSource;
}

/** Where a scan was taken. */
export type ScanSource = "mirror" | "mobile";

export function isScanSource(v: unknown): v is ScanSource {
  return v === "mirror" || v === "mobile";
}

/** Where scans live: Tiger Data (TimescaleDB) or this server's memory. */
export type StoreKind = "tiger" | "memory";

/** One 15-minute bucket of the event (Tiger: the aura_15m continuous aggregate). */
export interface TimelineBucket {
  bucket: string;
  scans: number;
  avgAura: number;
  maxAura: number;
  minAura: number;
  /** Fits that swung wide (|aura| past the near-zero band). */
  swings: number;
  /** Scans where the two judges disagreed. */
  disagreements: number;
}

export interface HottestHour {
  hour: string;
  scans: number;
  avgAura: number;
}

/** Today's judge agreement: scans with two judges vs. those where they disagreed. */
export interface JudgeSplit {
  scans: number;
  disagreements: number;
}

export interface PlayerInfo {
  /** NAME#CODE, e.g. "CALVIN#K7QX". */
  handle: string;
  name: string;
}

export interface PlayerHistory extends PlayerInfo {
  scans: { scanId: string; aura: number; nickname: string; createdAt: string }[];
}

export interface LeaderboardSnapshot {
  top: LeaderboardEntry[];
  recent: LeaderboardEntry[];
  totalToday: number;
  store: StoreKind;
  /** Today in 15-minute buckets (aura over the event). */
  timeline: TimelineBucket[];
  hottestHour: HottestHour | null;
  judgeSplit: JudgeSplit;
  /** Rivalry of the Day, Squad Champion, streaks, most improved (rule-based). */
  narrative: LeaderboardNarrative;
  at: number;
}

/** JSON body returned by POST /api/scan/quick (phone scans). */
export interface QuickScanResponse {
  scan: Omit<ScanResult, "image" | "capturedAt">;
  /** The garment classifier stage: used, skipped (CLASSIFIER_MODE=skip) or unavailable; null when it never ran. */
  classifier: "used" | "skipped" | "unavailable" | null;
  /** Server time for the whole request. */
  ms: number;
}

export interface CardResponse {
  id: string;
  url: string;
  /** Public deep link (PUBLIC_BASE_URL) to the result page: /r/[id]. */
  pageUrl: string;
  entry: LeaderboardEntry | null;
}

export const REMOTE_COMMANDS = ["scan", "battle", "squad", "start", "wave", "reset", "mute", "music", "voice", "mode"] as const;
export type RemoteCommandName = (typeof REMOTE_COMMANDS)[number];

export interface RemoteCommand {
  id: number;
  command: RemoteCommandName;
  at: number;
}

export interface SessionState {
  /** Increments every time a new session (locked fit) begins. */
  id: number;
  /** The fit the mannequin is wearing; re-rolled while SPINNING, frozen after. */
  outfit: Outfit;
  locked: boolean;
  waveSide: ScreenSide | null;
  /** Bumps on every wave so the mannequin can wave back again. */
  waveTick: number;
  /** The latest "hi" for a repeat wave (less enthusiastic each time); `tick` bumps when it should be spoken. */
  hello: WaveHello;
  idolPoseIndex: number | null;
  greetingIndex: number | null;
  scan: ScanResult | null;
  /** Thumbs-down roasts requested (max one per scan). */
  roastCount: number;
  roast: string | null;
  errorMessage: string | null;
  /** Aura Battles lobby (null outside a battle). */
  lobby: Lobby | null;
  battle: BattleResult | null;
  /** Commentary has finished streaming. */
  commentaryDone: boolean;
  /** Squad countdown progress (null: no countdown, everything shows at once). */
  reveal: SquadReveal | null;
  /** Leaderboard name the player typed after a thumbs up (null: generated nickname). */
  playerName: string | null;
  /** Their NAME#CODE handle (per-user history), when registered. */
  playerHandle: string | null;
  /** The result reveal already played (coming back from name entry must not replay it). */
  resultShown: boolean;
  /** Share card saved after a thumbs up. */
  card: CardInfo | null;
  /** Its Solana badge (null: badges off or not attempted). */
  badge: BadgeStatus | null;
  cardError: string | null;
  printing: boolean;
  meltdown: MeltdownLevel;
  /** Bumps when a sulk ends so the mannequin can stand up and dust off. */
  apologyTick: number;
  /** Bumps on every solo battle attempt; soloRoastIndex picks the line (lib/copy/soloBattle.ts). */
  soloRoastTick: number;
  soloRoastIndex: number | null;
}

export interface KioskSettings {
  cameraDeviceId: string | null;
  flipFeed: boolean;
  cameraRotation: CameraRotation;
  textScale: number;
  printingEnabled: boolean;
  muted: boolean;
  /** Master volume 0..1 (voice, music, effects), changed with the + / - keys. */
  volume: number;
  /** Silence just the music, or just the voice (admin MUTE MUSIC / MUTE VOICE); `muted` silences everything. */
  musicMuted: boolean;
  voiceMuted: boolean;
  performanceMode: boolean;
  /** Segmentation aura around the person (live feed + reveal photo). Off by default. */
  auraGlow: boolean;
  /** "contain" shows the whole camera frame (letterboxed); "cover" fills the screen and crops. */
  feedFit: FeedFit;
  /**
   * Mirror mode: share of the screen width (from the left) the UI may use, in
   * percent. The display sits in the top-left of the mirror, so the person's
   * reflection covers the rest, which stays pure black.
   */
  mirrorPanelWidth: number;
}

export type FeedFit = "contain" | "cover";

export const DEFAULT_SETTINGS: KioskSettings = {
  cameraDeviceId: null,
  flipFeed: true,
  /** Sideways webcam on a portrait display: the feed runs longways by default. */
  cameraRotation: 90,
  textScale: 1,
  printingEnabled: false,
  muted: false,
  volume: 0.8,
  musicMuted: false,
  voiceMuted: false,
  performanceMode: false,
  auraGlow: false,
  feedFit: "contain",
  /** 32" portrait monitor in the top-left of a 24x36 mirror: the reflection starts ~45% across. */
  mirrorPanelWidth: 45,
};

export interface TerminalEntry {
  id: number;
  text: string;
}

export type CameraStatus = "idle" | "requesting" | "live" | "error" | "unsupported";
