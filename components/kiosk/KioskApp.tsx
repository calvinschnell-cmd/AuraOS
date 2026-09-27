"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShareCardView } from "@/components/card/ShareCardView";
import type { GenerateOptions } from "@/lib/clothing/generator";
import { outfitSignature } from "@/lib/clothing/generator";
import type { CostumeType } from "@/lib/clothing/types";
import { SOLO_BATTLE_ROASTS } from "@/lib/copy";
import { auraCallout, useAnnouncer } from "@/lib/kiosk/announcer";
import { analyzeFrame, fetchRoast, fetchUsageStats } from "@/lib/kiosk/api";
import { captureLobby, createBattle, scoreCapture, streamCommentary, warmUp } from "@/lib/kiosk/battle";
import { isIdleState } from "@/lib/kiosk/machine";
import { makeKioskQrDataUrl } from "@/lib/kiosk/qr";
import type { PoseSnapshot } from "@/lib/pose/landmarks";
import { MeltdownTracker } from "@/lib/kiosk/meltdown";
import { useKioskMusic } from "@/lib/kiosk/music";
import { reactionFor } from "@/lib/kiosk/reactionTiers";
import { useReactions } from "@/lib/kiosk/reactions";
import { useAudioAllowed, useSoundEngine } from "@/lib/kiosk/sound";
import { CAMERA_ROTATIONS, type KioskEvent, type KioskMode, type RemoteCommandName, type ScreenSide, type UsageStats } from "@/lib/kiosk/types";
import type { ModeChoice } from "./props";
import { useCamera } from "@/lib/kiosk/useCamera";
import { useBattleAnnouncer } from "@/lib/kiosk/useBattleAnnouncer";
import { useCardClaim } from "@/lib/kiosk/useCardClaim";
import { useChallenges } from "@/lib/kiosk/useChallenges";
import { buildKioskStatus } from "@/lib/kiosk/status";
import { useKioskStatusReporter } from "@/lib/kiosk/useKioskStatusReporter";
import { useVoicePrompts } from "@/lib/kiosk/useVoicePrompts";
import { useFullscreen } from "@/lib/kiosk/useFullscreen";
import { useGestures } from "@/lib/kiosk/useGestures";
import { useHotkeys, type HotkeyMap } from "@/lib/kiosk/useHotkeys";
import { useKioskMachine } from "@/lib/kiosk/useKioskMachine";
import { useLeaderboard } from "@/lib/kiosk/useLeaderboard";
import { useRemote } from "@/lib/kiosk/useRemote";
import { useReveal } from "@/lib/kiosk/useReveal";
import { useSettings } from "@/lib/kiosk/useSettings";
import { formatAura } from "@/lib/scoring";
import { BootCurtain } from "./BootCurtain";
import { judgesAnnouncement } from "./Judges";
import { DigitalLayout } from "./DigitalLayout";
import { MirrorLayout } from "./MirrorLayout";
import type { KioskViewProps } from "./props";
import { VolumeOsd } from "./VolumeOsd";

const SULK_LINE = "The mirror is taking a break. Maybe try a double peace sign instead.";
/** Keep the model connection warm between battles (idle gaps). */
const WARMUP_EVERY_MS = 4 * 60 * 1000;
/** Mirror mode text/window size on top of the TEXT SCALE setting. */
const MIRROR_TEXT_BOOST = 1.3;

/**
 * The kiosk root. Runs every shared hook once and hands identical props to
 * whichever layout the mode selects. `mockMode` comes from the server page:
 * OPENAI_API_KEY is server-only, so the browser cannot check it itself.
 */
