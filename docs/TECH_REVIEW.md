# AuraOS: Technical Review

Sep 27, 2026 · Calvin · Live version with diagrams: [AuraOS: Technical Review](https://claude.ai/code/artifact/7ac95ccf-2282-469e-b060-ec5c61a03b1e)

## Why AuraOS

AuraOS turns the most private moment of getting dressed, checking yourself in a mirror, into a shared and playful one, and it only works because AI can actually see and describe what you're wearing.

**Who it's for.** People who put thought into how they dress but rarely get a reaction to it: hackathon attendees between sessions, friends who arrive together, and anyone walking past the mirror. There is nothing to install, no account and no touching a screen: you wave, and it answers. Visitors who can't get to the mirror join from their phones in seconds.

**How it strengthens connection.**

- **It starts conversations.** The mirror greets you, calls out your score to the room, and cheers or roasts the fit, which gives strangers something to laugh about together.
- **It turns friends into teams and rivals.** 1v1 and squad battles put people side by side in the same frame, with live commentary and a countdown reveal they experience together.
- **It travels.** Share cards, the live feed, four leaderboards and challenge-by-link duels carry a moment at the mirror to friends' phones, and bring them back to the mirror to answer it.
- **It stays kind where it matters.** The judges comment only on clothes, never on faces or bodies, and photos are analysed but not stored, so the roasting is fun rather than personal.

**Why AI is essential.** Judging style is open-ended perception, and no fixed set of rules can do it. It takes AI to recognise "a white oxford under a beige quarter-zip with a burgundy tie", weigh how unusual that is against a whole crowd, and say something specific and funny about it.

- **Seeing:** a GPU clothing model finds each garment and measures its colours, and vision-language models name every piece and score cohesion and originality.
- **Fairness through independent judges:** two or three AI judges score in parallel; their average is the official aura, and when they disagree, the reveal says so.
- **Responding:** AI writes the verdicts, roasts and battle commentary, AI voice speaks them, and the 3D mannequin is rebuilt from the AI's item list, so every reaction is about your actual outfit.
- **Touch-free interaction:** on-device models read gestures and body position in real time, so the mirror needs no buttons at all.

Without AI, AuraOS would be a camera and a screen; with it, it's a mirror that notices you.

## Overview

AuraOS is a smart-mirror kiosk that judges outfits with AI and turns each one into an "aura" score from −1,000,000 to +1,000,000, plus a phone companion at [www.aurafulos.tech](https://www.aurafulos.tech). It was built for HackGT 13 and is deployed and live as of this review.

- **Mirror (kiosk):** a portrait monitor behind one-way acrylic, driven entirely by gestures: wave to say hi, double peace for a solo scan, two fists for a 1v1 battle, thumbs up for a squad battle.
- **Phone companion:** scan from a phone, share cards, a live feed, four leaderboards and challenge-by-link duels.
- **Operator screens:** /admin (controls, sound and camera settings, the line, moderation) and /tv (the big-screen Tide Chart).

*Diagram (in the live doc): system architecture. The kiosk laptop runs the mirror window (Next.js page, MediaPipe, Three.js, Web Audio, webcam), a Next.js server on :3000 and the garment segmenter on :8001. The public server (Vultr, Atlanta) runs Caddy and a Next.js server under systemd for phones and judges' browsers. Both servers read and write one Tiger Data database and call the cloud APIs (OpenAI, Google Gemini, Anthropic Claude, ElevenLabs, Solana devnet).*

The laptop runs the full app because only it has the webcam and the GPU. The public server handles phones and remote admin, and Tiger Data keeps both in sync, so a phone tap or an admin control reaches the mirror.

| Layer | Technology |
| --- | --- |
| Web framework | Next.js 16.3 (App Router, Turbopack), React 19.2, TypeScript 5 |
| Styling | Tailwind CSS 4 with design tokens, hand-written CSS, pixel fonts (Silkscreen, VT323) |
| Computer vision | MediaPipe Tasks Vision 1.0 (hand gestures and pose landmarks), in the browser |
| 3D | Three.js 0.186, a procedural mannequin |
| AI judges | OpenAI GPT-4o-mini, Google Gemini 3.8 Flash, Anthropic Claude Opus 5 (optional) |
| Garment segmentation | Python FastAPI + Hugging Face Transformers SegFormer-B3 (clothes) on CUDA |
| Voice and audio | ElevenLabs (voice and sound effects), Web Speech API fallback, Web Audio API |
| Database | Tiger Data (managed TimescaleDB on PostgreSQL) through node-postgres |
| Blockchain | Solana devnet compressed NFTs (Metaplex Bubblegum, Umi) |
| Hosting | Vultr VM (Ubuntu 24.04), Caddy, systemd, domain aurafulos.tech |
| Validation and tests | zod 4, Vitest 5, ESLint 9 |

## Front end

One Next.js 16 codebase (App Router, React 19, TypeScript, Turbopack in development) serves every screen: the kiosk, the phone pages, admin and the TV board are routes of the same app, sharing types and scoring code.

**Routing and rendering.** Pages live under `app/`: `/kiosk?mode=mirror|digital`, `/scan`, `/feed`, `/leaderboard?board=`, `/r/[id]` (a card), `/c/[id]` (a challenge), `/me` and `/u/[handle]` (AURA IDs), `/tv`, `/admin`, plus developer tools (`/music-lab`, `/pose-lab`, `/pose-editor`, `/card-lab`). 37 API routes sit beside them under `app/api`. Server components read request data (in Next 16 `searchParams` is a Promise), and anything needing the camera, WebGL or audio is a client component. The kiosk is loaded with a dynamic import, and the phone routes load no Three.js or MediaPipe at all (about 36 KB gzipped of page JavaScript on `/scan`).

**The kiosk is a state machine.** `lib/kiosk/machine.ts` is a pure `transition(state, event)` function over 18 states, driven by gesture, timer and network events; `useKioskMachine` wraps it in a reducer that also holds the session (outfit, scan, lobby, battle, card, terminal lines). Keeping it pure is what makes it unit-testable and easy to reason about.

*Diagram (in the live doc): the kiosk session state machine. Idle spin → (wave) greeting → mode select. Solo: countdown (double peace) → analyzing → result reveal → claim card. Battle: lobby (fists or thumbs) → VS intro → battle result → claim card. Claim done, a timeout or [RESET] does a quick reboot back to idle.*

A solo scan and a battle share the same entry and exit; only the middle differs, and every path ends at the claim card or back at idle.

**Two layouts, one design language.** `MirrorLayout` is built for the one-way acrylic: pure black (#000000) with cyan line art, because anything lit glows through the glass. The UI sits in a left panel (45% of the width by default) and the rest stays black for the reflection, with text scaled up 1.3× for reading at 1.5 m. `DigitalLayout` shows the flipped live camera feed full screen instead. Both use the same retro "operating system" windows (`AURA_OS.EXE`, `TERMINAL.EXE`), no rounded corners anywhere, and design tokens defined once in `app/globals.css` (Tailwind 4 `@theme`) alongside hand-written CSS.

**Motion.** All animation is stepped (`steps()` timing) so it reads like a terminal: windows wipe in, rows rise in one by one, numbers "decode", and the kiosk boot and terminal text type out. Typing is clock-based (characters shown = time elapsed), so a busy main thread can delay frames but never stretch the sequence. Everything turns off under `prefers-reduced-motion`.

**Generated images and codes.** Share cards (1080×1350, 4:5) are real React components rendered off-screen and captured with html-to-image; QR codes come from the `qrcode` library; link previews use `next/og` image generation.

## On-device computer vision

The mirror has no buttons: three Google MediaPipe Tasks Vision models run in the browser on the GPU (WebGL delegate) and turn the webcam into gestures, body positions and a person mask, with no video ever leaving the laptop.

| Model | What it gives | Rate | Used for |
| --- | --- | --- | --- |
| Gesture Recognizer (float16) | up to 4 hands: 21 landmarks + a named gesture each | ~15 fps | waves, double peace, fists, thumbs |
| Pose Landmarker Lite (float16) | up to 2 bodies: 33 landmarks each | ~5 fps (every 3rd frame) | framing, who is who, battle poses |
| Selfie Segmenter | a person mask | per frame / per capture | the cyan "aura glow" around you |

**Camera pipeline.** The webcam (a Live Streamer CAM 313, requested at 1080p) is mounted sideways, so each frame is rotated 90° on a canvas before detection and before capture; detection runs on a 640 px copy to stay fast. The camera is picked by name (`KIOSK_CAMERA`), and settings (rotation, flip, mirror panel width) persist in the browser and can be changed remotely from /admin.

**The gesture engine** (`lib/kiosk/gestureEngine.ts`) is pure TypeScript that turns noisy per-frame classifications into deliberate events. Each gesture has to be held, fills a progress ring on screen, survives brief tracker dropouts ("bridging"), and then enters a refractory period so it cannot double-fire.

| Gesture | Hold | Rule | Action |
| --- | --- | --- | --- |
| Wave | none | open palm raised to shoulder height, 3 left-right reversals within 2 s, at least 6% of the frame of travel | say hi (the mannequin waves back) |
| Double peace | 600 ms | both hands "Victory", body framed | solo scan |
| Two fists | 750 ms | two framed people facing the camera, each with a battle sign | 1v1 battle (alone: the kiosk roasts you) |
| Thumbs up / down | 1 s | one confident hand | squad lobby, claim the card, or another roast |

**Framing.** From the pose landmarks the kiosk decides whether the main person (the largest body) is fully in shot, and nudges them by text and voice: "step back" or "step closer". Scans only fire when a body is framed, and a 1v1 needs both people framed; if one drops out at the shutter, the capture reuses the last frame that had both (under 2 s old) instead of splitting the photo in half.

**Pose scoring for battles.** Battles score the pose as well as the fit. A small neural network (a multilayer perceptron with a softmax output, trained with `scripts/pose-train.ts` on landmark features from 500 Wikimedia Commons photos) classifies six pose archetypes: runway, hero, action, fighter, dance and standing. Cross-validated accuracy is about 46% against 17% chance. Geometry rules sit on top for poses the network can't learn from so few photos: fists on hips reads as "hero stance", a hand by the face, hands together or looking away as "main character". `/pose-lab` records labelled samples from the kiosk camera for retraining.

## 3D mannequin

The mannequin is your outfit rebuilt in Three.js from the judges' item list: no 3D models are downloaded, every garment is generated from code, so any combination the judges describe can be dressed on the spot.

**Rendering.** A single WebGL scene (`lib/mannequin/scene.ts`) with a hemisphere light, a shadow-casting key light (soft PCF shadows on a ground disc) and physically based materials tuned per fabric (12 presets: cotton, knit, fleece, denim, wool, nylon, leather, puffer, rubber, metal, glass, plastic). Parts are rounded boxes and simple solids, and each gets an "inverted hull" outline (back faces pushed out along their normals) for the cartoon line-art look; tiny parts skip it or use a thin hull so details don't blob together. A text band orbits the figure ("WAVE IF YOU THINK YOUR FIT HAS AURA").

**Procedural wardrobe.** `lib/clothing` maps an analysis to an outfit: each item's category and name choose a garment type, and its colour, fit and pattern come from what the judges reported. A seeded random generator fills anything unstated, so the same scan always dresses the same way.

| Slot | Types | Examples |
| --- | --- | --- |
| Top | 12 | tee, hoodie, button-up, polo, turtleneck, quarter-zip, dress, gown |
| Outerwear | 12 | puffer, blazer, varsity, denim, trench, overcoat, leather, cardigan |
| Bottom | 7 | jeans, cargos, shorts, slacks, trackpants, sweatpants, skirt |
| Shoes | 9 | sneakers, high-tops, boots, loafers, oxfords, heels, slides |
| Headwear | 6 | beanie, cap, bucket, cowboy, headband, bandana |
| Eyewear | 9 | aviators, wayfarers, round and rectangular glasses |
| Accessory | 10 | backpack, crossbody, headphones, chain, watch, scarf, tie, pocket square |

Patterns (stripes, check, colour-block, camo), fits (slim to oversized) and full looks (suit, gown) layer on top, and roughly 1 fit in 100 rolls a costume: a mascot suit (cheetah, T-rex, frog, chicken, shark), an astronaut or a diver.

**Rig and animation.** A jointed rig (`rig.ts`) is posed by keyframe animations defined as data (`lib/poses.ts`): each pose sets joint rotations, root offset, body turn (yaw) and hand shapes, with easing between keyframes. Poses can be merged and mirrored left-to-right, which is how one wave or fight stance serves both sides. `/pose-editor` edits them visually.

**The director** (`useMannequinDirector.ts`) maps kiosk state to behaviour: spin and re-roll outfits while idle, face front and "lock" the fit when a session starts, greet with an idol pose, strike a pose on the countdown, celebrate or slump on the result. Waves are answered every time, getting visibly more bored with each one before the next scan (lower arm, slower and fewer flaps, a slouch, head drooping). In battles it builds a line-up with one figure per player, each dressed from that player's own scan, fists up and turned to face each other, with the middle of an odd-sized squad facing the crowd.

## AI judging pipeline

A scan is a two-stage pipeline: a local GPU model finds the garments, then up to three AI judges rate the outfit in parallel, and a deterministic curve turns their ratings into the aura. Any judge may fail without failing the scan.

*Diagram (in the live doc): capture (1080p, rotated, 1536 px JPEG, hashed) → garment segmenter (local GPU) → GPT-4o-mini, Gemini 3.8 Flash and Claude Opus 5 (optional) in parallel → merge → score → save and reveal.*

The scan waits for the slowest judge that answers; a judge that errors, refuses or times out is simply left out.

**Entry points.** All three share one function, `processScan` (`lib/server/processScan.ts`).

| Route | Who calls it | Judges | Pose |
| --- | --- | --- | --- |
| `/api/analyze` | mirror solo scan | GPT + Gemini (+ Claude) | no |
| `/api/battle/scan` | each battle player | GPT only | yes, from live landmarks |
| `/api/scan/quick` | phone upload | GPT only | no |

**1. Capture.** The mirror grabs a 1080p frame, rotates it upright and encodes a 1536 px JPEG (which also strips metadata). A SHA-256 hash of the image makes identical scans cache hits. Server-side caps protect the budget: 600 scans a day, of which at most 400 from phones.

**2. Garment segmenter.** A Python sidecar on the laptop (`ml-service/`: FastAPI + Uvicorn, PyTorch with CUDA, Hugging Face Transformers v5) runs SegFormer-B3 fine-tuned for clothing (`sayeed99/segformer_b3_clothes`) on the RTX 4060 in about 1.7 s. It returns each garment region with a box, its share of the image and colours measured from the pixels, plus a face box. Those hints go into every judge's prompt; if the sidecar is down or slow (4 s timeout) the scan continues without it.

**3. Judges, in parallel.**

- **GPT-4o-mini** (OpenAI, `detail: high` image input, strict JSON schema) returns the full analysis: every item (name, category, colour, estimated price, uniqueness, statement piece, box), held objects, the face box, cohesion scores (colour harmony, silhouette, style consistency), a style mix, modifiers, a nickname and the verdict.
- **Gemini 3.8 Flash** (Google GenAI SDK, structured output, thinking off, 10 s timeout) returns its own rating, verdict, nickname, style, modifiers and item list.
- **Claude Opus 5** (Anthropic SDK, structured output validated with zod, adaptive thinking at low effort, 12 s timeout, no retries, server-side refusal fallbacks) returns the same shape. It switches on only when `ANTHROPIC_API_KEY` is set.

All judges get the same rubric: judge only the person nearest the camera, list every visible layer (a collar under a sweater, a tie, belts, shoes), and rate "specialness" as a percentile against a typical hackathon crowd (50 = hoodie and jeans, most fits 30 to 75). Judge model names are never shown or spoken: the mirror says JUDGE 1, 2, 3.

**4. Merge.** Pieces any judge saw that the analysis lacks are added (matched by category and key noun, so "tan half-zip" and "beige quarter-zip sweater" count once, and nobody gets two pairs of pants). Segmentation boxes replace the models' guessed boxes, and the face box is used to blur faces on share cards.

**5. Score.** Each judge's rating becomes an aura on a two-part curve. Below that judge's cutoff c the aura stays near zero (at most ±20,000); above it, a power curve swings it up to ±1,000,000 at 100. The sign follows the judge's sentiment.

```latex
\text{aura}(s) = \pm \begin{cases} 20{,}000 \left(\frac{s}{c}\right)^{1.5} & s \le c \\[4pt] 20{,}000 + 980{,}000 \left(\frac{s - c}{100 - c}\right)^{2.2} & s > c \end{cases}
```

The cutoff starts at 80 and adapts: once a judge has enough ratings today, c becomes that judge's 80th percentile (clamped to 60 to 95), so roughly 1 fit in 5 swings wide even if a model rates everyone generously. House penalties are then added: shorts −80,000, clashing colours up to −180,000 (colour harmony under 45), pieces that don't go together up to −112,500 (style consistency under 45), and no outfit visible is a flat −1,000,000. The official aura is the average of the judges that answered. They "disagree" when the two furthest apart differ by 300,000 or more, or point opposite ways by at least 40,000, which triggers the "JUDGES DISAGREE" reveal.

**Battles** add the pose: total = fit aura + (pose score − 40) × 2,500. A squad is revealed as a countdown from last place to first, synced to the voice, and the head-to-head commentary is streamed from the model as it is written.

## Voice and audio

The mirror talks, plays music and reacts like a crowd, and one rule keeps it listenable: nothing ever talks over anything else.

**The announcer** (`lib/kiosk/announcer.ts`) is a single queue for everything spoken: greetings, prompts ("step back", "strike a pose"), the aura callout, each judge's verdict, battle commentary and squad countdowns.

- **Voice:** ElevenLabs text-to-speech (`eleven_flash_v2_5`, MP3), called through the app's own `/api/voice` route so the API key never reaches the browser. The next two lines are fetched ahead of time so playback doesn't wait on the network.
- **Fallback:** without a key, or when a clip fails, the browser's Web Speech API speaks the line, with the voice, speed and pitch adjustable from /admin.
- **Sync:** a queued line can carry start and end cues, which is how a squad's places are revealed exactly as the voice calls them.
- **Stop means stop:** a generation counter ends the line in progress (including a clip still downloading), and only one playback loop can ever run, so there are never two voices at once. Ending a session silences the announcer.

**Music** (`lib/kiosk/music.ts`, Web Audio API) plays a quiet background loop (level 0.12) and a result jingle (0.5). Loop points live in `public/audio/loop.json` and are edited live in `/music-lab`; the mirror re-reads them every 30 s. The loop fades out within about 0.1 s whenever the voice queue is busy, during the charge-up, countdowns and analysis, and under the jingle, and fades back 1.5 s after the voice goes quiet. The music files are third-party, so they are committed for the laptop but excluded from deploys (`export-ignore`).

**Sound effects.** UI sounds are synthesized in Web Audio. Crowd reactions after a solo aura (a big cheer, a small cheer, crickets, an "awww", a cartoon fart for the worst scores) were generated once with the ElevenLabs sound-effects API and saved as files; without them each is synthesized. They are queued right after the aura callout, so the order is always jingle, "your aura is…", reaction, verdict.

**Controls.** Master, music, judge-voice and effects volumes, plus mute toggles, are part of the kiosk settings: set with the + and − keys or the settings window (S) on the mirror, or remotely from /admin, which reports the mirror's live state.

## Data layer

All state lives in one Tiger Data database (managed TimescaleDB on PostgreSQL), shared by the laptop and the public server; that single shared database is what lets a phone, the public admin page and the mirror act on the same line, feed and leaderboards.

**Access.** node-postgres (`pg`) connection pools over TLS, verified against the public root certificates plus Timescale's CA. The schema is a list of idempotent statements (`CREATE … IF NOT EXISTS`, additive `ALTER`s, backfills that only touch unset rows) applied on first use or with `npm run db:setup`, so a fresh server needs no migration step.

**Time-series features.** `scans` and `judge_scores` are hypertables partitioned by day. `aura_15m` is a real-time continuous aggregate (15-minute buckets: scan count, average, best and worst aura, wide swings, judge disagreements), refreshed every minute over the last 3 days. It powers the /tv "aura over the event" chart and the hottest-hour stat. `judge_scores` also feeds each judge's adaptive cutoff (today's ratings per judge).

| Table | Holds |
| --- | --- |
| `scans`, `judge_scores` | every analysis, its breakdown and each judge's rating |
| `cards`, `reactions` | share-card images (PNG/JPEG), moderation flags, feed reactions |
| `leaderboard_entries` | ranked entries tagged with a board: solo, duo, squad or mobile |
| `battles`, `battle_players` | 1v1 and squad outcomes, per-player totals and places |
| `players`, `fit_history` | AURA IDs (NAME#CODE); recent mannequin outfit signatures, so the idle spin never repeats a look |
| `duels`, `duel_accepts` | challenge-by-link duels and who accepted |
| `kiosk_status`, `remote_commands`, `challengers`, `mirror_launches` | the kiosk relay |
| `raw_photos` | only written when `STORE_RAW_PHOTOS=true` (off by default) |

**Four leaderboards.** Scores are only comparable within one kind of scan: a battle total includes the pose, a mirror solo scan has two or three judges and no pose, a phone upload one judge and no pose. Each entry is tagged when its card is saved (solo, duo, squad or mobile), and `/api/leaderboard?board=` ranks the top 50 and "your best" (matched by phone or AURA ID) on that board alone. Without a board, everything ranks together for the TV, the mirror and admin.

**The kiosk relay.** The mirror reports its status (screen, camera, people in frame, settings, audio state) as a heartbeat; /admin sends commands (scan, battle, reset, mute, settings) that the mirror polls every second from a cursor, so old commands are never replayed; walk-ins and "beat this score" taps join a shared line; and OPEN MIRROR on the public site leaves a launch request that the laptop's server picks up every 3 s and runs the kiosk launcher.

**MOCK MODE.** An in-memory store implements the same interface, so the whole app runs with zero API keys and no database: judges become fixtures, the second judge a deterministic mock that sometimes disagrees, and relay state stays in one process.

## Phone companion and social

Anyone can use AuraOS from a phone at www.aurafulos.tech, and every mirror result can hop to a phone through a QR code, so the kiosk is the showpiece and the phone is where results travel.

**Mirror-to-phone handoff.** The idle screen shows a large black-on-white QR to `/scan`. After a thumbs up and a name, the claim screen shows a second QR to that scan's card page, `/r/[id]`, pointing at the public site (not localhost) so it works from any phone.

**Phone scans** (`/scan` → `POST /api/scan/quick`).

- The phone takes or picks a photo, shrinks it to 1024 px JPEG in the browser, and uploads it with a progress bar.
- The server accepts only real JPEG, PNG or WebP (checked by file signature, not extension), up to 5 MB, and strips EXIF and GPS data before anything else.
- Rate limits: 5 scans per 10 minutes per phone and 30 per IP (the venue shares one IP), and phones may use at most 400 of the 600 daily scans. Raw photos are not stored.
- The phone then draws the same share card as the mirror (face blurred) and lands on `/r/[id]`. If a step fails, RETRY resumes from that step.

**Cards and sharing.** `/r/[id]` shows the card, the score breakdown and a SHARE button using the Web Share API with the image file attached (falling back to copy link and download). Each card page has Open Graph and Twitter tags with the card as its preview image, so pasted links unfurl.

**Challenge by link** (`/c/[id]`, a 12-character random id). The phone that made a card can send a challenge; friends see the card with the score blacked out, scan their own fit to accept, and the two stored scans battle (pose neutral on both sides, so the fit decides). The result is posted to the feed as a side-by-side image rendered with `next/og`, and everyone involved sees every result.

**Feed, boards and identity.**

- `/feed`: every card from the mirror, phones and challenges, newest first, with infinite scroll, emoji reactions and an 8 s refresh.
- `/leaderboard`: SOLOS, DUOS, GROUPS and MOBILE tabs, each with its own top 25 and "your best", refreshed every 5 s.
- AURA IDs: a name plus a short code (NAME#CODE) with a profile page at `/u/[handle]`; a phone is recognised by an anonymous device id that never leaves the server.
- The app shell has a bottom tab bar (SCAN · FEED · BOARD · ME) and loads no Three.js or MediaPipe, so it stays light on phones.

**Moderation.** From /admin (or `POST /api/admin/remove` with the admin key), a card can be hidden: its image, its page, its feed post and its board entry disappear from every open screen within about 15 s. Nothing is deleted, so a mistake can be undone.

## Extras and operations

The extras are all best-effort: a badge, a print or an operator tool can fail without touching the score, the card or the kiosk flow.

**Solana aura badges.** A claimed card can be minted as a compressed NFT on Solana devnet with Metaplex Bubblegum (through the Umi framework). Minting is custodial: the server wallet mints into its own Merkle tree under one collection, so visitors never connect a wallet. Compressed NFTs cost a fraction of a regular mint, which is what makes one per visitor practical. `npm run solana:setup` creates the keypair, tree and collection; a mint that takes longer than 30 s is abandoned, and the claim screen just shows the result when it lands.

**Certificate printing.** With `PRINTING_ENABLED=true`, a claim also prints an "Aura Certificate" (`/certificate/[id]`, a print-styled page) through a hidden frame and the browser's print dialog, while the mannequin strikes a proud presenting pose. Off by default.

**Admin dashboard** (`/admin`, unlocked with `ADMIN_KEY`, identical on the laptop and the public site):

- **Mirror now:** live status (screen, camera, people in frame), and OPEN MIRROR to launch the kiosk remotely.
- **Controls:** scan, battle, squad, start, wave, reset, mute all, mute music, mute voice.
- **Camera and sound settings:** camera choice and rotation, master, music, judge-voice and effects volume, browser voice, speed and pitch, applied to the mirror live.
- **The line:** walk-ins, "beat this score" requests from phones, and CALL UP, which makes the mirror announce the next name.
- **Moderation and stats:** the live feed with HIDE, standings with edit and delete, today's counts, and a phone QR that opens full screen for judges.

**Kiosk launcher.** `npm run kiosk:launch` (PowerShell) checks the server is up, finds the portrait monitor, and opens the mirror full screen in Chrome kiosk mode on a separate Chrome profile (autoplay allowed, crash bubbles off), plus admin on the main screen. The public site's OPEN MIRROR reaches it through the relay.

**Developer tools.** `/music-lab` (loop points, jingle, crowd reactions), `/pose-lab` (record labelled poses), `/pose-editor` (edit keyframe poses) and `/card-lab` (preview share cards), plus a debug overlay (D) and settings window (S) on the kiosk.

## Infrastructure and deployment

Two machines run the same code from the same GitHub repository ([calvinschnell-cmd/AuraOS](https://github.com/calvinschnell-cmd/AuraOS)): the kiosk laptop on site and one small cloud VM for the public site.

|  | Kiosk laptop | Public server |
| --- | --- | --- |
| Hardware | Windows 11 laptop, RTX 4060, portrait monitor behind acrylic, USB webcam | Vultr high-performance VM (2 vCPU, 4 GB), Atlanta, Ubuntu 24.04 |
| App | `next dev` on port 3000 (hot reload) | `next build` + `next start` under systemd (`aura.service`) |
| HTTPS | not needed (localhost counts as secure for the camera) | Caddy with automatic certificates for aurafulos.tech, www and an sslip.io fallback |
| Garment segmenter | Python venv with CUDA PyTorch (`npm run ml`) | off (`CLASSIFIER_MODE=skip`, no GPU) |
| Music files | present | excluded from the deploy |

**Deploy** (`bash scripts/server/deploy.sh`, a few minutes):

1. Package the committed `HEAD` with `git archive` (so uncommitted work and `export-ignore` files never ship) and stream it over SSH.
2. Copy the laptop's `.env.local` and force the server settings: public URL on www, segmenter off, printing off.
3. Install with `npm ci` from the lock file (falling back to `npm install`) and run a production `next build` on the box.
4. Restart the systemd service, then check that `/feed` answers 200 before printing `==> live:`.

**Domain.** aurafulos.tech (a .tech domain from the MLH hackathon offer) points its apex and www A records at the VM.

**Secrets.** API keys (OpenAI, Gemini, ElevenLabs, Tiger Data, Anthropic, the admin key) live only in `.env.local`, which is gitignored and copied to the server by the deploy; the Solana keypair sits in a gitignored `.solana/` folder; the SSH key is a local file. Keys never reach the browser: every AI and voice call goes through the app's own API routes.

## Quality

At the final commit (`db902e5`, deployed 27 Sep 2026), typecheck and lint are clean, all 247 unit tests pass across 30 files, and a production build succeeds.

| Check | Tool | Result |
| --- | --- | --- |
| Types | `tsc --noEmit` (TypeScript 5, strict) | clean |
| Lint | ESLint 9 with the Next.js config and React hooks rules | clean |
| Unit tests | Vitest 5, 30 files | 247 passed |
| Production build | `next build` | succeeds |
| Relay against the real database | `npm run relay:check` | 10 of 10 pass |
| Screen checks | `npm run demo:screens` (headless Chrome, MOCK MODE) | 16 of 19; the 3 failures look for a HOME link the phone tab bar no longer has |

**What the tests cover.** The scoring curve and adaptive cutoff, judge parsing and the multi-judge pipeline (including one or two judges failing, Claude via a stubbed SDK, and item merging), the kiosk state machine and gesture engine (holds, waves, bridging, framing), the announcer (a regression test with a fake browser voice for "two voices at once"), the four leaderboards, phone scan safety (file sniffing, EXIF stripping, rate limits), the relay, duels, the feed, clothing generation, and the Tiger and Solana adapters. External services are mocked in unit tests; MOCK MODE lets the whole app run with no keys.

**Verified live during the event** (not just in tests): real mirror scans with GPT-4o-mini and Gemini 3.8 Flash (a Gemini judge call with items took 4.9 s), the GPU segmenter answering in 1.7 s, the relay against Tiger Data, and the public deploy.

**Not yet checked for real:** the Claude judge (tested only with a stubbed SDK, since there is no Anthropic key yet); whether the webcam actually delivers 1080p (it is requested, and the camera is sold as 1080p); and on real phones, the iOS and Android share sheet with the image attached, the two-phone challenge on the live site, and scanning the mirror QR codes through the acrylic from 1.5 m.

## Known limits and next steps

The system is complete and live; its weak points are the edges of what a webcam and a small model can see, plus a few operational sharp edges found during the event.

| Limit | Effect | Next step |
| --- | --- | --- |
| Small outfit details (ties, collars under sweaters) | GPT-4o-mini alone often missed them | Done: 1080p captures, a "list every layer" rubric and item merging across judges; a stronger model is one setting away |
| Room lighting and webcam colour balance | beige read as "light grey" in dim light | warm front light at the mirror; optionally a white-balance correction before capture |
| Peace signs vs "hand by the face" | body landmarks have no fingers, so the pose rule can confuse them | use the hand tracker's Victory gesture at capture time |
| Pose classifier trained on 500 photos | about 46% accuracy (chance 17%), backed by geometry rules | record more labelled poses in `/pose-lab` and retrain |
| One webcam, one app | a stale kiosk tab or a call app blocks the mirror's camera | the launcher could warn when another process holds the camera |
| Shared kiosk status | any kiosk page (even the public `/kiosk`) can overwrite what /admin shows as "the mirror" | tag status with the mirror's profile and ignore other kiosks |
| Free-tier AI quotas | Gemini's free tier capped at 20 calls a day before billing was added | keep billing on; judges already degrade gracefully |
| Claude judge off | no Anthropic API key (a Claude subscription doesn't include API credit) | add a key; roughly $0.03 to $0.05 per scan on Opus (estimate), or less on Sonnet |
| Manual deploys | run from the laptop over SSH; a Wi-Fi blip can abort one | retry; a CI deploy on push would remove the laptop from the loop |
| Windows animations off | the laptop reports "reduce motion", so its screens skip animations | turn on Windows animation effects on the kiosk laptop |
| Outdated screen checks | 3 of 19 `demo:screens` checks expect a removed HOME link | update the checks to the tab bar |

**Before judging:** a full run at the mirror with real people (wave, solo scan, card QR on a phone, 1v1, squad) is the one end-to-end check that no test replaces.
