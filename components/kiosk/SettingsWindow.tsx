"use client";

import { OsWindow } from "./OsWindow";
import type { KioskViewProps } from "./props";

export function SettingsWindow(p: KioskViewProps) {
  const { settings, updateSettings } = p;
  return (
    <div className="modal-layer" role="dialog" aria-label="Settings">
      <OsWindow title="SETTINGS.EXE" variant="light" className="w-[min(92vw,30rem)]" onClose={p.closeSettings}>
        <div className="settings-grid">
          <label htmlFor="camera">CAMERA</label>
          <select
            id="camera"
            value={settings.cameraDeviceId ?? ""}
            onChange={(e) => updateSettings({ cameraDeviceId: e.target.value || null })}
          >
            <option value="">DEFAULT (USER FACING)</option>
            {p.camera.devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `CAMERA ${i + 1}`}
              </option>
            ))}
          </select>

          <label htmlFor="mode">DISPLAY MODE</label>
          <select id="mode" value={p.mode} onChange={(e) => p.setMode(e.target.value === "mirror" ? "mirror" : "digital")}>
            <option value="digital">DIGITAL (FLIPPED CAMERA FEED)</option>
            <option value="mirror">MIRROR (TWO-WAY MIRROR)</option>
          </select>

          <label htmlFor="flip">FEED</label>
          <label className="settings-check" htmlFor="flip">
            <input
              id="flip"
              type="checkbox"
              checked={settings.flipFeed}
              onChange={(e) => updateSettings({ flipFeed: e.target.checked })}
            />
            MIRROR THE LIVE FEED
          </label>

          <label htmlFor="fit">FEED FIT</label>
          <select id="fit" value={settings.feedFit} onChange={(e) => updateSettings({ feedFit: e.target.value as KioskViewProps["settings"]["feedFit"] })}>
            <option value="contain">FULL FRAME (LETTERBOX, NOTHING CROPPED)</option>
            <option value="cover">FILL SCREEN (CROPS THE EDGES)</option>
          </select>

          <label htmlFor="rotation">CAMERA MOUNT</label>
          <select
            id="rotation"
            value={settings.cameraRotation}
            onChange={(e) => updateSettings({ cameraRotation: Number(e.target.value) as KioskViewProps["settings"]["cameraRotation"] })}
          >
            <option value={0}>UPRIGHT (0°)</option>
            <option value={90}>SIDEWAYS, ROTATE 90° (O)</option>
            <option value={180}>UPSIDE DOWN (180°)</option>
            <option value={270}>SIDEWAYS, ROTATE 270°</option>
          </select>

          <label htmlFor="mirror-panel">MIRROR PANEL</label>
          <span className="flex items-center gap-2">
            <input
              id="mirror-panel"
              type="range"
              min={30}
              max={100}
              step={1}
              value={settings.mirrorPanelWidth}
              onChange={(e) => updateSettings({ mirrorPanelWidth: Number(e.target.value) })}
              title="Mirror mode: how much of the screen width (from the left) the UI uses. Everything to the right stays black for the reflection."
            />
            <span className="w-10 text-right font-mono text-xs">{settings.mirrorPanelWidth}%</span>
          </span>

          <label htmlFor="scale">TEXT SCALE</label>
          <span className="flex items-center gap-2">
            <input
              id="scale"
              type="range"
              min={0.8}
              max={1.6}
              step={0.05}
              value={settings.textScale}
              onChange={(e) => updateSettings({ textScale: Number(e.target.value) })}
            />
            <span className="w-10 text-right font-mono text-xs">{Math.round(settings.textScale * 100)}%</span>
          </span>

          <label htmlFor="perf">PERFORMANCE</label>
          <label className="settings-check" htmlFor="perf">
            <input
              id="perf"
              type="checkbox"
              checked={settings.performanceMode}
              onChange={(e) => updateSettings({ performanceMode: e.target.checked })}
            />
            PERFORMANCE MODE (HALF DETECTION RATE, NO GLOW)
          </label>

          <label htmlFor="glow">AURA GLOW</label>
          <label className="settings-check" htmlFor="glow">
            <input id="glow" type="checkbox" checked={settings.auraGlow} onChange={(e) => updateSettings({ auraGlow: e.target.checked })} />
            SEGMENTATION GLOW AROUND YOU (LIVE FEED + CAPTURE)
          </label>

          <label htmlFor="print">PRINTING</label>
          <label className="settings-check" htmlFor="print">
            <input
              id="print"
              type="checkbox"
              checked={settings.printingEnabled}
              onChange={(e) => updateSettings({ printingEnabled: e.target.checked })}
            />
            PRINT AURA CERTIFICATES
          </label>

          <label htmlFor="mute">ANNOUNCER</label>
          <label className="settings-check" htmlFor="mute">
            <input
              id="mute"
              type="checkbox"
              checked={settings.muted}
              onChange={(e) => updateSettings({ muted: e.target.checked })}
            />
            MUTED (M)
          </label>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase opacity-70">
          Camera: {p.camera.status}
          {p.camera.error ? ` (${p.camera.error})` : ""}. Press S or Esc to close.
        </p>
      </OsWindow>
    </div>
  );
}
