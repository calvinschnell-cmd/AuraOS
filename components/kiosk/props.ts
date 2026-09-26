import type { GenerateOptions } from "@/lib/clothing/generator";
import type { CameraHandle } from "@/lib/kiosk/useCamera";
import type { GestureRuntime } from "@/lib/kiosk/useGestures";
import type { QueuedChallenger } from "@/lib/kiosk/useChallenges";
import type { LeaderboardState } from "@/lib/kiosk/useLeaderboard";
import type { Reveal } from "@/lib/kiosk/useReveal";
import type {
  KioskEvent,
  KioskMode,
  KioskSettings,
  KioskState,
  SessionState,
  TerminalEntry,
  UsageStats,
} from "@/lib/kiosk/types";

/** AURA OS mode select: Aura Battles (primary), Solo Scan (warm-up), Squad. */
export type ModeChoice = "battle" | "solo" | "squad";

/**
 * Everything a layout needs. DigitalLayout and MirrorLayout are presentational
 * and receive exactly this same object; all logic lives in lib/kiosk.
 */
export interface KioskViewProps {
  mode: KioskMode;
  state: KioskState;
  session: SessionState;
  enteredAt: number;
  terminal: TerminalEntry[];
  scansToday: number;
  settings: KioskSettings;
  updateSettings: (patch: Partial<KioskSettings>) => void;
  camera: CameraHandle;
  /** Tiger Data configured (server-side check, passed down from the page). */
  databaseConfigured: boolean;
  mockMode: boolean;
  fps: number;
  onFps: (fps: number) => void;
  /** Dev override for outfit rolls (C hotkey forces a costume). */
  generateOptions: GenerateOptions;
  /** Result reveal progress; null outside RESULT/CLAIM. */
  reveal: Reveal | null;
  /** Server usage snapshot for the debug overlay. */
  usage: UsageStats | null;
  toggleMode: () => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  gestures: GestureRuntime;
  /** Screen sides are mirrored relative to the raw camera (digital flip or real mirror). */
  mirrored: boolean;
  leaderboard: LeaderboardState;
  /** Slot-machine tick (sound). */
  onSlotLock: (index: number) => void;
  debugOpen: boolean;
  settingsOpen: boolean;
  closeSettings: () => void;
  setMode: (mode: KioskMode) => void;
  send: (event: KioskEvent) => void;
  /** Mode select buttons (touch / mouse); gestures reach the same events. */
  chooseMode: (choice: ModeChoice) => void;
  /** People who tapped "BEAT THIS SCORE" on a shared card, waiting for the mirror. */
  challengers: QueuedChallenger[];
  reboot: () => void;
  /** Session-end reboot: the boot sequence runs fast. */
  quickBoot: boolean;
  onBootDone: () => void;
}
