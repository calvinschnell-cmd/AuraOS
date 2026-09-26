# AURA OS: Aura Detector Smart Mirror (HackGT 13)

You are building a solo hackathon project: a smart mirror kiosk that scans a person's outfit and gives them an intentionally ridiculous "Aura" score, hosted by an animated white mannequin, styled like a retro operating system.

The kiosk runs full screen in Chrome on a laptop behind a two-way mirror (portrait 32 inch monitor), or as a "digital mirror" (flipped camera feed) if the physical mirror is unavailable. Development happens on a desktop; the laptop pulls the repo and runs the kiosk at the event.

## How to work

- Work autonomously. Make reasonable decisions without asking me.
- Build the stages below in order. After each stage: run build, lint, and tests, fix all errors, `git commit` with a clear message, and `git push`. Then continue to the next stage.
- Everything must work in MOCK MODE with zero API keys (see Setup), so I can test the UI at any time.
- Keep logic shared and layouts thin. Never duplicate logic between display modes.
- At the very end, give me: (1) a setup checklist (keys, Supabase, Vercel, laptop kiosk launch), and (2) a manual test checklist for the physical setup.

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS
- Three.js for the mannequin
- MediaPipe Tasks Vision (@mediapipe/tasks-vision) in the browser: Image Segmenter (selfie), Gesture Recognizer (numHands: 2), Pose Landmarker (numPoses: 2)
- Google Gemini via the official @google/genai SDK on the paid tier (see Model, billing, and quota)
- Supabase: Postgres, Storage, Realtime
- zod for validation, a QR code library, html-to-image for the share card
- Deploy target: Vercel

## Model, billing, and quota

- Default model: the current full Gemini Flash model (not Flash-Lite, not Pro). Check the SDK docs for the latest model name. Keep it in one config constant with a GEMINI_MODEL env var override
- The API key runs on a paid (billing-enabled) Google AI Studio project
- Keep reasoning/thinking effort at the lowest setting the model supports for the analysis call. Thinking tokens are billed as output and add latency, and this task does not need deep reasoning
- Daily scan cap: 600 by default, configurable via DAILY_SCAN_CAP env var
- Handle HTTP 429 and 5xx errors gracefully: retry once after a short backoff, then show a funny AURA OS system error window ("> AURA SENSORS OVERHEATED. TRY AGAIN IN A MINUTE.") and return to READY
- Log input and output token counts per call; show today's call count and estimated spend in the D debug overlay
- Mock mode is the default during development; only call the real API when GEMINI_API_KEY is set

## Setup (Stage 0)

- Initialize the Next.js project with TypeScript, Tailwind, ESLint, and a test runner (Vitest)
- `.env.example` with: GEMINI_API_KEY, GEMINI_MODEL, DAILY_SCAN_CAP, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_KEY, PRINTING_ENABLED
- MOCK MODE: if GEMINI_API_KEY is missing, analysis returns realistic fixtures from lib/fixtures.ts (make 5 varied fixtures including one negative aura and one battle pair). If Supabase vars are missing, leaderboard features show a "not configured" state and the app keeps working, with fit history kept in memory
- `supabase/schema.sql` (see Database)
- README with local setup, Supabase setup, Vercel deploy, and laptop kiosk launch instructions

## Routes

- `/kiosk?mode=digital|mirror` : the main experience (default mode=digital)
- `/card/[id]` : the only phone-facing page. Shows the saved share card image with a download button and navigator.share. Reached by QR code
- `/leaderboard` : optional full-screen leaderboard for a second display, with a large QR code to nothing sensitive (just the leaderboard URL)
- `/pose-editor` : developer tool (hidden, no links to it)
- `/remote` : operator remote control, protected by ADMIN_KEY
- `/admin` : paste ADMIN_KEY to delete leaderboard entries
- `/certificate/[id]` : hidden print page (Stage 13)

## Architecture

- `lib/kiosk/` : shared hooks and logic: camera, MediaPipe setup, gesture engine, state machine, API calls, announcer, leaderboard subscription, session state (locked fit, current scan)
- `components/kiosk/DigitalLayout.tsx` and `components/kiosk/MirrorLayout.tsx` : presentational only, both receive the same state
- `lib/analyze.ts` : server-side model call behind a typed interface so the provider could be swapped
- `lib/prompts.ts` : all LLM prompts, easy for me to edit
- `lib/scoring.ts` : pure deterministic scoring
- `lib/mannequin/` : Three.js figure, rig, animation player
- `lib/poses.ts` : pose presets and keyframed animations
- `lib/clothing/` : procedural clothing generator and themes
- `lib/copy/` : my editable text lists: verdict examples, greetings, attract lines, footer jokes

