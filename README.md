# AURA OS: Aura Battles (HackGT 13)

**AURA OS is a social outfit-battling platform.** Step up to a smart mirror, strike a pose, and
battle a friend (or your whole squad) on two axes at once: how good the fit is and how hard you
commit to the pose. An AI judge scores the outfits, a pose classifier trained on MediaPipe
landmarks scores the poses, an announcer calls the result, and every battle becomes a shareable
card with a QR that drops friends straight onto that battle with a **BEAT THIS SCORE** button.

Modes inside AURA OS:

- **Aura Battles** (headline): 1v1. Player 1 steps up and captures, Player 2 steps up, VS, result.
- **Squad**: the same lobby for 2 to 5 players, a group Aura score and a "vibe archetype".
- **Solo Scan**: the quick single-player warm-up (the original scanner, dual AI judges).

Around the kiosk: a phone-first companion app (public feed, reactions, the per-result deep link,
"this was me" claims, a challenger queue), and a leaderboard with narrative rows (Rivalry of the
Day, Squad Champion, win streaks, most improved).

Specs: [SPEC.md](./SPEC.md) (kiosk build stages) and
[docs/aura-battles.md](./docs/aura-battles.md) (the Aura Battles platform: every spec item mapped
to the code). Devpost write-up draft: [docs/DEVPOST.md](./docs/DEVPOST.md).

## Stack

Next.js (App Router) · TypeScript · Tailwind v4 · Three.js · MediaPipe Tasks Vision ·
Two AI judges: OpenAI `gpt-4o-mini` + Google Gemini 2.5 Flash (structured outputs) · local
segformer garment segmentation (Python FastAPI sidecar on CUDA) · a pose-archetype classifier
(MLP trained on MediaPipe landmarks from ~800 Wikimedia Commons photos) · Tiger Data (TimescaleDB) ·
ElevenLabs voice · Solana compressed-NFT badges (Metaplex Bubblegum, devnet) · zod · Vitest

## Local setup

```bash
npm install
cp .env.example .env.local   # optional: everything runs in MOCK MODE without it
npm run ml:setup             # once: Python venv + CUDA torch for the segmenter (Windows)
npm run ml                   # terminal 1: garment segmenter on :8001 (optional)
npm run dev                  # terminal 2
```

