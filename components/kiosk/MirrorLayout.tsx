"use client";

import type { CSSProperties } from "react";
import { auraMagnitude } from "@/lib/scoring";
import { SOLO_BATTLE_ROASTS } from "@/lib/copy";
import { showsModeSelect } from "@/lib/kiosk/machine";
import { BattleHero, BattleStrip, CommentaryWindow, LobbyWindow, ModeSelectWindow, VsIntro } from "./Battle";
import { BootScreen } from "./BootScreen";
import { CameraFeed } from "./CameraFeed";
import { DebugOverlay } from "./DebugOverlay";
import { GestureLegend } from "./GestureLegend";
import { GestureRing } from "./GestureRing";
import { LandmarkOverlay } from "./LandmarkOverlay";
import { MannequinView } from "./MannequinView";
import { OsWindow } from "./OsWindow";
import { RevealPanel, RevealPhoto } from "./Reveal";
import { SettingsWindow } from "./SettingsWindow";
import {
  AngerSymbol,
  BattleWaitingWindow,
  ClaimWindow,
  CountdownOverlay,
  FramingWindow,
  GreetingWindow,
  MockNotice,
  NameEntryWindow,
  RoastWindow,
  SoloBattleWindow,
  PhoneScanWindow,
  SystemErrorWindow,
  TideChartWindow,
} from "./StateWindows";
import { Terminal } from "./Terminal";
import { TopBar } from "./TopBar";
import { Wordmark } from "./Wordmark";
import type { KioskViewProps } from "./props";

/**
 * Two-way mirror layout: pure black, cyan-only UI, nothing drawn over the
 * live reflection. The display sits in the top-left of a 24x36 mirror, so the
 * person's reflection covers the right of the screen: every panel lives in a
 * left column (settings: MIRROR PANEL, default 45%) and the rest stays black.
 * The mannequin renders as the full shaded model so the outfit reads through
 * the glass; analysis is shown on the frozen captured photo, never the live
 * reflection. Same state as DigitalLayout; only the presentation differs.
 */
