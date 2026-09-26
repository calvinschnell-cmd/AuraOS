# AURA OS: Aura Battles platform (implementation map)

The Aura Battles build spec, item by item, and where each piece lives. Everything works in
MOCK MODE with zero API keys. Visual rule followed throughout: no new palette, fonts or shapes;
every new screen is built from the kiosk's OS windows, cyan accent + glow, Silkscreen / VT323 /
Plex Mono, and no rounded corners.

## 1. Product structure

| Spec | Implementation |
| --- | --- |
| AuraOS = platform, Aura Battles = headline mode, Aura Scanner demoted to Solo Scan | Wordmark "AURA BATTLES" + "AURA OS 2.0.0 · SOCIAL OUTFIT BATTLE ENVIRONMENT" (`components/kiosk/Wordmark.tsx`), launcher, leaderboard, card footer, README, metadata. "Aura Detector"/"Aura Scanner" no longer appears anywhere external-facing. |
| Boot defaults to a mode select: Battle (primary, larger), Solo Scan, Squad | `ModeSelectWindow` (`components/kiosk/Battle.tsx`) on idle + READY; gestures ✊✊ / ✌️✌️ / 👍 (`gestureEvent` in `lib/kiosk/machine.ts`), mouse/touch, hotkeys B / Space / Q, remote buttons. |
| Judge framing | [DEVPOST.md](./DEVPOST.md) opens with the social battling platform; solo is one mode. |

## 2. Aura Battles (1v1)

| Spec | Implementation |
| --- | --- |
| Lobby: P1 step up → capture → locks left; P2 → right; VS badge animates in once both lock | States `LOBBY` / `LOBBY_COUNTDOWN` (`lib/kiosk/machine.ts`), pure lobby logic `lib/kiosk/lobby.ts`, `LobbyWindow` with the VS badge arming when both slots fill. Captures are cropped to the person who stepped up (`captureLobby`, `lib/kiosk/battle.ts`). Two people signing together = one countdown, one frame split in two. |
| Both outfits scored in parallel, one loading screen | Better than parallel: each capture is scored the moment it is taken (`/api/battle/scan`) while the next player steps up; `BATTLE_INTRO` only waits for whatever is still in flight. |
| Result: two mannequins side by side in their detected outfits | `MannequinScene.setCrew` (N figures, `lib/mannequin/scene.ts`), dressed by `outfitFromAnalysis` (`lib/clothing/fromAnalysis.ts`: item names → garment types, color words → fabric colors). |
| Large center number = score gap; per-person stat rows (style, cohesion, uniqueness, price, pose) under each mannequin, reusing the solo stat rows | `BattleHero` + `BattleStrip` (columns placed under each figure from its projected screen position, `crewScreenX`), rows via the shared `StatRows` component (extracted from the solo reveal). |
| Head-to-head roast from both breakdowns together, < 40 words | `duelPrompt` / `squadPrompt` (`lib/battle/commentary.ts`), one text-only call. `COMMENTARY_SYSTEM`: gut reactions like a hype friend (casual swearing, one per line max, like the solo verdicts), never slurs, sexual content or anything about the person. |
| Winner glow (existing accent) + WINNER chip; both players get a card | `battle-col--winner` pulse in `--aura-glow`; the battle card carries both players. |
| Pose scoring from the landmarks MediaPipe already produces | `useGestures` keeps full landmark sets (`posesRef`); captured with each photo; scored server-side (`lib/server/pose.ts`). |
| Fit score + Pose score + combined total; can be won on pose | `computeOutcome` (`lib/battle/score.ts`): total = fit aura + `(pose - 40) × 2,500`; `decidedBy` = fit / pose / both. |
| Commentary calls out pose when it decided it | The decision line in the prompt ("The POSE decided it: ..."), the mock line ("...but that pose sealed it"), and a DECIDED BY THE POSE stamp. |
| Trained pose classifier (automated collection, automatic filtering, normalized angle features, weak-label classifier) | `ml-service/pose/collect.py` → `extract.py` → `scripts/pose-train.ts`; features `lib/pose/features.ts`; inference `lib/pose/classifier.ts`; results `ml-service/pose/REPORT.md`. |
| Mirror-aware matching | Mirror augmentation in training + mirror-averaged prediction at battle time (`predictArchetype`). |
| Named callout ("87% match to ...") | `PoseResult.label` / `match`, shown on the result, the card and in the commentary prompt (`describePose`). |

### Latency

| Spec | Implementation |
| --- | --- |
| Single judge in battle mode | `processScan(..., { singleJudge: true })`; solo keeps GPT + Gemini. |
| Lean vision call, text-only commentary | Vision call returns the analysis only; commentary is a separate text-only completion from the score sheets. |
| Hard max_tokens on commentary | `DUEL_MAX_TOKENS = 90`, `squadMaxTokens(n) = 60 + 30n`. |
| Stream the commentary | `/api/battle/[id]/commentary` returns a text stream; the kiosk renders it as it arrives (`streamCommentary`). |
| Mask with the reveal animation | `BATTLE_INTRO` (VS slam with both thumbnails, fight stances) lasts ≥ 1.4s (`BATTLE_INTRO_MIN_MS`). |
| Pre-flight warm-up | `/api/warmup` on kiosk boot and every 4 min while idle (`provider.warmup()`: a metadata GET, no tokens). |

