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
| Admin | `http://localhost:3000/admin` on the laptop, or https://www.aurafulos.tech/admin from anywhere | The one admin page (`/operator` and `/remote` redirect here): mirror status (what's on screen, camera, people in frame), OPEN MIRROR, controls, sign-ups (walk-ins, CALL UP, remove), live feed, standings with EDIT / DELETE, today's stats, phone QR (tap → full screen for judges). Controls include MUTE ALL, MUTE MUSIC and MUTE VOICE (labels flip to UNMUTE from the mirror's reported state). Unlock with `ADMIN_KEY` (remembered in localStorage). Works the same from the public server: see "Kiosk relay" below. |
| Phones | https://www.aurafulos.tech (also https://aurafulos.tech, https://155-138-165-43.sslip.io) | An app shell (`components/companion/AppShell.tsx`): sticky top bar + bottom tab bar HOME · FEED · BOARD · ME (JOIN until you have an AURA ID). `/me`: get an AURA ID, or jumps to your profile. `/feed`: card just scanned (react live) + FEED (last 30 min) and STANDINGS (top 10, tap → card) tabs. `/r/[id]`: a card (react, BEAT THIS SCORE → queue, THIS WAS ME → claim). `/u/[handle]`: shareable profile (every card tied to the AURA ID). `/leaderboard`: big-screen Tide Chart (its QR opens `/feed?tab=standings`). |

