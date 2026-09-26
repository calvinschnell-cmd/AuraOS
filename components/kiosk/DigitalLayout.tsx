"use client";

import { SOLO_BATTLE_ROASTS } from "@/lib/copy";
import { showsModeSelect } from "@/lib/kiosk/machine";
import { BattleHero, BattleStrip, CommentaryWindow, LobbyWindow, ModeSelectWindow, VsIntro } from "./Battle";
import { BootScreen } from "./BootScreen";
import { CameraFeed } from "./CameraFeed";
import { DebugOverlay } from "./DebugOverlay";
import { Footer } from "./Footer";
import { GestureLegend } from "./GestureLegend";
import { GestureRing } from "./GestureRing";
import { LandmarkOverlay } from "./LandmarkOverlay";
import { LiveGlow } from "./LiveGlow";
import { MannequinView } from "./MannequinView";
import { OsWindow } from "./OsWindow";
import { PrivacyLine } from "./PrivacyLine";
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
  SystemErrorWindow,
  TideChartWindow,
} from "./StateWindows";
import { Terminal } from "./Terminal";
import { TopBar } from "./TopBar";
import { Wordmark } from "./Wordmark";
import type { KioskViewProps } from "./props";

/** Full design system layered over the flipped live camera feed. */
export function DigitalLayout(p: KioskViewProps) {
  const { state, session, reveal } = p;
  const idle = state === "SPINNING" || state === "ATTRACT";
  const scan = session.scan;
  const showingResult = reveal !== null && scan !== null && session.battle === null;
  const revealing = showingResult && !reveal.state.done;
  const battle = session.battle;
  const showingBattle = battle !== null && (state === "BATTLE_RESULT" || state === "CLAIM");
  const lobby = session.lobby;
  const inLobby = lobby !== null && (state === "LOBBY" || state === "LOBBY_COUNTDOWN");

  return (
    <div className="kiosk-root aura-grid-bg" data-mode="digital">
      <CameraFeed videoRef={p.camera.attachVideo} flipped={p.settings.flipFeed} rotation={p.settings.cameraRotation} fit={p.settings.feedFit} hidden={false} />
      <LiveGlow
        video={p.camera.videoRef}
        enabled={p.settings.auraGlow && p.camera.status === "live" && !p.settings.performanceMode && state !== "BOOT"}
        flipped={p.settings.flipFeed}
        rotation={p.settings.cameraRotation}
        fit={p.settings.feedFit}
      />
      <div className="kiosk-scanlines" aria-hidden />
      {p.debugOpen && <LandmarkOverlay debug={p.gestures.debug} mirrored={p.settings.flipFeed} fit={p.settings.feedFit} />}

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

          <main className="kiosk-main">
            <div className="kiosk-main__head">
              <Wordmark />
            </div>

            <div className="kiosk-main__stage">
              <MannequinView
                mode={p.mode}
                state={state}
                session={session}
                performanceMode={p.settings.performanceMode}
                onFps={p.onFps}
                generateOptions={p.generateOptions}
                onSlotLock={p.onSlotLock}
                className={idle ? "mannequin-view--corner" : ""}
                crewOverlay={showingBattle ? (xs) => <BattleStrip battle={battle} reveal={session.reveal} xs={xs} enteredAt={state === "BATTLE_RESULT" ? p.enteredAt : 0} /> : undefined}
              />
              {showingBattle && <BattleHero battle={battle} reveal={session.reveal} enteredAt={state === "BATTLE_RESULT" ? p.enteredAt : 0} />}
              {state === "BATTLE_INTRO" && lobby && <VsIntro lobby={lobby} />}
              {session.meltdown === "annoyed" && state !== "SULKING" && <AngerSymbol />}
              <div className={`stage-overlays ${showingResult ? "stage-overlays--result" : ""}`}>
                {state === "COUNTDOWN" && <CountdownOverlay enteredAt={p.enteredAt} />}
                {state === "LOBBY_COUNTDOWN" && <CountdownOverlay enteredAt={p.enteredAt} />}
                {state === "GREETING" && <GreetingWindow session={session} />}
                {(idle || state === "READY") && <FramingWindow framing={p.gestures.debug.framing} />}
                {(idle || state === "READY") && <BattleWaitingWindow waiting={p.gestures.debug.battleWaiting} />}
                {(idle || state === "READY") && session.soloRoastIndex !== null && (
                  <SoloBattleWindow key={session.soloRoastTick} text={SOLO_BATTLE_ROASTS[session.soloRoastIndex]} />
                )}
                {showingResult && (
                  <OsWindow title="CAPTURE.JPG" className="reveal-photo-window" still>
                    {scan.mock && <MockNotice />}
                    <RevealPhoto scan={scan} reveal={reveal} glow={p.settings.auraGlow && !p.settings.performanceMode} />
                  </OsWindow>
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
                {inLobby && <LobbyWindow lobby={lobby} state={state} onStart={() => p.send({ type: "START_BATTLE" })} />}
                {showsModeSelect(state) && <ModeSelectWindow onChoose={p.chooseMode} challengers={p.challengers} />}
                {state === "READY" && session.errorMessage && <SystemErrorWindow message={session.errorMessage} />}
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
            </div>

            <aside className="kiosk-main__side">
              {showingResult ? (
                <OsWindow title="ANALYSIS_RESULT.EXE" className="flex-1" still>
                  <RevealPanel scan={scan} reveal={reveal} />
                </OsWindow>
              ) : showingBattle ? (
                <CommentaryWindow battle={battle} reveal={session.reveal} done={session.commentaryDone} />
              ) : (
                <OsWindow title="TERMINAL.EXE" className="flex-1" still>
                  <Terminal entries={p.terminal} maxLines={7} />
                </OsWindow>
              )}
              {idle && <TideChartWindow snapshot={p.leaderboard.snapshot} kingTick={p.leaderboard.kingTick} />}
            </aside>

            <div className="kiosk-main__foot">
              <GestureRing progressRef={p.gestures.progressRef} />
              <GestureLegend state={state} suppressed={revealing} />
              {idle && <PrivacyLine />}
            </div>
          </main>

          <Footer onReboot={p.reboot} />
        </div>
      )}

      {p.settingsOpen && <SettingsWindow {...p} />}
      {p.debugOpen && <DebugOverlay {...p} />}
    </div>
  );
}