## Design system: AURA OS

Style inspiration: a retro operating system / developer terminal desktop. Build an original design; do not copy any existing brand's logo, name, or icons.

Tokens (Tailwind config and CSS variables):
- Background: #161616 with a subtle 24px grid pattern (1px lines #222222)
- Accent: pale ice cyan #9EE7FF; brighter #C8F4FF for glow states
- Window body #F4F4F0, title bar #D6D6D2, window text #111111, 1px #111111 borders with a 1px inner highlight for a beveled feel
- Fonts (Google Fonts): "Silkscreen" for headings, logo, labels, buttons (all caps); "VT323" for large numbers like the aura score; "IBM Plex Mono" for small text
- No rounded corners anywhere

Components:
- Thin top bar with a pixel "AURA OS" wordmark left and status right (scans today, live dot)
- Large outlined pixel "AURA DETECTOR" wordmark in cyan with "VERSION 1.3.0, OUTFIT ANALYSIS ENVIRONMENT" beneath
- Panels are OS windows: title bar with small caps title, x glyph, resize-corner glyph, quick scale-up open animation
- Terminal text that types out character by character with a blinking block cursor
- Boot sequence on load ("INITIALIZING DRIP SENSORS... OK")
- Footer in tiny mono caps: "THIS INTERFACE IS PART OF THE AURA OPERATING SYSTEM. UNAUTHORIZED DRIP IS STRICTLY MONITORED." with [REBOOT] that resets the kiosk

Mode rules:
- mode=digital: full design system layered over a full-screen, horizontally flipped live camera feed. Text panels use semi-transparent dark backgrounds for readability over video
- mode=mirror: the monitor sits behind a two-way mirror. Pure #000000 background everywhere, no grid, no gray, no light windows, no gradients into gray. Windows invert to black bodies with 1px cyan borders and cyan title bars. Only text and lines glow. Never draw overlays on the live view (they cannot align with a reflection); show analysis on the frozen captured photo in a panel instead. Primary layout target is portrait 1080x1920

## Stage 1: Kiosk skeleton (digital mode)

- Full-screen /kiosk with camera (getUserMedia, pick camera in settings), flipped feed in digital mode
- Explicit state machine: SPINNING, LOCKING, GREETING, POSE_FOR_FANS, READY, CHARGING, COUNTDOWN, ANALYZING, RESULT, CLAIM, BATTLE_COUNTDOWN, BATTLE_RESULT, SULKING, ATTRACT
- Operator hotkeys: Space scan, W simulate wave, B battle, R reset, M mute, D debug overlay, S settings (camera select, mode, mirror/unmirror feed, text scale, printing toggle)
- Bottom gesture legend showing only the gestures valid in the current state, with emoji icons
- Privacy line on idle screen: "Photos are analyzed and not stored. Your card is saved only if you give a thumbs up."

## Stage 2: Analysis and scoring

Capture:
- On scan, capture a frame, resize to max 1024px long side, JPEG ~0.85 (strips EXIF), compute SHA-256 hash client-side

