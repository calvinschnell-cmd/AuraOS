# Kiosk music (local only)

The mirror plays two files from this folder if they exist. They are
third-party tracks, so they are **gitignored**: they never go to GitHub or the
public server (the deploy ships the git tree), and a server without them just
stays silent.

| File | Used for |
| --- | --- |
| `kiosk-bg.flac` | Quiet background loop on `/kiosk`, looping 0:00 → 1:22 |
| `result-jingle.flac` | Short sting when a result lands (solo aura reveal, battle result) |

Behavior lives in `lib/kiosk/music.ts`: the loop fades out under every voice
line, during the scan hum and during the jingle; the voice queue waits for the
jingle (`Announcer.interlude`). `+` / `-` on the kiosk change the master
volume. Check the loop point and ducking at `/music-lab`.
