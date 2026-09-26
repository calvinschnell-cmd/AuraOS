# Opens both screens for the event (Windows):
#   - the MIRROR: /kiosk?mode=mirror, full screen (Chrome kiosk mode) on the
#     portrait monitor (or the first non-primary display),
#   - the OPERATOR dashboard: /operator on the laptop's main display.
# The server must already be running (npm run dev, or npm run build + npm run start,
# and npm run ml for the garment segmenter).
#
#   npm run kiosk:launch                 # defaults
#   npm run kiosk:launch -- -Base http://localhost:3000 -MirrorDisplay 2
#
# The mirror uses its own Chrome profile (so kiosk mode never takes over your
# normal browser). First launch only: click Allow on the camera prompt; set the
# camera mount with S on the mirror if the feed is sideways.
param(
  [string]$Base = "http://localhost:3000",
  # 1-based index into the display list printed below; 0 = pick the portrait monitor automatically.
  [int]$MirrorDisplay = 0
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "Chrome not found. Install Google Chrome." }

try {
  Invoke-WebRequest -Uri "$Base/api/warmup" -Method Post -UseBasicParsing -TimeoutSec 20 | Out-Null
} catch {
  throw "AURA OS is not answering at $Base. Start it first: npm run dev (or npm run build; npm run start)."
}

$screens = [System.Windows.Forms.Screen]::AllScreens
$i = 0
foreach ($s in $screens) {
  $i++
  $b = $s.Bounds
  $tags = @()
  if ($s.Primary) { $tags += "primary" }
  if ($b.Height -gt $b.Width) { $tags += "portrait" }
  Write-Host ("  display {0}: {1}x{2} at {3},{4} {5}" -f $i, $b.Width, $b.Height, $b.X, $b.Y, ($tags -join " "))
}

if ($MirrorDisplay -gt 0) {
  $mirror = $screens[$MirrorDisplay - 1]
} else {
  $mirror = $screens | Where-Object { -not $_.Primary -and $_.Bounds.Height -gt $_.Bounds.Width } | Select-Object -First 1
  if (-not $mirror) { $mirror = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1 }
  if (-not $mirror) { $mirror = [System.Windows.Forms.Screen]::PrimaryScreen; Write-Host "  only one display: the mirror opens on it too" }
}
$m = $mirror.Bounds
Write-Host ("  mirror  -> {0}x{1} at {2},{3}" -f $m.Width, $m.Height, $m.X, $m.Y)

$mirrorProfile = Join-Path $env:LOCALAPPDATA "AuraOS\chrome-mirror"
New-Item -ItemType Directory -Force -Path $mirrorProfile | Out-Null
Start-Process -FilePath $chrome -ArgumentList @(
  "--user-data-dir=`"$mirrorProfile`"",
  "--no-first-run",
  "--no-default-browser-check",
  "--autoplay-policy=no-user-gesture-required",
  "--disable-session-crashed-bubble",
  "--window-position=$($m.X),$($m.Y)",
  "--window-size=$($m.Width),$($m.Height)",
  "--kiosk",
  "$Base/kiosk?mode=mirror"
)

Start-Sleep -Milliseconds 800
Write-Host "  operator -> main display ($Base/operator)"
Start-Process -FilePath $chrome -ArgumentList @("--new-window", "$Base/operator")

Write-Host ""
Write-Host "Mirror: Alt+F4 closes it (it is a separate Chrome profile). Operator: unlock once with ADMIN_KEY from .env.local."
