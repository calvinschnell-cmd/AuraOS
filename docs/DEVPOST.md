# AURA OS: Aura Battles (Devpost draft)

## Tagline

A social outfit-battling platform: step up to the mirror, strike a pose, and battle your friends
on fit and pose, judged live by AI.

## Inspiration

Every hackathon has a moment where someone walks in wearing something and the whole room reacts.
We wanted to make that moment into a game you play with other people, not a filter you use alone.

## What it does

**AURA OS** is a platform built around a smart mirror. Its headline mode, **Aura Battles**, is a
1v1: Player 1 steps up and throws up double peace signs, strikes a pose, and locks in; Player 2
does the same; a VS screen slams in, and two mannequins walk out wearing the outfits the AI
detected on each player. Each player gets a **Fit score** (an AI judge rating the outfit) and a
**Pose score** (a classifier we trained on body landmarks), and the combined total decides the
battle. Close fits get decided by who actually committed to the pose. An AI announcer streams a
head-to-head roast ("Player 2's fit was stronger, but that pose sealed it") and reads it out loud.

**Squad mode** takes the same lobby up to five players: a group Aura score (with a "squad synergy"
stat that rewards cohesive-but-different fits), a vibe archetype ("chaotic streetwear energy") and
one line of commentary per person. **Solo Scan** is the quick single-player warm-up.

Everything is shareable: a thumbs up renders a card (face blurred, photo never stored) with
"THINK YOU CAN BEAT 847,203?" and a QR that lands a friend on that exact battle. From their phone
they can react, copy a ready-made caption, claim "this was me" with a lightweight name, or tap
**BEAT THIS SCORE**, which puts them in the mirror's challenger queue; the kiosk shows them as
UP NEXT and calls them up by name. The leaderboard tells the day's story: Rivalry of the Day
(two players who keep trading wins), the Squad Champion, win streaks and most-improved.

## How we built it

- **Kiosk**: Next.js + TypeScript, a pure state machine for the lobby / VS / result flow,
  MediaPipe (gestures, pose landmarks, segmentation) in the browser, Three.js mannequins built
  from primitives with a procedural wardrobe that dresses each figure in the detected outfit.
- **Fit judging**: a local segformer garment segmenter (CUDA sidecar) feeds GPT-4o-mini structured
  outputs; solo scans add Gemini as a second, independent judge. Battles use a single fast judge
  per capture, scored the instant each player captures, so the wait hides under the VS animation.
- **Pose judging (trained)**: we collected 1,380 freely licensed photos from Wikimedia Commons by
  searching six archetype categories (runway, superhero, anime/cosplay action, martial arts, dance,
  plain standing; a second pass added ballet, cheer, K-pop, women's cosplay and fashion searches
  the first set was thin on), ran MediaPipe over all of them, filtered automatically (no person,
  crowds, unconfident joints), and trained a small MLP on normalized joint-angle features with the
  search category as a weak label (500 photos survived the filters; 5-fold cross-validated
  accuracy 46%, about 3x chance). It scores a pose in well under a millisecond on the server: no model call at
  battle time.
- **Commentary**: one text-only, token-capped, streamed completion built from every player's score
  sheet.
- **Data**: Tiger Data (TimescaleDB) for scans, battles (one row per player for rivalries and
  streaks), cards (which double as the public feed), reactions, and live time-series charts.
- **Mock mode**: the whole experience runs with zero API keys, including synthetic poses, so it can
  be demoed and tested anywhere.

## Challenges we ran into

- Latency: a battle is N vision calls plus commentary. We pipelined scoring per capture, cut
  battles to a single judge, capped and streamed the commentary, and pre-warm the connection.
- Weak labels: search results are noisy (a "superhero cosplay" photo is often someone standing
  still). Cross-validated accuracy is about 3x chance on six classes, so the pose score blends the
  classifier with simple dynamism signals (arms up, reach, stance, asymmetry, lean, knee bend).
- Making a shared physical screen social: anything slow or personal moved to the phone.

## What's next

Recording pose samples from the event camera (`/pose-lab`) to fine-tune the classifier on real
kiosk data, and a spectator mode on the leaderboard display.