export default function KioskApp({ mockMode, databaseConfigured, publicBaseUrl = null }: { mockMode: boolean; databaseConfigured: boolean; publicBaseUrl?: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const mode: KioskMode = params.get("mode") === "mirror" ? "mirror" : "digital";

  const [settings, updateSettings] = useSettings();
  const camera = useCamera(settings.cameraDeviceId);
  const { videoRef } = camera;

  // Dev override: C cycles none -> mascot -> astronaut -> diver so the 1% rolls can be checked.
  const [costumeOverride, setCostumeOverride] = useState<CostumeType | null>(null);
  const generateOptions = useMemo<GenerateOptions>(() => (costumeOverride ? { costume: costumeOverride } : {}), [costumeOverride]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [recentSignatures, setRecentSignatures] = useState<string[][]>([]);
  // Live landmarks from the gesture runtime (wired below, once it exists).
  const livePoses = useRef<() => PoseSnapshot[]>(() => []);

  const analyze = useCallback(
    () => analyzeFrame({ video: videoRef.current, flip: settings.flipFeed, rotation: settings.cameraRotation, onUsage: setUsage }),
    [videoRef, settings.flipFeed, settings.cameraRotation],
  );
  const captureLobbyFn = useCallback(
    (pair: boolean) => captureLobby({ video: videoRef.current, flip: settings.flipFeed, rotation: settings.cameraRotation, onUsage: setUsage, poses: () => livePoses.current() }, pair),
    [videoRef, settings.flipFeed, settings.cameraRotation],
  );
  const scoreCaptureFn = useCallback((capture: Parameters<typeof scoreCapture>[0]) => scoreCapture(capture, setUsage), []);

  // Anti-repeat: persist locked fit signatures.
  const onFitLocked = useCallback((session: { outfit: { seed: string } & Parameters<typeof outfitSignature>[0] }) => {
    const signature = outfitSignature(session.outfit);
    setRecentSignatures((r) => [...r, signature].slice(-300));
    void fetch("/api/fits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature, seed: session.outfit.seed }) }).catch(() => undefined);
  }, []);
  useEffect(() => {
    fetch("/api/fits", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { signatures?: string[][] }) => setRecentSignatures(b.signatures ?? []))
      .catch(() => undefined);
  }, []);

  const machineOptions = useMemo(
    () => ({ analyze, captureLobby: captureLobbyFn, scoreCapture: scoreCaptureFn, createBattle, streamCommentary, generateOptions, recentSignatures, onFitLocked }),
    [analyze, captureLobbyFn, scoreCaptureFn, generateOptions, recentSignatures, onFitLocked],
  );
  const machine = useKioskMachine(machineOptions);
  const { send, reboot, state, session } = machine;

  const [debugOpen, setDebugOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fps, setFps] = useState(0);
  // Boot sequence just finished: play the split-open curtain once per boot.
  const [curtainTick, setCurtainTick] = useState(0);
  const prevBootState = useRef(state);
  useEffect(() => {
    if (prevBootState.current === "BOOT" && state !== "BOOT") {
      window.setTimeout(() => setCurtainTick((t) => t + 1), 0);
    }
    prevBootState.current = state;
  }, [state]);
  const [nextWaveSide, setNextWaveSide] = useState<ScreenSide>("right");
  const reveal = useReveal(session.scan, machine.enteredAt, state, session.resultShown);
  const revealing = reveal !== null && !reveal.state.done;

  const onBootDone = useCallback(() => send({ type: "BOOT_DONE" }), [send]);

  // ---- wave meltdown: every WAVE is counted (since the last scan) and each
  // "hi" back is less enthusiastic; scanning or going idle resets it.
  const meltdown = useMemo(() => new MeltdownTracker(), []);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    if (state === "SPINNING" || state === "ATTRACT" || state === "CHARGING" || state === "LOBBY" || state === "LOBBY_COUNTDOWN") meltdown.reset();
  }, [state, meltdown]);
  const sendWithMeltdown = useCallback(
    (event: KioskEvent) => {
      if (event.type === "WAVE") {
        const s = stateRef.current;
        // Only the states that answer a wave count it (not mid-greeting or mid-scan).
        if (s === "SPINNING" || s === "ATTRACT" || s === "READY" || s === "SULKING") {
          const { count, signal } = meltdown.onWave(Date.now());
          if (signal === "tired" || signal === "annoyed") send({ type: "MELTDOWN", level: signal });
          send({ ...event, count });
          if (signal === "sulk") send({ type: "SULK" });
          return;
        }
      }
      send(event);
    },
    [send, meltdown],
  );
  useEffect(() => {
    const id = window.setInterval(() => {
      if (stateRef.current === "SULKING" && meltdown.shouldResume(Date.now())) {
        meltdown.resumed();
        send({ type: "SULK_DONE" });
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [meltdown, send]);

  // In a real mirror the reflection is mirrored regardless of the feed setting.
  const mirrored = mode === "mirror" || settings.flipFeed;
  const gestures = useGestures({
    video: videoRef,
    cameraLive: camera.status === "live",
    mirrored,
    rotation: settings.cameraRotation,
    state,
    revealing,
    performanceMode: settings.performanceMode,
    send: sendWithMeltdown,
  });
  useEffect(() => {
    livePoses.current = () => gestures.posesRef.current ?? [];
  }, [gestures.posesRef]);

  // Pre-flight: warm the model connection on boot and during idle gaps, so the
  // first battle of the day never pays the cold start.
  useEffect(() => {
    warmUp();
    const id = window.setInterval(() => {
      if (isIdleState(stateRef.current) || stateRef.current === "READY") warmUp();
    }, WARMUP_EVERY_MS);
    return () => window.clearInterval(id);
  }, []);

  // ---- announcer + sound
  const announcer = useAnnouncer(settings.muted || settings.voiceMuted);
  const sound = useSoundEngine(settings.muted);
  const audioAllowed = useAudioAllowed(sound);
  // Quiet background loop + result jingle; never under a voice line (lib/kiosk/music.ts).
  // The crowd reacts to a solo aura (cheer, WOOOOO, crickets, awww, fail), right after the number is said.
  const reactions = useReactions(sound);
  const music = useKioskMusic({ sound, announcer, state, muted: settings.muted || settings.musicMuted, volume: settings.volume });
  useEffect(() => {
    announcer.setVolume(settings.volume);
    sound.setVolume(settings.volume);
  }, [announcer, sound, settings.volume]);
  /** The result moment: the jingle (the voice waits for it), or the old impact sound without the file. */
  const resultSting = useCallback(
    (negative = false) => {
      if (music.hasJingle) void announcer.interlude(() => music.playJingle());
      else if (negative) sound.sad();
      else sound.hit();
    },
    [music, announcer, sound],
  );
  const battleSound = useMemo(() => ({ hit: () => resultSting() }), [resultSting]);
  const leaderboard = useLeaderboard(5000, state !== "BOOT");
  // Challenger queue from shared cards ("BEAT THIS SCORE"), shown on the mode select.
  const challenges = useChallenges(isIdleState(state) || state === "READY");

  // What to do next, spoken (greeting, "show me some deuces", "strike a pose", nudges...).
  const pickPrompt = useVoicePrompts({ state, session, framing: gestures.debug.framing, battleWaiting: gestures.debug.battleWaiting, announcer });

  useEffect(() => {
    if (state === "SULKING") announcer.say([SULK_LINE]);
    if (state === "CHARGING" || state === "ANALYZING") sound.startHum(state === "CHARGING");
    else sound.stopHum();
  }, [state, announcer, sound]);

  // Battle result out loud: the duel call + commentary, or the squad countdown (last place first).
  useBattleAnnouncer({ state, session, announcer, sound: battleSound, pickPrompt, send });

  const auraSpoken = useRef<string | null>(null);
  const verdictSpoken = useRef<string | null>(null);
  useEffect(() => {
    if (!reveal || !session.scan) return;
    const id = session.scan.id;
    if (reveal.state.auraChars >= reveal.timeline.auraText.length && auraSpoken.current !== id) {
      auraSpoken.current = id;
      resultSting(session.scan.aura < 0);
      announcer.say(auraCallout(session.scan.aura), 450);
      const reaction = reactionFor(session.scan.aura);
      announcer.sound(() => reactions.play(reaction), 200);
    }
    if (reveal.state.verdict && verdictSpoken.current !== id) {
      verdictSpoken.current = id;
      announcer.sayPremium(judgesAnnouncement(session.scan.breakdown, session.scan.analysis.verdict));
      announcer.sayPremium([pickPrompt("resultActions")]);
    }
  }, [reveal, session.scan, announcer, resultSting, reactions, pickPrompt]);

  useEffect(() => {
    if (session.roast) announcer.sayPremium([session.roast]);
  }, [session.roast, announcer]);

  // Two fists with nobody else in frame: clowned out loud.
  useEffect(() => {
    if (session.soloRoastTick === 0 || session.soloRoastIndex === null) return;
    sound.sad();
    announcer.sayPremium(["Opponent not found.", SOLO_BATTLE_ROASTS[session.soloRoastIndex]]);
  }, [session.soloRoastTick, session.soloRoastIndex, announcer, sound]);

  useEffect(() => {
    if (leaderboard.kingTick > 0 && leaderboard.king) {
      sound.chime();
      announcer.say(["New aura king!", `${leaderboard.king.nickname}, with ${formatAura(leaderboard.king.aura)}.`], 300);
    }
  }, [leaderboard.kingTick, leaderboard.king, announcer, sound]);

  useEffect(() => {
    if (session.card) sound.chime();
  }, [session.card, sound]);

  // A friend tapped "BEAT THIS SCORE" on a shared card: call them up.
  // (Walk-ins the operator signs up join quietly; they get called by name.)
  useEffect(() => {
    const c = challenges.newest;
    if (challenges.joinedTick === 0 || !c || c.target === 0) return;
    sound.chime();
    announcer.sayPremium([`${c.name} wants to beat ${formatAura(c.target)}.`, "Step up to the mirror."]);
  }, [challenges.joinedTick, challenges.newest, announcer, sound]);

  // The operator called someone up from the dashboard.
  useEffect(() => {
    const c = challenges.called;
    if (challenges.calledTick === 0 || !c) return;
    sound.chime();
    announcer.sayPremium([`${c.name}! You're up.`, c.target ? `Beat ${formatAura(c.target)}. Step up to the mirror.` : "Step up to the mirror."]);
  }, [challenges.calledTick, challenges.called, announcer, sound]);

  // Tell the operator dashboard what the mirror is showing (on change + a heartbeat).
  useKioskStatusReporter(
    buildKioskStatus({
      state,
      session,
      mode,
      muted: settings.muted,
      musicMuted: settings.musicMuted,
      voiceMuted: settings.voiceMuted,
      camera: camera.status,
      people: gestures.debug.personCount,
      framing: gestures.debug.framing,
      scansToday: machine.scansToday,
    }),
  );

  const onSlotLock = useCallback((i: number) => sound.tick(i), [sound]);

  // ---- share card claim (thumbs up)
  const { cardProps, cardRef } = useCardClaim({ state, session, send, printingEnabled: settings.printingEnabled, publicBaseUrl });

  // Idle screen QR to phone scans (/scan) on the public site.
  const [phoneScan, setPhoneScan] = useState<{ qr: string; url: string } | null>(null);
  useEffect(() => {
    const url = `${publicBaseUrl ?? window.location.origin}/scan`;
    let cancelled = false;
    void makeKioskQrDataUrl(url).then((qr) => {
      if (!cancelled) setPhoneScan({ qr, url });
    });
    return () => {
      cancelled = true;
    };
  }, [publicBaseUrl]);

  // Thumbs down: fetch one extra roast for the current scan.
  const { scan, roastCount, roast } = session;
  useEffect(() => {
    if (!scan || roastCount < 1 || roast !== null) return;
    let cancelled = false;
    fetchRoast(scan)
      .then((text) => !cancelled && send({ type: "ROAST_READY", text }))
      .catch((err: unknown) => !cancelled && send({ type: "ROAST_READY", text: err instanceof Error ? err.message : "ROAST UNAVAILABLE." }));
    return () => {
      cancelled = true;
    };
  }, [scan, roastCount, roast, send]);


  // Usage stats refresh while the debug overlay is open.
  useEffect(() => {
    if (!debugOpen) return;
    let cancelled = false;
    const load = () => fetchUsageStats().then((u) => !cancelled && u && setUsage(u));
    void load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [debugOpen]);

  // Text scale: everything is rem-based, so scaling the root font does it.
  // Mirror mode reads from further away through glass, so it gets a boost on top.
  useEffect(() => {
    const scale = settings.textScale * (mode === "mirror" ? MIRROR_TEXT_BOOST : 1);
    document.documentElement.style.fontSize = `${scale * 100}%`;
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [settings.textScale, mode]);

  const setMode = useCallback((next: KioskMode) => router.replace(`/kiosk?mode=${next}`), [router]);
  const toggleMode = useCallback(() => setMode(mode === "mirror" ? "digital" : "mirror"), [mode, setMode]);
  const { fullscreen, toggleFullscreen } = useFullscreen();

  const simulateWave = useCallback(() => {
    sendWithMeltdown({ type: "WAVE", side: nextWaveSide });
    setNextWaveSide((s) => (s === "left" ? "right" : "left"));
  }, [sendWithMeltdown, nextWaveSide]);

  // ---- operator remote (/admin controls)
  const onRemote = useCallback(
    (command: RemoteCommandName) => {
      switch (command) {
        case "scan":
          send({ type: "SCAN" });
          break;
        case "battle":
          send({ type: "OPEN_LOBBY", mode: "duel" });
          break;
        case "squad":
          send({ type: "OPEN_LOBBY", mode: "squad" });
          break;
        case "start":
          send({ type: "START_BATTLE" });
          break;
        case "wave":
          simulateWave();
          break;
        case "reset":
          send({ type: "RESET" });
          break;
        case "mute":
          updateSettings({ muted: !settings.muted });
          break;
        case "music":
          updateSettings({ musicMuted: !settings.musicMuted });
          break;
        case "voice":
          updateSettings({ voiceMuted: !settings.voiceMuted });
          break;
        case "mode":
          toggleMode();
          break;
      }
    },
    [send, simulateWave, updateSettings, settings.muted, settings.musicMuted, settings.voiceMuted, toggleMode],
  );
  useRemote(onRemote);

  // Master volume in 10% steps (+ / -); turning it up also unmutes. The readout flashes on each press.
  const [volumeTick, setVolumeTick] = useState(0);
  const nudgeVolume = useCallback(
    (dir: 1 | -1) => {
      const volume = Math.round(Math.max(0, Math.min(1, settings.volume + dir * 0.1)) * 10) / 10;
      updateSettings(dir > 0 && settings.muted ? { volume, muted: false } : { volume });
      setVolumeTick((t) => t + 1);
    },
    [settings.volume, settings.muted, updateSettings],
  );

  const hotkeys = useMemo<HotkeyMap>(
    () => ({
      "+": () => nudgeVolume(1),
      "=": () => nudgeVolume(1),
      "-": () => nudgeVolume(-1),
      _: () => nudgeVolume(-1),
      Space: () => send({ type: "SCAN" }),
      W: simulateWave,
      // Aura Battles: B = 1v1 lobby, Q = squad lobby, V = two people at once, Enter = start.
      B: () => send({ type: "OPEN_LOBBY", mode: "duel" }),
      Q: () => send({ type: "OPEN_LOBBY", mode: "squad" }),
      V: () => send({ type: "BATTLE" }),
      Enter: () => send({ type: "START_BATTLE" }),
      X: () => send({ type: "SOLO_BATTLE" }),
      F: toggleFullscreen,
      R: () => send({ type: "RESET" }),
      M: () => updateSettings({ muted: !settings.muted }),
      D: () => setDebugOpen((v) => !v),
      S: () => setSettingsOpen((v) => !v),
      Escape: () => setSettingsOpen(false),
      U: () => send({ type: "THUMB_UP" }),
      N: () => send({ type: "THUMB_DOWN" }),
      P: () => send({ type: "OPEN_PALM" }),
      K: () => send({ type: "SULK" }),
      L: () => send({ type: "SULK_DONE" }),
      C: () =>
        setCostumeOverride((c) => {
          const order: (CostumeType | null)[] = [null, "mascot", "astronaut", "diver"];
          return order[(order.indexOf(c) + 1) % order.length];
        }),
      O: () => {
        const i = CAMERA_ROTATIONS.indexOf(settings.cameraRotation);
        updateSettings({ cameraRotation: CAMERA_ROTATIONS[(i + 1) % CAMERA_ROTATIONS.length] });
      },
      T: toggleMode,
    }),
    [send, simulateWave, updateSettings, settings.muted, settings.cameraRotation, toggleMode, toggleFullscreen, nudgeVolume],
  );
  // Operator hotkeys are off while a player types their leaderboard name.
  useHotkeys(hotkeys, state !== "NAME_ENTRY");

  const chooseMode = useCallback(
    (choice: ModeChoice) => {
      if (choice === "solo") send({ type: "SCAN" });
      else send({ type: "OPEN_LOBBY", mode: choice === "squad" ? "squad" : "duel" });
    },
    [send],
  );

  const view: KioskViewProps = {
    mode,
    state,
    session,
    enteredAt: machine.enteredAt,
    terminal: machine.terminal,
    scansToday: machine.scansToday,
    settings,
    updateSettings,
    camera,
    databaseConfigured,
    mockMode,
    fps,
    onFps: setFps,
    generateOptions,
    reveal,
    usage,
    toggleMode,
    fullscreen,
    toggleFullscreen,
    gestures,
    mirrored,
    leaderboard,
    onSlotLock,
    debugOpen,
    settingsOpen,
    closeSettings: () => setSettingsOpen(false),
    setMode,
    send: sendWithMeltdown,
    chooseMode,
    challengers: challenges.queue,
    phoneScan,
    reboot,
    quickBoot: machine.quickBoot,
    onBootDone,
  };

  return (
    <>
      {mode === "mirror" ? <MirrorLayout key={machine.bootCount} {...view} /> : <DigitalLayout key={machine.bootCount} {...view} />}
      {curtainTick > 0 && <BootCurtain key={`curtain-${curtainTick}`} />}
      {volumeTick > 0 && <VolumeOsd key={volumeTick} volume={settings.volume} muted={settings.muted} />}
      {!audioAllowed && !settings.muted && (
        <button type="button" className="sound-locked" onClick={() => sound.unlock()}>
          SOUND IS OFF: CLICK ANYWHERE OR PRESS ANY KEY
        </button>
      )}
      {cardProps && (
        <div className="card-offscreen" aria-hidden>
          <ShareCardView ref={cardRef} {...cardProps} />
        </div>
      )}
    </>
  );
}
