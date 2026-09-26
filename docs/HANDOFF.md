# AURA OS: handoff (state as of 2026-09-26)

Read this first in a new session. Everything below is committed on `main`
(https://github.com/calvinschnell-cmd/AuraOS) and deployed, unless listed under
"Open issues". Deeper references: [aura-battles.md](./aura-battles.md) (spec →
code map), [DEVPOST.md](./DEVPOST.md), the README, `AGENTS.md` (Next 16 rules,
MOCK MODE, verify commands).

## What it is

A HackGT 13 smart-mirror kiosk. **Aura Battles** is the headline mode: 1v1 and
squad (2-5) outfit battles scored on **fit** (GPT-4o-mini vision, Gemini as a
second judge on solo scans) + **pose** (MediaPipe landmarks → trained classifier +
geometry detectors). Solo Scan is the warm-up. Cards (4:5 PNG, QR to `/r/[id]`)
feed a phone companion site. Data lives in Tiger Data (TimescaleDB).

## Screens and URLs

| Screen | Where | What |
| --- | --- | --- |
| Mirror (user side) | kiosk laptop, portrait monitor, `http://localhost:3000/kiosk?mode=mirror` | The kiosk. Full screen in its own Chrome profile (`%LOCALAPPDATA%\AuraOS\chrome-mirror`). |
| Admin (laptop) | `http://localhost:3000/admin` | The one admin page (`/operator` and `/remote` redirect here): mirror status (what's on screen, camera, people in frame), OPEN MIRROR, controls, sign-ups (walk-ins, CALL UP, remove), live feed, standings with EDIT / DELETE, today's stats, phone QR (tap → full screen for judges). Unlock with `ADMIN_KEY` (remembered in localStorage). On the public server only the feed, standings, board edits and QR work (mirror state, controls and sign-ups are per server); a banner says so. |
| Phones | https://www.aurafulos.tech (also https://aurafulos.tech, https://155-138-165-43.sslip.io) | `/feed`: card just scanned (react live) + FEED (last 30 min) and STANDINGS (top 10, tap → card) tabs. `/r/[id]`: a card (react, BEAT THIS SCORE → queue, THIS WAS ME → claim). `/u/[handle]`: shareable profile (every card tied to the AURA ID). `/leaderboard`: big-screen Tide Chart (its QR opens `/feed?tab=standings`). |

Launch both screens: `npm run kiosk:launch` (mirror on the portrait display,
admin on the main one). `npm run kiosk:launch -- -MirrorOnly` reopens only
the mirror; `-DryRun` prints the plan. The dashboard's OPEN MIRROR button runs
the same launcher (`/api/operator/mirror`, Windows laptop only; refused while a
mirror is reporting).

The kiosk laptop runs the full app locally (`npm run dev`, or `npm run build` +
`npm run start`, plus `npm run ml` for the CUDA garment segmenter on :8001).
QR codes use `PUBLIC_BASE_URL=https://www.aurafulos.tech` from `.env.local`.

## Deploy (public server)

- Vultr `vhp-2c-4gb`, Atlanta, Ubuntu 24.04, IP `155.138.165.43`. SSH key:
  `~/.ssh/aura_vultr` (no passphrase), `ssh -i ~/.ssh/aura_vultr root@155.138.165.43`.
- `bash scripts/server/deploy.sh` ships the committed HEAD (git archive) + the
  laptop's `.env.local` (PUBLIC_BASE_URL forced to www), builds on the box,
  restarts the `aura` systemd service. Caddy serves HTTPS for the apex, www and
  sslip.io names. One-time box setup: `scripts/server/setup.sh`.
- Domain `aurafulos.tech` (get.tech, MLH offer): A records `@` and `www` →
  155.138.165.43. Owner info is public in WHOIS (privacy protection off);
  auto-renew is on at $29.99/yr. Vultr credit $100; destroy the instance after
  the event (stopped instances still bill).
- Logs: `ssh ... journalctl -u aura -f`.

## Keys and config

All in `.env.local` (gitignored, never commit): OpenAI, Gemini (default model
`gemini-3.8-flash`; Google was overloaded when last tested, scans fall back to
GPT alone after 10 s), ElevenLabs, Tiger Data, Solana, `ADMIN_KEY` (the user
chose their own on 2026-09-26), `PUBLIC_BASE_URL`. A deploy copies it to the
server.

## Scoring rules worth knowing

- Aura: judges' specialness → aura curve (`lib/scoring.ts`); house penalties on
  top: shorts −80k, clashing colorways (color harmony < 45) up to −180k, pieces
  that don't go (style consistency < 45) up to −112.5k; no outfit visible = flat
  −1,000,000.
- Battles: total = fit + (pose − 40) × 2,500. Squads reveal as a countdown from
  dead last to first (voice-synced, `lib/battle/reveal.ts`,
  `lib/kiosk/useBattleAnnouncer.ts`); thumbs up waits for the champion.
- Pose (`lib/pose/`): 6-class MLP (runway, hero, action, fighter, dance,
  standing) trained on 500 Wikimedia Commons photos (1,380 downloaded; CV ~46%,
  chance 17%; `ml-service/pose/REPORT.md`) + geometry detectors: superhero power
  pose (fists on hips → HERO STANCE ~80) and everyday photo poses (hand by the
  face / peace, hands together, looking away → MAIN CHARACTER 52-70). The
  "aesthetic" category has only 22 usable photos, so it is rule-based
  (`RULE_ARCHETYPES`), not trained. `/pose-lab` records labeled samples from the
  kiosk camera; `npm run pose:extract` + `npm run pose:train` retrain.
- Styles now include coquette, balletcore, boho, glam, clean girl; detected
  dresses render as a knee-length dress on the mannequin (maxi → gown).
- Commentary: gut reactions, casual swearing allowed (one per line), never about
  the person. Judge model names are never shown (JUDGE 1 / JUDGE 2).

## Kiosk behavior changed recently

- Wave = a spoken "hi", less enthusiastic every wave before the next scan; wave
  6 → sulk (count resets on scan / idle).
- End-session palm only counts when raised above the waist (70% from shoulders
  to hips), held 1.5 s.
- The mannequin turns to face front when a scan or lobby starts mid-spin.
- Operator sign-ups: walk-ins added on the dashboard; CALL UP makes the mirror
  announce the name at the mode select.

## Open issues / next steps

1. **Mirror camera shows "error"** after the last relaunches: something else
   holds the webcam (likely an old `AURA OS // KIOSK` tab in the user's normal
   Chrome, or Discord). Close it, F5 the mirror; if still failing press S and
   pick "Live Streamer CAM 313" (OBS / NVIDIA Broadcast virtual cams are also
   listed).
2. Real-camera test of the full flow with people (wave → solo → card QR on a
   phone → 1v1 → squad) has not been done end to end.
3. Start `npm run ml` (garment segmenter) on the kiosk laptop; logs showed it
   offline ("segmenter unavailable at 127.0.0.1:8001").
4. Peace signs are read as "hand by the face" (body landmarks have no fingers);
   using the hand tracker's Victory gesture at capture time would be exact.
5. Gemini judge availability (503 / timeouts from Google at last check).

## Gotchas (for whoever continues)

- Next 16 + Turbopack: read `node_modules/next/dist/docs/` before APIs; dev CSS
  sometimes goes stale after appending rules (touch the CSS file).
- Windows: never `python -` with a heredoc (spawns an interactive REPL); write
  scripts to files. Files are CRLF in places: patch with the Edit tool or
  normalize line endings. Don't spawn PowerShell `detached` from Node (it exits
  without running).
- The dev server's cached store instance is rebuilt when the class changes
  (`getScanStore`), so new store methods work after hot reload.
- Verify with `npm run lint`, `npm run typecheck`, `npm test` (200 tests), and
  `npm run build` (don't build into `.next` while `next dev` is running).