Launch both screens: `npm run kiosk:launch` (mirror on the portrait display,
admin on the main one). `npm run kiosk:launch -- -MirrorOnly` reopens only
the mirror; `-DryRun` prints the plan. The dashboard's OPEN MIRROR button runs
the same launcher (`/api/operator/mirror`; refused while a mirror is reporting).
Every page but the launcher has a HOME link bottom-left (on `/kiosk` and
`/leaderboard` it only shows while the mouse moves; the phone pages use the tab
bar's HOME instead).

### Phone app look and motion

Same AURA OS language (dark OS windows, cyan, Silkscreen/VT323, no rounded
corners). Motion is stepped (`steps()`), in `app/companion.css` under "app
shell": blocks wipe in top-down, rows stagger in (`.rise` + `--i`), aura numbers
decode like a terminal (`DecodeNumber.tsx`), reactions pop with a floating +1,
a "↑ N NEW CARDS" pill when cards arrive while scrolled down, blinking loading
placeholders. Everything is off under `prefers-reduced-motion`. The feed tab
lives in the URL (`?tab=standings`), so the tab bar's BOARD and the in-page
tabs stay in sync.

### Kiosk audio

- Voice: `lib/kiosk/announcer.ts` (one queue; ElevenLabs clips or the browser
  voice). Effects: `lib/kiosk/sound.ts` (Web Audio, synthesized).
- Music: `lib/kiosk/music.ts`, mirror only. A quiet background loop
  (`public/audio/kiosk-bg.flac`, loops 0:00 → 1:22 of a 1:32 track) and a result
  jingle (`public/audio/result-jingle.flac`, 2.4 s). **These files are
  third-party game music and are gitignored**: they exist only on the kiosk
  laptop, never on GitHub or the public server (which returns 404 for them).
  Without the files the kiosk is silent and falls back to the old hit/sad sounds.
- Nothing overlaps: the loop fades out whenever the voice queue is busy, during
  CHARGING / COUNTDOWN / ANALYZING / LOBBY_COUNTDOWN / BATTLE_INTRO, and during
  the jingle; it returns 1.5 s after the voice goes quiet. The jingle plays on a
  solo result (when the aura finishes typing) and on entering a battle result,
  via `Announcer.interlude`: the line being spoken finishes, then the jingle,
  then queued lines resume.
- Volume: `+`/`=` and `-`/`_` on the kiosk change the master volume (voice,
  music, effects) in 10% steps, with an on-screen bar (`VolumeOsd.tsx`); `+`
  also unmutes. Saved in the kiosk settings (`volume`, `musicMuted`,
  `voiceMuted` in `KioskSettings`); remote commands `music` / `voice` toggle the
  last two.
- Loop points are editable: `/music-lab` has LOOP START / LOOP END (slider,
  seconds, ±0.1 s, SET = PLAYHEAD, click the bar to seek), HEAR THE SEAM,
  PAUSE / RESUME, and SAVE (ADMIN_KEY) / REVERT / DEFAULT. Saved to
  `public/audio/loop.json` on the laptop (gitignored) via `/api/music-loop`;
  the mirror re-reads it every 30 s (`MusicEngine.refreshLoop`), no reload. A
  start after 0:00 = the intro plays once, then [start, end) repeats. Validation
  in `lib/kiosk/musicLoop.ts` (start < end, ≥ 1 s apart).
- Crowd reactions after a solo aura (`lib/kiosk/reactionTiers.ts`,
  `lib/kiosk/reactions.ts`), same bands as the voice callouts: ≥ 500k WOOOOO,
  ≥ 150k little cheer, −150k..150k crickets, −500k..−150k awwww, ≤ −500k a
  cartoon fart. Queued with `Announcer.sound()` right after the aura callout
  (jingle → "Your aura is…" → reaction → verdict), so nothing overlaps; the loop
  stays ducked through it. Clips come from `/api/sfx/[name]`: generated once
  with the ElevenLabs sound-effects API and saved to
  `public/audio/reactions/*.mp3` (gitignored; all five were generated on the
  laptop on 2026-09-26). Without a key or clips (MOCK MODE) each reaction is
  synthesized in Web Audio. They play through the effects master: MUTE ALL and
  volume apply, MUTE MUSIC / MUTE VOICE don't. Solo scans only (not battles).
- `/music-lab`: developer page with the real engine: the loop editor above, the
  jingle, each crowd reaction (labelled CLIP or SYNTH), and a full result
  (jingle → voice → reaction → loop returns). Only has music where the files
  exist (the laptop).

### Kiosk relay

The mirror talks to the laptop's server; phones and judges use the public one.
With Tiger Data configured, both share the relay tables (`lib/server/relay.ts`,
tables `kiosk_status`, `remote_commands`, `challengers`, `mirror_launches`), so
`/admin` on either server sees the mirror, sends controls, and manages the same
line (BEAT THIS SCORE taps on phones reach the mirror). OPEN MIRROR on the
public server leaves a launch request; the laptop's server polls for it every
3 s (`instrumentation.ts` → `lib/server/mirrorLaunch.ts`, Windows + Tiger only)
and runs the launcher, so the laptop server must be running. Without Tiger
(MOCK MODE) all of this stays in one server's memory, and the public `/admin`
shows a banner saying to use the laptop.

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

## Checks and demo tooling

- `npm run relay:check`: exercises the relay against the Tiger database in
  `.env.local` (status, commands, the line, launch requests) and removes its
  test rows.
- `npm run demo:screens`: starts its own MOCK MODE server on :3200 with a
  throwaway ADMIN_KEY, seeds it through the API, drives headless Chrome (muted)
  and writes `docs/demo/screens/*.png` + `docs/demo/screens.json` (19 checks:
  admin, relay display, board edits, judges QR, phone tabs, HOME links,
  redirects). These are feature screenshots, **not** hackathon timeline proof.
- `node scripts/dev-mock.mjs` (the `aura-os-mock` launch config, :3100) uses
  the real `ADMIN_KEY` from `.env.local` unless one is passed in the env.

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
6. **Kiosk audio not yet heard on the real mirror.** The loop point was checked
   in `/music-lab` (1:17 → 1:22 → wraps to 0:00), but the jingle → voice order
   and the ducking (and now the crowd reactions) have only been checked in the lab, not
   heard end to end with the ElevenLabs voice. Levels (`BG_LEVEL` 0.12,
   `JINGLE_LEVEL` 0.5) may need tuning in the room. Open question for the user:
   jingle on battle results too, or solo scans only (currently both).
7. OPEN MIRROR from the public `/admin` gives no feedback if the laptop server
   is off (the request just expires after 30 s).
8. **Hackathon timeline proof: undecided.** The user asked for proof that
   everything was built after the event started. The evidence does not show
   that: the project folder, `SPEC.md` and the Next.js scaffold were created
   2026-09-22 ~04:30 local, Claude Code sessions for this project start
   2026-09-22 08:34 UTC, and the first git commit (2026-09-25 21:10) adds ~42k
   lines at once. Do not fabricate or alter timestamps, history or logs. Offered
   instead: an accurate timeline of what the sources show, or (given the
   official start time) a list of what was built after it, and/or disclosing
   the pre-event spec/scaffold to the organizers.

## Gotchas (for whoever continues)

- Next 16 + Turbopack: read `node_modules/next/dist/docs/` before APIs; dev CSS
  sometimes goes stale after appending rules (touch the CSS file).
- Windows: never `python -` with a heredoc (spawns an interactive REPL); write
  scripts to files. Files are CRLF in places: patch with the Edit tool or
  normalize line endings. Don't spawn PowerShell `detached` from Node (it exits
  without running).
- The dev server's cached store instance is rebuilt when the class changes
  (`getScanStore`), so new store methods work after hot reload.
- Shell edits: `node -e "..."` scripts and heredocs break on backticks and some
  quotes (bash expands them); for multi-line code or CSS, use the Edit/Write
  tools, or write the snippet to a file and append it.
- `next dev` adds each dist dir it sees (`.next-mock`, `.next-demo`) to
  `tsconfig.json` includes; eslint ignores them in `eslint.config.mjs`.
- Verify with `npm run lint`, `npm run typecheck`, `npm test` (208 tests), and
  `npm run build` (don't build into `.next` while `next dev` is running).