## 3. Squad mode

| Spec | Implementation |
| --- | --- |
| Same lobby, N slots (cap 5), START once 2+ | `newLobby("squad")` (capacity 5), `canStart`; START via 👍 / two fists / Enter / the button / `/remote`; a 75s idle squad starts on its own. |
| Parallel scoring, tiled mannequins | Same pipeline; `setCrew` lays out up to 5 figures with shadows and framing scaled to the line-up. |
| Group Aura banner (synergy joke stat) | `squadSynergy` (cohesive but distinct top styles) and `squadScore` (average × 0.75-1.25). |
| Group commentary: vibe archetype + one short line per player | `squadPrompt` (opener + "P1: ..." lines, < 15 words each), `parseSquadCommentary` puts each line under its mannequin. Rule-based vibe archetype (`squadVibe`) is the banner / card verdict. |
| Slow reveal: a countdown from dead last to first | `countdownScript` (`lib/battle/reveal.ts`): varied callouts ("In dead last.....", "The runner-up.....", "And your squad champion....."), a beat, then the name and a gut reaction (LLM, or `lib/copy/reactions.ts`). `useBattleAnnouncer` queues the lines; each reveal fires on its voice cue (`REVEAL_STEP`), so the column unseals, the figure slumps / celebrates and the line appears the moment it is said. Thumbs up (the card) waits for the champion. |
| Individual cards "from Squad Battle" | `squadMemberMeta` + the claim queue in `useCardClaim` render one card per member, nested under the squad card (`parentId`). |
| Reuse ~80% of 1v1 | One lobby, one result screen, one card template, one server route; nothing is hardcoded to two. |

## 4. Leaderboard as shared context

| Spec | Implementation |
| --- | --- |
| Rivalry of the Day (alternating winners) | `findRivalry` (`lib/leaderboard/narrative.ts`): claimed duels, lead changed hands ≥ 2 times. |
| Most improved ↑ delta | `mostImproved`: latest vs previous entry per AURA ID. |
| Squad champion pinned, distinct tint | `squadChampion`; rendered as a full-width inverted (cyan) row. |
| Streaks 🔥 | `winStreaks`: consecutive wins back from the latest battle. |
| Rule-based queries, no LLM | `buildNarrative` over `recentBattles` + `entriesForHandles` (Tiger: `battle_players` table indexed by handle). |
| Reuse the list component | Special row types in `LeaderboardScreen`'s existing list. |

## 5. Shareable card social mechanics

| Spec | Implementation |
| --- | --- |
| "Think you can beat 847,203? Scan at [QR]" baked in | `beatThisLine` in the card footer next to the QR. |
| QR deep-links that exact result | Card ids are minted on the kiosk, so the QR (`/r/[id]`) is rendered into the PNG. |
| Battle / solo / squad visually distinct, same template | `ShareCardView`: one frame + footer, three content blocks. |
| Auto-generated caption | `shareCaption` (`lib/share/caption.ts`), shown with COPY CAPTION and used by the native share sheet. |
| Card = feed post | `POST /api/cards` writes the card with its feed metadata; the `cards` table is the feed. |

## 6. Companion app

| Spec | Implementation |
| --- | --- |
| Feed page | `/feed` (`components/companion/FeedScreen.tsx`, `/api/feed` with cursor paging). |
| Single result deep link with BEAT THIS SCORE button | `/r/[id]` (`ResultScreen.tsx`): the button joins the challenger queue (`/api/challenges`); the kiosk shows UP NEXT and calls the name. |
| Reactions | `/api/feed/[id]/react`, one per device per emoji (`reactions` table). |
| Lightweight identity | Name → AURA ID (NAME#CODE) cached in localStorage (`lib/companion/identity.ts`); "THIS WAS ME" claims a slot (`/api/feed/[id]/claim`). |
| No accounts / follows / DMs / comments | None built. |
| Separately deployable | Plain pages in the same Next app; deploy the repo to Vercel/Netlify and point `PUBLIC_BASE_URL` (card QRs) at it. |

## 7. Card design

1080x1350 (4:5); the kiosk's dark grid desktop with an OS-window title bar; one accent (`--aura-cyan` /
`--aura-glow`); VT323 for numbers and verdicts, Silkscreen for labels (two faces); hero number
with a radial glow behind it; film grain from a generated tile; identical footer (wordmark, CTA,
QR) on all three. Preview all three at `/card-lab`.

## Data model (Tiger Data; memory store mirrors it)

- `battles` gains `mode`, `outcome` (jsonb: players, places, gap, decidedBy, squad) and
  `commentary`; `scan_a`/`scan_b` still hold the first two players for older readers.
- `battle_players (battle_id, slot, scan_id, handle, total, place, won, created_at)`: one row per
  player per battle; rivalries and streaks read it by handle.
- `cards` gains `kind`, `headline`, `target`, `title`, `verdict`, `caption`, `parent_id`, `slot`.
- `reactions (card_id, emoji, client_id)`.

All migrations are `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`, applied on first use.