Open <http://localhost:3000>. The launcher links to every route. Setting up a fresh machine
(e.g. the laptop)? See [New machine setup](#new-machine-setup-laptop).

| Script               | What it does               |
| -------------------- | -------------------------- |
| `npm run dev`        | Next dev server            |
| `npm run build`      | Production build           |
| `npm run start`      | Serve the production build |
| `npm run lint`       | ESLint                     |
| `npm run typecheck`  | `tsc --noEmit`             |
| `npm test`           | Vitest (single run)        |
| `npm run test:watch` | Vitest in watch mode       |
| `npm run ml:setup`   | Check/install the Python sidecar (venv, CUDA torch, deps) |
| `npm run ml`         | Start the garment segmenter on `127.0.0.1:8001`           |
| `npm run db:setup`   | Apply + verify the Tiger Data schema (hypertables, continuous aggregate) |
| `npm run solana:setup` | Devnet wallet, airdrop, Bubblegum tree + collection for badges |
| `npm run pose:collect` | Pose dataset step 1: freely licensed photos per archetype from Wikimedia Commons |
| `npm run pose:extract` | Step 2: MediaPipe landmarks + automatic filtering → `ml-service/pose/landmarks.jsonl` |
| `npm run pose:train` | Step 3: features, cross-validated model selection → `lib/pose/model.json` + report |
| `node scripts/dev-mock.mjs` | A second dev server on :3100 forced into MOCK MODE (no API spend, in-memory store) |

### MOCK MODE (default)

- **No `OPENAI_API_KEY`** → `/api/analyze`, `/api/roast` and `/api/battle/scan` serve fixtures from
  `lib/fixtures.ts` and `lib/copy/roasts.ts`; battle commentary streams a rule-based line built
  from the same score sheet (`lib/battle/commentary.ts`).
- **No camera (or nobody detected) in MOCK MODE** → each capture gets a deterministic synthetic pose
  (`lib/pose/synthetic.ts`), so pose scores, archetypes and "decided by the pose" still demo.
- **No `TIGER_DATABASE_URL`** → scans, cards, leaderboard, players, battles and fit history live in
  the server's memory (reset on restart); the event timeline is computed in memory. Everything
  else works the same.
- **No `GEMINI_API_KEY`** → GPT judges alone (in full mock mode a mock Gemini judges too, and
  sometimes disagrees, so the "judges disagree" reveal can be demoed offline).
- **No `ELEVENLABS_API_KEY`** → verdicts and roasts use the browser's voice.
- **`SOLANA_BADGES_ENABLED` not `true`** → no badges; cards work exactly the same.
- **No camera** → scans analyze a placeholder frame so every screen can still be tested.
- Every mock result carries a **MOCK MODE** banner: the fit shown is a sample, not the person's.
  Set `OPENAI_API_KEY` to get real analysis.
- **Segmenter not running** → real analysis still works; `gpt-4o-mini` scores the image alone
  (item boxes are less precise and the face box comes from the model, not segmentation).

### Routes

| Route               | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `/kiosk?mode=digital` | Main experience over the flipped camera feed (default)            |
| `/kiosk?mode=mirror`  | Two-way mirror layout (pure black, cyan only)                     |
| `/r/[id]`           | Companion app: the result a card's QR lands on (card, BEAT THIS SCORE → challenger queue, caption, reactions, "this was me") |
| `/feed`             | Companion app: every saved card, newest first, with reactions        |
| `/card/[id]`        | Old card links: redirects to `/r/[id]`                               |
| `/leaderboard`      | Full-screen Tide Chart: squad champion, rivalry of the day, streaks, most improved |
| `/remote`           | Operator remote (ADMIN_KEY): battle, squad, scan/capture, start, wave, reset, mute, mode |
| `/admin`            | Paste ADMIN_KEY to delete leaderboard entries                       |
| `/certificate/[id]` | Hidden print page (US Letter) opened by the kiosk when printing     |
| `/pose-editor`      | Developer tool (hidden): joints, presets, animations, clothing, clipping |
| `/pose-lab`         | Developer tool (hidden): live pose classifier read-out + labeled sample recorder |
| `/card-lab`         | Developer tool (hidden): solo, battle and squad cards from sample data |

### Environment variables

See [`.env.example`](./.env.example).

| Variable                        | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `OPENAI_API_KEY`                | OpenAI API key (platform.openai.com, project with billing)     |
| `OPENAI_MODEL`                  | Override the scoring/roast model (default `gpt-4o-mini`)       |
| `OPENAI_IMAGE_DETAIL`           | `high` (default, better boxes), `low` (cheaper), or `auto`     |
| `ML_SERVICE_URL`                | Segmenter URL (default `http://127.0.0.1:8001`; `off` to skip) |
| `DAILY_SCAN_CAP`                | Max real analysis calls per day (default 600)                  |
| `KIOSK_TIMEZONE`                | Defines "today" for caps and ranks (default America/New_York)  |
| `OPENAI_INPUT_USD_PER_M`, `OPENAI_OUTPUT_USD_PER_M` | List prices for the debug overlay spend estimate (0.15 / 0.6) |
| `GEMINI_API_KEY`                | Google AI Studio key: Gemini, the second judge (optional)      |
| `GEMINI_MODEL`                  | Override the judge model (default `gemini-3.8-flash`)          |
| `ELEVENLABS_API_KEY`            | Spoken verdicts/roasts (optional; browser voice otherwise)     |
| `ELEVENLABS_VOICE_ID`           | Voice to use (default: stock "Liam")                           |
| `TIGER_DATABASE_URL`            | Tiger Data Postgres URL (`...?sslmode=require`); never commit it |
| `PUBLIC_BASE_URL`               | Public origin for links and NFT metadata (the deploy URL); empty = request origin |
| `SOLANA_RPC_URL`                | Solana RPC (default devnet)                                    |
| `SOLANA_BADGES_ENABLED`         | `true` to mint a badge per claimed card (never blocks the card) |
| `SOLANA_SECRET_KEY`, `SOLANA_TREE`, `SOLANA_COLLECTION` | Hosted deploys: badge wallet + tree ids as env (else `.solana/` files) |
| `ADMIN_KEY`                     | Shared secret for `/remote`, `/admin`, and admin API routes    |
| `PRINTING_ENABLED`              | `true` to print Aura Certificates (also toggleable in settings)|

## Aura Battles

```
mode select ──✊✊──▶ LOBBY ──✌️✌️──▶ 3-2-1 capture ──▶ LOBBY (next player) ──▶ ... ──▶ VS INTRO ──▶ RESULT ──👍──▶ CARD + QR
  (idle)     ──👍 squad──▶ (same lobby, 2-5 slots, 👍 / Enter starts with 2+)      (≥1.4s)    (commentary streams in)
```

- **Mode select** (idle and READY): AURA BATTLE (big, primary), SOLO SCAN, SQUAD. Gestures: two
  fists = battle lobby (two people at once = instant duel, one frame split by pose boxes),
  double peace = solo scan, thumbs up = squad. The buttons work with a mouse / touch too.
- **Lobby** (`lib/kiosk/lobby.ts`, states `LOBBY` → `LOBBY_COUNTDOWN` → `BATTLE_INTRO`): each
  player's double peace starts their 3-2-1; the capture is cropped to the person who stepped up
  and **scored immediately** (`/api/battle/scan`) while the next player steps up, so the final
  wait is one VS animation, not N analyses. Each player's mannequin appears in the outfit the
  judge detected on them (`lib/clothing/fromAnalysis.ts`).
- **Scoring** (`lib/battle/score.ts`): total = fit aura (single fast judge in battle mode) + pose
  aura (`(pose - 40) × 2,500`), so a battle can be won on the pose alone. The result shows the
  score gap (duel) or the group Aura (squad: average × synergy, which rewards cohesive-but-distinct
  fits) as the hero number, stat rows under each mannequin, WINNER glow, and whether the fit or the
  pose decided it.
- **Commentary** (`lib/server/battles.ts`, `/api/battle/[id]/commentary`): one text-only call with
  every player's score sheet (never the images again), hard `max_completion_tokens` cap, streamed
  token by token into COMMENTARY.EXE; squads get one opener plus one line per player. MOCK MODE and
  any LLM failure stream a rule-based line from the same numbers.
- **Latency masks**: per-capture scoring runs during the lobby, the VS intro lasts at least 1.4s
  over the final computation, the commentary streams after the numbers land, and `/api/warmup`
  pings the model provider on boot and every 4 minutes while idle (no tokens spent).

## Pose score (trained classifier)

The pose sub-score (0-100) is deterministic and free at battle time: no vision call.

1. **Collect** (`ml-service/pose/collect.py`): only the category search terms are hand-picked
   (runway, superhero cosplay, anime/cosplay action, martial arts, dance, plain standing). Up to
   160 freely licensed photos per category from the Wikimedia Commons API (500px thumbnails, polite
   pacing, 429 backoff), attribution recorded in `data/manifest.jsonl`. Photos stay local
   (git-ignored).
2. **Extract** (`extract.py`): MediaPipe Pose Landmarker on every photo; photos with no person,
   several similar-size people, or unconfident key joints are dropped automatically. Survivors
   (landmarks only) go to `ml-service/pose/landmarks.jsonl`.
3. **Train** (`npm run pose:train`, `scripts/pose-train.ts`): hip-centered, torso-scaled features
   (joint angles, limb directions relative to the torso, normalized positions, spans, symmetry;
   `lib/pose/features.ts`, the same code the kiosk runs), mirror + landmark-noise augmentation
   inside training folds only, 5-fold stratified cross-validation over softmax regression and small
   MLPs (k-NN as a baseline). Results: [`ml-service/pose/REPORT.md`](./ml-service/pose/REPORT.md).
4. **Battle time** (`lib/pose/score.ts`): the live landmarks captured with each photo → the
   classifier (mirror-aware: the pose and its mirror image are averaged) → archetype + match %,
   blended with dynamism signals (arms up, reach, stance width, asymmetry, lean, knee bend).

Setup for retraining (separate venv so MediaPipe never touches the segmenter's torch env):

```bash
py -3.11 -m venv ml-service/pose/.venv
```

```bash
ml-service/pose/.venv/Scripts/python -m pip install -r ml-service/pose/requirements.txt
```

At the event, `/pose-lab` shows the classifier's live read of the kiosk camera and records labeled
samples to `ml-service/pose/recorded.jsonl` (dev server only); `npm run pose:train` folds them in.

## Companion app, cards and the feed

- **Share card** (`components/card/ShareCardView.tsx`, 1080x1350, 4:5): one template, three
  content blocks (solo portrait, battle split with VS badge and winner glow, squad filmstrip), the
  same footer on all three: AURA OS wordmark, "THINK YOU CAN BEAT 847,203?" and a QR deep link to
  that result (`/r/[id]`). Card ids are minted on the kiosk so the QR is baked into the image.
- **Card = feed post**: saving a card writes the feed (the `cards` table is the feed), with a
  ready-to-paste caption (`lib/share/caption.ts`). Squads also get one card per member ("FROM
  SQUAD BATTLE"), nested under the squad card.
- **Identity** without accounts: a name entered once on the phone becomes an AURA ID
  (NAME#CODE, cached in localStorage). "THIS WAS ME" attaches it to a battle slot or scan, which is
  what rivalries, streaks and "most improved" count.
- **Reactions**: 🔥 💀 👑 🤡, one per phone per emoji.
- **BEAT THIS SCORE**: joins the challenger queue; the kiosk's mode select shows **UP NEXT** and
  the announcer calls the challenger up.

## Analysis pipeline (segmenter + two AI judges)

`/api/analyze` (and `/api/battle/scan`, which reuses it with a single judge) runs in `lib/server/processScan.ts`:

1. **Garment segmentation (local GPU).** `lib/server/segmenter.ts` POSTs the frame to the Python
   sidecar in [`ml-service/`](./ml-service/server.py), which runs
   [`sayeed99/segformer_b3_clothes`](https://huggingface.co/sayeed99/segformer_b3_clothes) on
   CUDA (~60 ms per frame warm) and returns garment regions (`Upper-clothes`, `Pants`, `Shoes`, ...)
   with 0-1000 boxes, each region's dominant colors (k-means on its pixels), plus a face box. 4 s
   timeout; any failure falls back to stage 2 alone. `lib/palette.ts` names the colors
   ("camel", "navy", "burgundy") and reads the palette as a whole (neutral, one accent, tonal,
   complementary, clashing).
2. **Two judges, in parallel (`Promise.allSettled`).** GPT (`gpt-4o-mini`, full analysis: items,
   boxes, modifiers, via strict `json_schema`) and Gemini (`gemini-3.8-flash`, `lib/judges/gemini.ts`,
   a lightweight independent rating via `responseJsonSchema`) score the same photo with the same
   segmenter + palette hints. Either can fail without blocking the other; only both failing is an
   error. Items GPT ties to a region take that region's pixel-accurate box.
3. **Aura (`lib/scoring.ts`).** Neither model emits a score. Each rates **specialness** (0-100, a
   percentile vs people at a hackathon) and **sentiment** (W / L); a curve turns that into aura:
   up to the cutoff (80) it stays within +-20,000 (most people: near zero), above it a power curve
   (exponent 2.2) swings to +-1,000,000 (85 -> ~66k, 90 -> ~233k, 95 -> ~540k). After 30 scans a
   day, each judge's cutoff tracks the 80th percentile of its own ratings, so ~1 in 5 fits swing
   wide even if a model rates everyone high. The official aura is the judges' average; when they
   land 300k+ apart (or point opposite ways by 40k+) the reveal flashes **THE JUDGES DISAGREE**.

The sidecar loads the model once at startup, logs the GPU it is using, and refuses to start
without CUDA. First start downloads the model (~190 MB) from Hugging Face.

```bash
npm run ml:setup   # idempotent: only installs what is missing
npm run ml         # or: ml-service/.venv/Scripts/python ml-service/server.py
curl http://127.0.0.1:8001/health
```

**torch/CUDA:** the RTX 50-series (Blackwell, `sm_120`) needs the **cu128 or newer** wheel; older
`cu121`/`cu124` wheels install fine but cannot run on it. cu128 also covers the RTX 3060. Manual
install into the venv (transformers v5 also needs torchvision from the same index):

```bash
ml-service/.venv/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
```

```bash
ml-service/.venv/Scripts/python -m pip install -r ml-service/requirements.txt
```

The sidecar needs an NVIDIA GPU; on a host without one (or with `ML_SERVICE_URL=off`) the judges
score the image alone.

## Tiger Data (TimescaleDB): leaderboard, history, time series

1. Put the service's connection string in `.env.local` as `TIGER_DATABASE_URL` (never in code).
2. `npm run db:setup` applies [`lib/server/tigerSchema.ts`](./lib/server/tigerSchema.ts) (also
   applied automatically on first connect) and prints the hypertables and continuous aggregate.
3. TLS is always fully verified (chain + hostname), whatever `sslmode` the URL says: new Tiger
   services start on a certificate from Timescale's own CA (`ca.timescale.com`, embedded in
   `lib/server/timescaleCa.ts`) before their public one is issued, so both are trusted.

What lives there: `scans` and `judge_scores` are **hypertables** partitioned by time;
`aura_15m` is a **real-time continuous aggregate** (15-minute buckets: scans, average / best /
worst aura, wide swings, judge disagreements) behind the leaderboard's "aura over the event"
chart, and an hourly rollup of it finds the hottest hour. `judge_scores` feeds the adaptive
scoring cutoff. `players` holds AURA IDs (NAME#CODE): typing one at a later thumbs up links the
scan to `/u/NAME%23CODE`, the player's aura-over-time page (linked from their card).
Raw photos are never stored; only rendered share cards (face blurred) after a thumbs up.

## ElevenLabs voice

With `ELEVENLABS_API_KEY` set, verdicts, both judges' lines, roasts and solo-battle roasts are
spoken by an ElevenLabs voice (`eleven_flash_v2_5`, `/api/voice`, cached per line). The kiosk
prefetches the clip when the line is queued and falls back to the browser voice if it is not back
in 3 s or anything fails; audio never holds up the reveal.

Chrome plays no sound (neither voice) until the page gets a click or key press; camera gestures
do not count. While it is blocked the kiosk shows **SOUND IS OFF: CLICK ANYWHERE OR PRESS ANY KEY**.
Launching Chrome with `--autoplay-policy=no-user-gesture-required` (see Kiosk setup) removes the
block entirely.

## Solana badges (devnet, custodial)

Each claimed scan card can mint a **compressed NFT** (Metaplex Bubblegum) held by the server
wallet: nobody connects a wallet. It is a bonus layered on the share card: the card is saved and
its QR shown first; the mint runs afterwards and a failure or timeout changes nothing. The card
page links the badge on Solana Explorer.

1. `npm run solana:setup` creates a devnet wallet in `.solana/` (git-ignored), requests an
   airdrop, creates a Bubblegum tree (16,384 badges) and a collection. The public devnet faucet
   is rate-limited: if the airdrop fails, fund the printed address at <https://faucet.solana.com>
   and rerun.
2. Set `SOLANA_BADGES_ENABLED=true`. Badge metadata is served at `/api/nft/[cardId]` from
   `PUBLIC_BASE_URL`, so explorers can show the card image once the app is deployed.

## Deploying (at the event)

Live at **https://aurafulos.tech** (Vultr `vhp-2c-4gb`, Atlanta, Ubuntu 24.04; the fallback name
`https://155-138-165-43.sslip.io` works without DNS). The server only serves the phone side
(`/r/[id]`, `/feed`, `/leaderboard`, `/u/[handle]`) and the APIs behind it; the kiosk laptop runs its
own server and GPU segmenter. Both share Tiger Data, so a card saved at the mirror is on the site at
once, and the kiosk's `PUBLIC_BASE_URL` (the domain) is what its QR codes open.

- One-time box setup (Node 22 checksum-verified, Caddy for HTTPS, an `aura` user, ufw 80/443):
  `ssh -i ~/.ssh/aura_vultr root@155.138.165.43 'bash -s' < scripts/server/setup.sh`
- Every deploy ships the committed `HEAD` plus the laptop's `.env.local` (with `PUBLIC_BASE_URL`
  forced to the domain), builds on the box, swaps and restarts the `aura` systemd service:
  `bash scripts/server/deploy.sh` (`AURA_DOMAIN`, `AURA_HOST`, `AURA_KEY` override the defaults).
- Logs: `ssh -i ~/.ssh/aura_vultr root@155.138.165.43 journalctl -u aura -f`.
- DNS: A records for `@` and `www` to `155.138.165.43`; Caddy fetches the certificates itself.

The app needs nothing host-specific: all config
is env vars (copy `.env.example`), public links use `PUBLIC_BASE_URL` (else the request's own
origin), QR codes use the page origin, the only localhost default is the GPU sidecar
(`ML_SERVICE_URL`), and all state lives in Tiger Data. For badges on a host, pass the wallet and
tree as `SOLANA_SECRET_KEY` (JSON byte array from `.solana/devnet-keypair.json`), `SOLANA_TREE`
and `SOLANA_COLLECTION` (from `.solana/devnet.json`).

## Laptop kiosk launch

The kiosk runs full screen in Chrome on a laptop behind a two-way mirror (portrait 32" monitor),
or as a "digital mirror" with a flipped camera feed.

1. Pull the repo, `npm install`, `npm run build`, `npm run start` (or point at the deployed URL), and
   `npm run ml` in a second terminal for the garment segmenter.
2. **Display**: set the external monitor to portrait (1080x1920) in Windows/macOS display settings.
3. **Power**: disable sleep, screen saver, and notifications / Focus Assist.
4. **Camera**: open the kiosk URL once in normal Chrome and allow the camera so the permission is
   remembered for the kiosk launch. The feed is rotated 90° by default for a sideways webcam on a
   portrait display; change **Camera mount** in settings (`S`) or press `O` to cycle 0/90/180/270.
5. **Network**: the first load pulls MediaPipe models and WASM from the CDN (gestures, glow).
6. Launch Chrome in kiosk mode:

   ```bash
   chrome --kiosk --autoplay-policy=no-user-gesture-required "http://localhost:3000/kiosk?mode=mirror"
   ```

   Use `mode=digital` when the physical mirror is unavailable.
   **Mirror placement:** mirror mode assumes the display sits in the **top-left of a 24x36 mirror**, so
   the person's reflection covers the right of the screen. All UI lives in a left panel and the rest
   stays pure black (clean mirror). With a 32" portrait monitor the reflection starts ~45% across;
   stand in front of the mirror and tune **Settings (`S`) → MIRROR PANEL** until the UI's right edge
   sits just left of your reflection. Mirror mode already draws text and windows 1.3x larger and the
   mannequin framed tall on the left; raise **TEXT SCALE** if it is still hard to read from where people stand.
7. **Optional printing** (Stage 13): set the printer as the OS default, set `PRINTING_ENABLED=true`
   (or toggle it in settings), and add `--kiosk-printing` to the Chrome flags so no dialog appears.
8. Press any key once after launch so the browser unlocks audio for the announcer and sounds.

### Operator hotkeys

`B` Aura Battle lobby · `Q` squad lobby · `V` instant duel (two people at once) · `Space` solo scan /
capture the next player in a lobby · `Enter` start the battle · `W` simulate wave (alternates screen side) · `R` reset · `M` mute ·
`D` debug overlay · `S` settings (`Esc` closes) · `T` switch digital/mirror · `O` rotate camera ·
`F` full screen (also the `[FULL SCREEN]` button in the top bar)

Extra keys for testing without a camera: `U` thumbs up · `N` thumbs down · `P` open palm · `X` two fists alone (solo battle roast) ·
`K` sulk · `L` end sulk · `C` force a costume roll (none → mascot → astronaut → diver)

## How the pieces fit

- `lib/kiosk/machine.ts` is the pure state machine; `useKioskMachine.ts` runs it with timers and
  the analysis calls. Both layouts (`components/kiosk/DigitalLayout.tsx`, `MirrorLayout.tsx`) get
  the same props.
- `lib/kiosk/gestureEngine.ts` is the pure gesture engine (hold rings, waves, battles);
  `useGestures.ts` runs MediaPipe at ~15fps gestures / ~5fps pose and feeds it.
- `lib/analyze.ts` wraps OpenAI (+ the segmenter in `lib/server/segmenter.ts`) behind a provider
  interface; `lib/scoring.ts` is pure scoring;
  `lib/prompts.ts` holds every prompt; `lib/copy/` holds every editable line (marked REPLACE ME).
- `lib/mannequin/` is the Three.js figure, rig, animation player and effects;
  `lib/poses.ts` and `lib/costumePoses.ts` are the presets; `lib/clothing/` is the procedural
  wardrobe (themes, generator, garment builders, costumes).
- `lib/server/store.ts` is the persistence layer (Tiger Data via `tigerStore.ts`, or memory),
  `processScan.ts` the shared segment-judge-score-store pipeline.

### Mannequin costumes

1% of locked fits are a full costume: an animal mascot suit (cheetah, T-rex, frog, chicken,
shark), an astronaut who floats and holds a black hole, or a brass-helmet diver with bubbles and a
passing school of fish. Costumes greet in character instead of waving. 2% of fits are coordinated
formalwear (suit or gown). On CLAIM the mannequin pulls out a laptop and types the card in.

### Wave meltdown

Waving is a gimmick, not a step: every wave gets a spoken "hi" back, and every wave before your
next scan gets a less enthusiastic one (`WAVE_HELLOS` in `lib/copy/greetings.ts`, counted in
`lib/kiosk/meltdown.ts`). Wave 1 is the full greeting, wave 2 "Oh hey, you again!", wave 3
"Yeah, hi.", wave 4 a flat "...hi." with a tiny wave, wave 5 it crosses its arms and taps its foot
under a cyan anger mark ("OK. WE GET IT."), wave 6 "Nope. I'm done saying hi." and it turns its back
and sits (SULKING, silent treatment). Stop waving for 3s and it stands up, dusts itself off
("APOLOGY ACCEPTED."), but one more wave sulks again. Scanning or starting a battle forgives
everything (the count resets), as does walking away. A double peace during the sulk snaps it out
and starts the scan.

## Setup checklist (event day)

- [ ] `OPENAI_API_KEY` from a billing-enabled OpenAI project in `.env.local` (and the host).
- [ ] `GEMINI_API_KEY` set; a scan shows both judges (debug overlay `D` / reveal).
- [ ] `ELEVENLABS_API_KEY` set; the verdict is spoken in the ElevenLabs voice.
- [ ] Optional `OPENAI_MODEL` override; default is `gpt-4o-mini` in `lib/config.ts`.
- [ ] `npm run ml:setup` passed on the kiosk laptop (prints the GPU and `sm_XX` at the end).
- [ ] `npm run ml` running in its own terminal before the kiosk starts; `/health` says `"ok": true`
      and the log line names the NVIDIA GPU.
- [ ] `DAILY_SCAN_CAP` set (default 600) and `KIOSK_TIMEZONE` set to the venue timezone.
- [ ] `TIGER_DATABASE_URL` set and `npm run db:setup` prints the hypertables + `aura_15m`.
- [ ] `npm run solana:setup` done (wallet funded), `SOLANA_BADGES_ENABLED=true`, a claimed card
      shows "AURA BADGE MINTED" and its explorer link opens.
- [ ] `ADMIN_KEY` set (a long random string); `/remote` and `/admin` unlock with it.
- [ ] Deployed (Vultr) with the same env vars and `PUBLIC_BASE_URL` (card QR codes use it); a card QR opens `/r/[id]` from a phone, and `/feed` loads.
- [ ] Optional: retrain the pose classifier with event-camera samples from `/pose-lab` (`npm run pose:train`).
- [ ] Laptop: repo pulled, `npm run build && npm run start`, monitor rotated to portrait.
- [ ] Laptop: sleep, screen saver, notifications and OS updates disabled; volume up.
- [ ] Camera permission granted once in normal Chrome; camera mount rotation set if sideways.
- [ ] Chrome launched with `--kiosk` (and `--kiosk-printing` + default printer if printing).
- [ ] Optional second display opened on `/leaderboard`.
- [ ] Replace the placeholder copy in `lib/copy/` (verdicts, greetings, attract lines, footer, roasts).

## Manual test checklist (physical setup)

1. **Boot**: the boot sequence types out and lands on the spinning mannequin with the text band.
2. **Wave**: wave at the mirror with a raised open hand (at or above shoulder height; relaxed hands,
   walking arms and a palm held out at chest height are ignored); the fit locks slot by slot, it waves back with the arm on your
   side, says a greeting, strikes an idol pose, then "DOUBLE PEACE TO SCAN YOUR AURA".
3. **Scan**: hold a double peace for about 0.6s (600ms; a flickering hand slows the
   ring rather than resetting it); the ring fills, "HANDS DOWN, STRIKE A POSE!", 3-2-1,
   then the reveal finishes in under 8 seconds with boxes, glow, aura digits, stats, rank, verdict.
4. **Announcer**: the aura and verdict are spoken; `M` mutes and unmutes.
5. **Thumbs down**: one extra roast appears and is spoken; a second thumbs down does nothing.
6. **Thumbs up**: the card saves, a QR appears; scan it with a phone, download and share work.
7. **Leaderboard**: the Tide Chart shows the new entry; `/leaderboard` on the second display
   updates; a new #1 flashes and announces "NEW AURA KING".
8. **Open palm**: the session ends with a quick reboot sequence, then the mannequin spins again;
   gestures are ignored for 5s.
8b. **Framing**: stand close so your feet are out of frame; "STEP BACK" appears and neither double
   peace nor two fists fill the ring until your whole fit is visible. Stand far back (body under
   ~30% of the frame height): "COME CLOSER", same block. In a two-person battle both people must
   be fully in frame, and it never falls back to scanning just one of them. `Space`, `B` and
   `/remote` skip the check (operator override).
9. **Aura Battle**: alone, hold up two fists: the 1v1 lobby opens ("PLAYER 1, STEP UP"). Double
   peace: 3-2-1 (strike a real pose, it is scored), the thumbnail locks into the left slot and
   your mannequin appears in your detected outfit. Player 2 does the same; VS slams in with both
   thumbnails, then the result: score gap, stat rows (fit, pose + archetype, total...) under each
   mannequin, WINNER glow, commentary streaming in and read out. Thumbs up saves the battle card;
   scan its QR: `/r/[id]` shows that battle, BEAT THIS SCORE puts you in the queue ("UP NEXT" on
   the mirror).
9b. **Instant duel**: two people in frame both hold a battle sign: one countdown captures both,
   split by their pose boxes, straight to VS.
9c. **Squad**: thumbs up at the mode select; 2-5 players capture one by one; thumbs up (or `Enter`)
   starts with 2+; group Aura, vibe archetype, one line per player; the squad card plus a card per
   member appear in `/feed`.
9d. **Lonely lobby**: open a 1v1 lobby, capture only yourself and walk away: after 75s the kiosk
   clowns you ("OPPONENT NOT FOUND") and resets.
10. **Meltdown**: wave 6 times without scanning; each hi is flatter, then anger mark, sulk, recovery after you stop.
11. **Idle**: walk away; results reset after 20s with nobody in frame, attract mode after 60s, comes back when you return.
12. **Mirror mode**: switch with `T`; nothing is drawn over the reflection except the analysis panel.
13. **Remote**: from a phone, `/remote` battle / squad / scan / start / wave / reset / mute / mode reach the kiosk.
14. **Admin**: `/admin` deletes a leaderboard entry and the chart updates.
15. **Printing** (if enabled): thumbs up prints the certificate with no dialog; the mannequin
    presents proudly.
16. **Errors**: pull the network; the system error window appears and the kiosk returns to READY.
17. **Debug**: `D` shows fps, hands, people, gesture ring, calls today and estimated spend.

## New machine setup (laptop)

Everything below is Windows (PowerShell or Git Bash). Each step says how to check first; only
install what is missing.

**0. On the desktop first:** the repo must be on GitHub for the laptop to get it. If it has no
remote yet, create an empty GitHub repo, then `git remote add origin <url>`, commit and
`git push -u origin main`. `.env.local` and `ml-service/.venv` are git-ignored and never travel;
copy `.env.local` over by hand (USB, password manager note, etc.), never through git.

**1. System tools** (check, then install only if missing):

| Tool | Check | Install |
| --- | --- | --- |
| Git | `git --version` | `winget install Git.Git` |
| Node.js 24 LTS (or 22+) | `node --version` | `winget install OpenJS.NodeJS.LTS` |
| Python 3.11 | `py -3.11 --version` | `winget install Python.Python.3.11` |
| NVIDIA driver | `nvidia-smi` shows the GPU | NVIDIA app / nvidia.com driver download, then reboot |
| Chrome | open it | `winget install Google.Chrome` |

Open a **new** terminal after installing so PATH updates. You do not need the CUDA Toolkit: the
torch wheel bundles its own CUDA runtime, only the driver is required.

**2. Get the app:**

```bash
git clone <your GitHub repo url> aura-os
```

```bash
cd aura-os && npm install
```

**3. Env:** put your `.env.local` in the repo root (or `cp .env.example .env.local` and fill in
`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `TIGER_DATABASE_URL` and `ADMIN_KEY`).

**4. Python sidecar:** `npm run ml:setup`. It checks the driver, finds Python 3.11, creates
`ml-service/.venv` if missing, installs CUDA torch + torchvision only if the venv lacks a working
CUDA build (~3 GB download), installs the rest of `requirements.txt`, and verifies the GPU. Safe
to rerun.

**5. Run and verify:**

```bash
npm run ml      # terminal 1: wait for "segmenter: ... ready" naming the RTX GPU
```

```bash
npm run build && npm run start   # terminal 2
```

Open <http://localhost:3000/kiosk>, press `D` for the debug overlay, `Space` to scan. Terminal 1
should log `segment ...: Upper-clothes, Pants, Shoes` for the scan; terminal 2 logs
`[aura] segmenter: ...` and `[aura] openai call #1 today`. Then continue with
[Laptop kiosk launch](#laptop-kiosk-launch).

## Privacy

Photos are analyzed and not stored. The segmenter runs locally and keeps nothing; the photo is
sent to OpenAI for scoring. A card is saved only after a thumbs up, with the face blurred, and that
card is what the public feed shows. The models judge clothes (and, for the pose score, landmark
geometry) only. Names are optional: an AURA ID is a self-chosen name plus a code, entered on the
player's own phone; no accounts, emails or contact details. Pose training uses freely licensed
Commons photos kept locally; the repo holds only their landmark vectors.
