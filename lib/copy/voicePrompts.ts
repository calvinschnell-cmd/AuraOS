/**
 * SPOKEN PROMPTS — EDIT ME.
 * What the voice (ElevenLabs, browser voice as fallback) tells people to do at
 * each step. A random variant is picked each time (never the same one twice
 * in a row) so it sounds like a person, not a recording. Same voice as the
 * verdicts: casual, light on slang.
 */
export const VOICE_PROMPTS = {
  /** Someone walks up while the mirror is idle. */
  personSeen: ["Yo, wassup! Give me a wave.", "Ayy, what's good? Wave at the mirror.", "Yo! Wave at me if you think your fit got aura."],
  /** After the greeting: time to scan. */
  ready: [
    "Aight, show me some deuces.",
    "Throw up the double peace and I'll scan your aura.",
    "Deuces up, both hands. Let's see what you got.",
    "Hit me with the double peace when you're ready.",
  ],
  /** Double peace held: the countdown starts. */
  strikePose: ["Hands down. Strike a pose.", "Aight, hands down and hit your best pose.", "Drop the hands. Pose for me."],
  /** After the verdict. */
  resultActions: [
    "Thumbs up to get on the board, thumbs down if you want it worse, palm to dip.",
    "Thumbs up to lock it in. Thumbs down for another roast. Palm when you're done.",
    "Want it on the leaderboard? Thumbs up. Want me to go harder? Thumbs down.",
  ],
  nameEntry: ["Type your name in, let's make it official.", "Put your name on it for the leaderboard."],
  claim: ["Scan that QR to grab your card.", "Your card's ready. Scan the QR."],
  battleStart: ["Aura battle! Both of y'all, strike a pose.", "It's a battle. Both of you, pose up."],
  /** Aura Battles lobby opened (1v1). */
  battleLobby: ["Aura battle! Player one, step up and throw the deuces.", "One versus one. Player one, you're up. Double peace when you're ready."],
  /** Squad lobby opened. */
  squadLobby: ["Squad battle! Up to five of you. Player one, step up.", "Bring the whole crew. Player one, double peace to lock in."],
  /** A player locked in and the next slot is open. */
  nextPlayer: ["Locked in. Next challenger, step up.", "Got 'em. Who's next? Double peace.", "Next up. Show me the deuces."],
  /** Squad has 2+ players: they can start any time. */
  squadReady: ["Anybody else? Thumbs up when the squad's all in.", "Next one step up, or thumbs up to start the battle."],
  /** Lobby countdown: the pose is scored, so commit. */
  battlePose: ["Strike your best pose. It counts.", "Pose for real, it's scored. Three, two, one.", "Big pose. The judges are watching."],
  /** VS intro. */
  battleIntro: ["Lobby locked. Let's see who's got the aura.", "Judges are tallying. This is gonna be close."],
  battleResultActions: ["Thumbs up to save the battle card.", "Thumbs up if you want the battle card."],
  stepBack: ["Back up a little, I gotta see the whole fit.", "Step back, bro. Head to shoes."],
  comeCloser: ["Come a little closer.", "Get a little closer, I can't see the drip from here."],
  battleWaiting: ["Your opponent gotta put their fists up too.", "Both of y'all gotta be in on it. Fists up."],
} as const satisfies Record<string, readonly string[]>;

export type VoicePrompt = keyof typeof VOICE_PROMPTS;