export function MirrorLayout(p: KioskViewProps) {
  const { state, session, reveal } = p;
  const idle = state === "SPINNING" || state === "ATTRACT";
  const scan = session.scan;
  const showingResult = reveal !== null && scan !== null && session.battle === null;
  const revealing = showingResult && !reveal.state.done;
  const auraTyped = reveal ? reveal.timeline.auraText.slice(0, reveal.state.auraChars) : "";
  const battle = session.battle;
  const showingBattle = battle !== null && (state === "BATTLE_RESULT" || state === "CLAIM");
  const lobby = session.lobby;
  const inLobby = lobby !== null && (state === "LOBBY" || state === "LOBBY_COUNTDOWN");

  return (
    <div className="kiosk-root" data-mode="mirror" style={{ "--mirror-panel": `${p.settings.mirrorPanelWidth}%` } as CSSProperties}>
      {/* Camera stays mounted (hidden) so frames can be captured for analysis. */}
      <CameraFeed videoRef={p.camera.attachVideo} flipped={p.settings.flipFeed} rotation={p.settings.cameraRotation} hidden />
      {/* Debug only: the mirror never draws over the live reflection otherwise. */}
      {p.debugOpen && <LandmarkOverlay debug={p.gestures.debug} mirrored={p.mirrored} />}

      {state === "BOOT" ? (
        <BootScreen mode={p.mode} databaseConfigured={p.databaseConfigured} mockMode={p.mockMode} cameraStatus={p.camera.status} quick={p.quickBoot} onDone={p.onBootDone} />
      ) : (
        <div className="kiosk-chrome">
          <TopBar
            scansToday={p.scansToday}
            mode={p.mode}
            live={p.camera.status === "live"}
            onToggleMode={p.toggleMode}
            fullscreen={p.fullscreen}
            onToggleFullscreen={p.toggleFullscreen}
          />

          <main className="kiosk-main kiosk-main--mirror">
            <div className="kiosk-main__head">
              <Wordmark compact />
              {showingResult && auraTyped && (
                <div className={`mirror-aura reveal-aura--${auraMagnitude(scan.aura)}`}>
                  <span className="font-heading text-xs uppercase">AURA</span>
                  <span className="font-number mirror-aura__value aura-text-glow">{auraTyped}</span>
                </div>
              )}
            </div>

            {/* Results: the guy keeps the left of the stage and the capture sits beside him. */}
            <div className={`kiosk-main__stage ${showingResult ? "kiosk-main__stage--split" : ""}`}>
              <MannequinView
                mode={p.mode}
                state={state}
                session={session}
                performanceMode={p.settings.performanceMode}
                onFps={p.onFps}
                generateOptions={p.generateOptions}
                onSlotLock={p.onSlotLock}
                className="mannequin-view--mirror"
                crewOverlay={showingBattle ? (xs) => <BattleStrip battle={battle} reveal={session.reveal} xs={xs} enteredAt={state === "BATTLE_RESULT" ? p.enteredAt : 0} /> : undefined}
              />
              {state === "BATTLE_INTRO" && lobby && <VsIntro lobby={lobby} />}
              {session.meltdown === "annoyed" && state !== "SULKING" && <AngerSymbol />}
              {showingResult && state !== "CLAIM" && (
                <OsWindow title="CAPTURE.JPG" className="reveal-photo-window mirror-stage-photo" still>
                  {scan.mock && <MockNotice />}
                  <RevealPhoto scan={scan} reveal={reveal} glow={false} />
                </OsWindow>
              )}
              <div className="stage-overlays">
                {(state === "COUNTDOWN" || state === "LOBBY_COUNTDOWN") && <CountdownOverlay enteredAt={p.enteredAt} />}
                {state === "GREETING" && <GreetingWindow session={session} />}
                {(idle || state === "READY") && <FramingWindow framing={p.gestures.debug.framing} />}
                {(idle || state === "READY") && <BattleWaitingWindow waiting={p.gestures.debug.battleWaiting} />}
                {(idle || state === "READY") && session.soloRoastIndex !== null && (
                  <SoloBattleWindow key={session.soloRoastTick} text={SOLO_BATTLE_ROASTS[session.soloRoastIndex]} />
                )}
                {state === "RESULT" && session.roastCount > 0 && <RoastWindow text={session.roast} />}
                {state === "NAME_ENTRY" && (
                  <NameEntryWindow
                    suggestion={session.scan?.analysis.nickname ?? "MYSTERY FIT"}
                    onSubmit={(name, handle) => p.send({ type: "NAME_SUBMIT", name, handle })}
                    onCancel={() => p.send({ type: "NAME_CANCEL" })}
                  />
                )}
                {state === "CLAIM" && <ClaimWindow card={session.card} error={session.cardError} printing={session.printing} badge={session.badge} />}

                {state === "READY" && session.errorMessage && <SystemErrorWindow message={session.errorMessage} />}
              </div>
            </div>

            {/* Results need the room: the terminal steps aside while they are up. */}
            {!showingResult && !showingBattle && (
              <aside className="kiosk-main__side">
                {idle && <TideChartWindow snapshot={p.leaderboard.snapshot} kingTick={p.leaderboard.kingTick} />}
                <OsWindow title="TERMINAL.EXE" className="flex-1" still>
                  <Terminal entries={p.terminal} maxLines={6} />
                </OsWindow>
              </aside>
            )}

            {/* Lower half: the frozen capture with its analysis (never over the live view). */}
            <div className="kiosk-main__lower">
              {showingResult && (
                <OsWindow title="ANALYSIS_RESULT.EXE" className="reveal-panel-window" still>
                  <RevealPanel scan={scan} reveal={reveal} />
                </OsWindow>
              )}
              {showingBattle && <BattleHero battle={battle} reveal={session.reveal} enteredAt={state === "BATTLE_RESULT" ? p.enteredAt : 0} />}
              {showingBattle && <CommentaryWindow battle={battle} reveal={session.reveal} done={session.commentaryDone} />}
              {inLobby && <LobbyWindow lobby={lobby} state={state} onStart={() => p.send({ type: "START_BATTLE" })} />}
              {showsModeSelect(state) && <ModeSelectWindow onChoose={p.chooseMode} challengers={p.challengers} />}
              {idle && p.phoneScan && <PhoneScanWindow qr={p.phoneScan.qr} url={p.phoneScan.url} />}
              {state === "ANALYZING" && (
                <OsWindow title="ANALYZER.EXE" className="w-[min(80vw,20rem)]">
                  <div className="analyzing font-heading text-xs uppercase">
                    ANALYZING DRIP
                    <span className="analyzing__dots" />
                  </div>
                  <div className="progress-bar mt-2">
                    <span className="progress-bar__fill" />
                  </div>
                </OsWindow>
              )}
            </div>

            <div className="kiosk-main__foot">
              <GestureRing progressRef={p.gestures.progressRef} />
              <GestureLegend state={state} suppressed={revealing} />
            </div>
          </main>
        </div>
      )}

      {p.settingsOpen && <SettingsWindow {...p} />}
      {p.debugOpen && <DebugOverlay {...p} />}
    </div>
  );
}
