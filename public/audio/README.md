# Kiosk audio (local only)

Everything the mirror plays from this folder is **in git** (so a fresh laptop clone has it) but
marked `export-ignore` (`.gitattributes`): the deploy (`git archive`) never ships it to the public server, and a server
without it just stays quiet or synthesizes.

| File | Used for |
| --- | --- |
| `kiosk-bg.flac` | Quiet background loop on `/kiosk` (third-party track) |
| `result-jingle.flac` | Short sting when a result lands (third-party track) |
| `loop.json` | Where the background track loops, saved from `/music-lab` (default 0:00 → 1:22) |
| `reactions/*.mp3` | Crowd reactions (woo, cheer, crickets, aww, flop), generated once by `/api/sfx/[name]` with ElevenLabs |

Behavior: `lib/kiosk/music.ts` (loop + jingle, ducking under the voice),
`lib/kiosk/reactions.ts` (crowd reactions, synthesized when a clip is
missing). `+` / `-` on the kiosk change the master volume. Check and tune it
all at `/music-lab`.