API POST /api/analyze:
- Return cached result if the image hash exists
- Call Gemini with the image and system prompt, requesting JSON matching the schema (use the SDK's structured output)
- Validate with zod; retry once; on failure return a friendly error the kiosk shows as a funny system error window
- Compute score with lib/scoring.ts, save to scans (result JSON and aura only, never the image), return scan id, result, and today's rank
- Enforce DAILY_SCAN_CAP (see Model, billing, and quota)

Gemini JSON schema:
```
{
  "is_outfit_photo": boolean,
  "style_mix": [{ "style": string, "percent": number }],   // top 3, sums to 100
  "items": [{
    "name": string,
    "category": "top" | "outerwear" | "bottom" | "shoes" | "accessory" | "jewelry" | "bag" | "headwear" | "eyewear" | "watch",
    "color": string,
    "estimated_price_usd": number,
    "uniqueness": number,                                  // 0-100
    "is_statement_piece": boolean,
    "box_2d": [ymin, xmin, ymax, xmax]                    // normalized 0-1000
  }],
  "held_objects": [{ "name": string, "box_2d": [ymin, xmin, ymax, xmax] }],
  "face_box": [ymin, xmin, ymax, xmax] | null,
  "cohesion": { "color_harmony": number, "silhouette": number, "style_consistency": number },
  "modifiers": [{ "emoji": string, "label": string, "tier": "minor" | "major" | "legendary" | "penalty" }],  // 3 to 6
  "nickname": string,        // short leaderboard nickname from the standout item, e.g. "Vintage Racing Jacket Guy"
  "verdict": string
}
```
Allowed styles: streetwear, old money, professional, gorpcore, Y2K, techwear, athleisure, preppy, grunge, minimalist, cottagecore, business casual, hackathon survivor, bummy.

System prompt (lib/prompts.ts):
```
You are the Aura Detector, a hype-man fashion analyst with a roast-comic streak. You judge OUTFITS ONLY.
Hard rules:
- Never comment on anyone's face, body, weight, height, skin, hair, age, race, ethnicity, gender, or attractiveness. Only clothes, accessories, held objects, color, and styling.
- Roasts target the fit, never the person. Playful, never mean-spirited or crude.
- If no outfit is visible, set is_outfit_photo to false and still give a funny verdict about what you see.
- Prices are rough guesses from apparent category and quality tier. Do not claim exact brands unless a logo is clearly visible.
- Modifiers must be specific to things actually visible.
- Nicknames describe the fit only, never the person's body or identity.
- Verdicts are short, specific, and funny, matching the style of these examples:
{{VERDICT_EXAMPLES}}
```
Load {{VERDICT_EXAMPLES}} from lib/copy/verdicts.ts. Seed it with: "Unemployed creative director", "Has a podcast with 11 listeners", "Owns a fermentation crock", "Final boss of the campus Starbucks", "Brought a carabiner to a Zoom call". I will replace these.

Scoring (lib/scoring.ts, pure function, unit tested):
- Seed a PRNG with the image hash
- Built for extremes: an average fit lands near 0; each signal is centered and squared (curve(x) = sign(x) * x^2), so the middle barely moves the score and the ends swing hard (roughly -20,000 to +25,000)
- base 0
- valuePoints = round(1200 * (log2(1 + min(fitValue, 3000) / 150) - 1)): $150 scores 0, cheaper costs aura
- uniquenessPoints = round(curve((avgUniqueness - 50) / 50) * 3500)
- statementPoints = 700 per statement piece, max 3
- cohesionScore = round(mean of cohesion values); cohesionPoints = round(curve((cohesionScore - 60) / span) * 6000), span = 40 above 60 and 60 below
- Modifier points by tier via seeded PRNG: minor 150 to 450, major 700 to 1800, legendary 3000 to 7000, penalty -4000 to -800
- is_outfit_photo false adds a "NO FIT DETECTED" penalty modifier of -5000
- bummyPenalty = -80 per percent of "bummy"
- rawAura = sum; often negative
- Million-point scale: aura = sign(rawAura) * 1,000,000 * tanh((|rawAura| / 20,000)^2), so average fits land in the tens of thousands and the extremes approach +-1,000,000 without passing it. Every breakdown line is scaled by the same factor, so the lines still add up to the aura
- Return a full breakdown for animation

Result reveal (must complete in under 8 seconds):
- Frozen captured photo in a window; in digital mode the aura glow (from the segmentation mask) surrounds the person, and bounding boxes with labels draw in one by one (convert box_2d from 0-1000 to pixels)
- Terminal output prints line by line: "> DETECTED: VINTAGE RACING JACKET ... UNIQ 94"
- Aura types out digit by digit in VT323, colored by magnitude
- Style mix bars, fit value, uniqueness, cohesion, statement pieces starred
- Modifiers appear as system messages with points
- Rank: "#7 OF 143 FITS TODAY"
- Verdict revealed last, large

## Stage 3: Gestures

Use MediaPipe built-in gesture classes only (Victory, Open_Palm, Thumb_Up, Thumb_Down). Run gesture recognition at ~15 fps. Every gesture requires a hold with a filling progress ring; releasing drains it.

- Double peace (both hands of one person "Victory", score > 0.6, held 750ms) in READY or idle states -> "HANDS DOWN, STRIKE A POSE!" -> 3-2-1 COUNTDOWN -> capture -> ANALYZING
- Two people detected (Pose Landmarker, numPoses 2), both showing double Victory -> Aura Battle. Assign hands to people by nearest wrist landmark
- Wave: a hand classified Open_Palm (score > 0.5) whose wrist x reverses direction at least 3 times within 1.5s, with a minimum travel threshold to ignore jitter. Report which screen side the waving hand is on (account for feed flipping per mode)
- RESULT: Thumb_Up (1s) -> CLAIM; Thumb_Down (1s) -> one extra spoken fit roast per scan, score unchanged; Open_Palm (1s) -> end session
- Ignore gestures while analyzing and during result reveal animation; 5s cooldown after session end
- Auto: RESULT and CLAIM reset after 30s, or after 5s with no person detected; ATTRACT after 60s with no person; attract text scrolls "WAVE IF YOU THINK YOUR FIT HAS AURA"
- D debug overlay: hand landmarks, gesture labels and scores, wave reversal count, person count, fps, current state, mannequin fit seed and theme

## Stage 4: Mannequin core

- Three.js scene, original stylized mannequin built from primitives: sphere head, rounded limbs, simple torso, hierarchical joints (neck, spine, shoulders, elbows, wrists, hips, knees, ankles) and a movable root for sitting and jumping
- Hands: small fist with index and middle finger segments that extend for peace signs; open-hand pose for waves and palms
- Digital mode: solid white matte with soft lighting. Mirror mode: glowing cyan edges only (EdgesGeometry or an outline pass) on pure black, no fills
- Animations are arrays of keyframes { pose, durationMs, easing } played by an animation player that can blend into any animation from any current pose within ~200ms
- Idle sway and breathing

Session flow:
- SPINNING (default when no session): turntable rotation; every ~500ms every clothing slot re-randomizes with a quick glitch flicker; terminal "> SELECTING YOUR GUY..."
- Wave -> LOCKING: turntable decelerates to face forward over ~1s, slots stop one by one like a slot machine, flash, terminal "> FIT LOCKED." (never show the theme name)
- GREETING: mannequin waves back immediately with the arm on the same screen side as the person's waving hand. Wave animation: upper arm near horizontal, elbow ~100 degrees with forearm up, open hand with spread fingers, forearm oscillates +/- 25 degrees from the elbow 3 times over ~1.8s with a wrist flick offset, head tilt toward the waving arm, slight lean, knee bounce. Greeting text "> HELLO." types as the wave starts; announcer speaks a random greeting from lib/copy/greetings.ts (15 lines, never the same twice in a row, each ending with a nudge toward the double peace sign)
- Repeated waves after the greeting get one smaller, quicker wave back (no new text or voice)
- POSE_FOR_FANS: terminal "> POSE FOR THE FANS." and the mannequin holds a random double peace idol pose for 2s (never the same twice in a row):
  - peace signs framing the face, head tilted, lean forward
  - peace signs at cheeks, head tilted, one knee bent inward
  - peace signs at chest height, shoulders raised, knees together, shy lean
  - peace signs beside the head, one leg kicked up behind, slight hop
  - arms forward with peace signs, one hip popped out
- READY: terminal "> DOUBLE PEACE TO SCAN YOUR AURA."
- The locked fit stays for the entire session
- Result reactions: aura in the top 20% of today's scans -> victory celebration (anticipation, jump, arms up, landing); negative aura -> dramatic slump to the floor; otherwise thumbs up
- Session end -> return to SPINNING with a fresh roll

## Stage 5: Pose editor

/pose-editor:
- Mannequin centered with orbit controls
- Sliders for every joint rotation axis, root position, and finger extension per hand
- Load any preset; "Copy pose JSON" in the exact lib/poses.ts format
- Animation preview with 1x / 0.25x speed and a scrubber
- Clothing panel: pick theme, reroll, lock individual slots, toggle clothing visibility
- Clipping check that flags garment geometry intersecting hand/finger bounding volumes in wave, peace, and idol poses

## Stage 6: Share card and QR claim

- On Thumb_Up (CLAIM state): render a 1080x1350 card with html-to-image in the AURA OS style as a window: aura score, top style mix, fit value, uniqueness, cohesion, top 3 modifiers, verdict, rank, the captured photo with the face blurred using face_box (canvas blur), and "AURA DETECTOR @ HACKGT 13" footer
- Upload only this rendered card PNG to Supabase Storage (never the raw photo) and show a large QR code to /card/[id] with "SCAN TO GET YOUR CARD"
- /card/[id]: card image, download button, navigator.share

## Stage 7: Leaderboard ("The Tide Chart")

- Thumb_Up also adds the scan to leaderboard_entries with the model's nickname (basic profanity filter, max 30 chars), no photo
- Kiosk shows a Tide Chart column (right side) in idle and attract states: live top 5 (nickname + aura) and total scans today via Supabase Realtime
- New #1 triggers a celebration animation and announcer line "NEW AURA KING"
- /leaderboard: full-screen top 50 with highest and lowest aura highlighted, scans counter, and a bottom ticker of recent scans like "+2,400 AURA FROM A THRIFTED WORK JACKET" (item names only)
- DELETE /api/admin/entry/[id] requires ADMIN_KEY header; /admin page to remove entries

## Stage 8: Mirror mode layout

- Implement MirrorLayout per the mode rules: pure black, cyan-only UI, no overlays on the reflection, captured photo panel in the lower half during the reveal, aura score large at the top, Tide Chart column on the side
- Mannequin renders as cyan edges
- Both layouts must work from identical state; switching mode is only the URL param or the settings toggle

## Stage 9: Announcer and sound

- Web Speech API announcer in an over-the-top ring announcer style, dramatic pauses via separate utterances. Reads greetings, the aura, and the verdict. Mute toggle (M)
- Web Audio API synthesized sounds (original, no copyrighted clips): charge-up hum during CHARGING and ANALYZING, impact hit on aura reveal, sad descending tones for negative aura, slot machine ticks during LOCKING

## Stage 10: Procedural clothing generator

Replace placeholder outfits with a parametric generator in lib/clothing/. Every garment is built from the same smooth rounded primitives and matte material as the mannequin, as slightly inflated shells attached to joints so they follow poses. Flat colors only. No brands, text, or logos.

Garment types:
- Tops: tee, long sleeve, hoodie (hood up/down, drawstrings), crewneck, button-up (tucked/untucked, collar), polo, tank, turtleneck, quarter-zip, jersey
- Outerwear: none, puffer (quilted ridges), blazer (lapels, buttons), varsity (contrast sleeves), denim jacket, trench (belt), fleece, windbreaker, leather jacket, cardigan, vest
- Bottoms: jeans (straight/baggy/skinny), cargos (side pockets), shorts, slacks, track pants (side stripes), sweatpants, skirt, overalls
- Shoes: sneakers (low/high), chunky runners, boots, loafers, slides, hiking boots
- Headwear: none, beanie, cap (forward/backward), bucket hat, headband, bandana
- Accessories (0 to 2): sunglasses (tiny/oversized/sport), tote, crossbody, backpack, headphones, chain, watch, scarf, carabiner
- Shared parameters: fit (slim/regular/oversized), length, sleeve length, primary + secondary color, pattern (solid, stripes, color block, check, camo-style blobs) via a simple shader

Hands always visible:
- Sleeves end at or above the wrist in every fit and pose; oversized means wider, never longer
- No gloves, nothing held in hands; bags on shoulder or back only; only wrist accessories near hands

Themes (lib/clothing/themes.ts, internal only, never displayed outside the debug overlay): streetwear, old money, gorpcore, Y2K, techwear, preppy, athleisure, grunge, minimalist, business casual, hackathon survivor, bummy. Each theme defines allowed garments per slot with weights, 4 to 6 palettes, and parameter ranges.

Per-fit uniqueness:
- 80% of rolls pick a theme; 20% are chaos rolls with fully random slots
- Within a theme, randomize garment per slot, palette, per-item hue/lightness jitter within the palette, accent color, pattern, and detail toggles (rolled cuffs, hood up/down, cap direction, tucked/untucked, open/closed jacket, hoodie layered under outerwear)
- Wildcards: 1 guaranteed and 1 optional (40%) twist per fit: an off-theme garment in one slot, an unexpected accent color, or an unusual layering choice
- Seeded generation so any fit can be recreated from its seed
- Anti-repeat: fit signature = garment types per slot plus quantized colors. Keep the last 300 signatures (Supabase fit_history, in-memory fallback). If a new roll matches an existing signature on 4 or more slots, silently reroll (max 10 attempts)

Rendering: digital mode shows full colors and patterns; mirror mode shows cyan silhouettes and major seam lines only.

## Stage 11: Aura Battles

- Triggered by two people double peacing together (or B hotkey)
- Spawn a second mannequin with its own random locked fit; both stand side by side
- Capture one frame, split into two crops by each person's pose bounding box, analyze both
- Reveal: both auras count up simultaneously, winner highlighted, loser gets one spoken fit roast from a small extra Gemini call using the same safety rules (cached by the pair of hashes)
- Winner mannequin celebrates, loser slumps
- Battle card (1080x1350) with both faces blurred, both scores, winner; saved and claimable via QR only on Thumb_Up

## Stage 12: Wave meltdown and remote

Wave meltdown:
- Track continuous waving after the greeting (gaps under 1.5s count as continuous)
- 8s: mannequin's waves get smaller and slower
- 15s: stops, crosses arms, taps foot; cyan anger symbol above its head; terminal "> OK. WE GET IT."
- Then: flat palm toward the person, turns its back, sits cross-legged (SULKING). Announcer: "The mirror is taking a break. Maybe try a double peace sign instead."
- Waving stops for 3s: stands, turns around, dusts itself off, terminal "> APOLOGY ACCEPTED.", session resumes
- Double peace during the sulk snaps it out and starts the scan

Remote:
- /remote, protected by ADMIN_KEY, big buttons: Scan, Battle, Simulate Wave, Reset, Mute, Mode toggle
- Commands sent to the kiosk over a Supabase Realtime channel

## Stage 13: Aura Certificate printing (off by default)

- Only active when PRINTING_ENABLED=true (also toggleable in S settings)
- On Thumb_Up, print /certificate/[id] on US Letter portrait from a hidden iframe via window.print()
- Styled as an AURA OS window with title "CERTIFICATE_OF_AURA.EXE": large pixel heading "CERTIFICATE OF AURA", the session's locked mannequin in its final pose as clean black line art (outline only, no fills), itemized fit lines (item, estimated price, uniqueness), modifiers with points, fit value, cohesion, total aura large, rank, verdict, date, QR to /card/[id], signature line "The Aura Department"
- Black and white only, white background, no large filled areas; @page { size: letter; margin: 0.5in }
- Never print the person's photo
- Terminal "> PRINTING CERTIFICATE..." while the mannequin does a proud presenting pose
- If printing fails, skip silently
- README: launch Chrome with --kiosk-printing and set the printer as default so no dialog appears

## Database (supabase/schema.sql)

- scans: id uuid pk, image_hash text unique, result jsonb, aura int, created_at timestamptz
- leaderboard_entries: id uuid pk, scan_id uuid fk, nickname text, aura int, created_at timestamptz
- cards: id uuid pk, scan_id uuid fk null, battle_id uuid fk null, image_url text, created_at timestamptz
- battles: id uuid pk, scan_a uuid, scan_b uuid, roast text, created_at timestamptz
- fit_history: id uuid pk, signature text, seed text, created_at timestamptz
- RLS: public read on leaderboard_entries and cards only; all writes via server routes with the service role key
- Realtime enabled on leaderboard_entries and the remote control channel

## Privacy and safety

- Never store raw photos. Only store rendered share cards (face blurred) when the person gives a thumbs up
- Model output judges clothes only (see system prompt)
- No names or handles are collected; leaderboard uses generated nicknames

## Performance (kiosk runs on a laptop)

- Target 30 fps overall with segmentation, gestures, pose, and the mannequin running together
- Gesture recognition ~15 fps, segmentation ~15 fps, pose detection only when needed for battle checks (~5 fps otherwise)
- Mannequin renders at devicePixelRatio capped at 1.5
- Add a "performance mode" setting that halves detection rates and disables the live glow

## Final deliverables

- README: local setup, Supabase schema setup, Vercel deploy, laptop kiosk launch (Chrome --kiosk flag, camera permission, disable sleep and notifications, portrait display rotation, optional --kiosk-printing)
- lib/copy/ files with clearly marked placeholders for me to replace: verdicts, greetings, attract lines, footer jokes
- Setup checklist and manual test checklist
