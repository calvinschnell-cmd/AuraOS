import { predictArchetype, type PoseModel } from "./classifier";
import { dynamismSignals, photoPose, powerPose, type DynamismSignals, type PhotoPoseKind } from "./features";
import type { PoseSnapshot } from "./landmarks";

/**
 * The Pose sub-score (0-100): how confident / dynamic the pose is,
 * independent of the outfit. Deterministic and free at battle time: the
 * trained archetype classifier plus the dynamism signals, no LLM call.
 */

/** label: screens; callout: in a sentence ("hit a runway strut"); noun: after "that" ("that runway strut"). */
export const ARCHETYPES = {
  runway: { label: "RUNWAY STRUT", callout: "a runway strut", noun: "runway strut" },
  hero: { label: "HERO STANCE", callout: "a superhero stance", noun: "superhero stance" },
  action: { label: "ANIME PROTAGONIST", callout: "an anime protagonist pose", noun: "anime protagonist pose" },
  fighter: { label: "FIGHTING GAME SELECT", callout: "a fighting-game character-select pose", noun: "character-select pose" },
  dance: { label: "DANCE BREAK", callout: "a mid-dance-break pose", noun: "dance break" },
  // Everyday photo poses: walking and looking off to the side, hands together, a peace sign.
  aesthetic: { label: "MAIN CHARACTER", callout: "a main-character photo moment", noun: "main-character moment" },
  standing: { label: "NPC IDLE", callout: "an NPC idle animation", noun: "NPC idle animation" },
} as const;
export type ArchetypeId = keyof typeof ARCHETYPES;

/** Archetypes read from the geometry (lib/pose/features.ts), not classifier classes. */
export const RULE_ARCHETYPES = ["aesthetic"] as const;

/** What the mirror calls each everyday photo pose. */
const PHOTO_POSE_STANDOUT: Record<PhotoPoseKind, string> = {
  peace: "HAND UP FOR THE PIC",
  hands_together: "HANDS TOGETHER",
  look_away: "LOOKING OFF CAMERA",
};
/** photoPose strength that counts. */
export const PHOTO_POSE_MIN = 0.5;

/** The low-energy baseline class: a stiff standing photo. */
export const STIFF_ARCHETYPE: ArchetypeId = "standing";

export interface PoseResult {
  /** 0-100. */
  score: number;
  archetype: ArchetypeId | "unknown";
  label: string;
  /** Classifier confidence in that archetype, 0-100 ("87% MATCH"). */
  match: number;
  signals: DynamismSignals | null;
  /** The loudest thing the body is doing, for commentary ("WIDE STANCE"). */
  standout: string | null;
  /** live: camera landmarks; mock: a synthetic pose (MOCK MODE / no camera); none: no pose seen. */
  source: "live" | "mock" | "none";
}

/** Aura added per pose point above POSE_NEUTRAL (and taken below it). */
export const POSE_AURA_PER_POINT = 2500;
/** A pose score that neither adds nor costs aura. */
export const POSE_NEUTRAL = 40;
/** Score when no pose was captured: neutral, so nobody is punished for a detector miss. */
export const NO_POSE_SCORE = POSE_NEUTRAL;

const SIGNAL_LABELS: Record<keyof DynamismSignals, string> = {
  armRaise: "ARMS UP",
  armSpread: "FULL REACH",
  stance: "WIDE STANCE",
  asymmetry: "ASYMMETRIC DRAMA",
  lean: "COMMITTED LEAN",
  kneeBend: "DEEP LUNGE",
};

/** Weighted mean of the dynamism signals, 0-1. */
export function dynamism(s: DynamismSignals): number {
  return 0.22 * s.armRaise + 0.2 * s.armSpread + 0.18 * s.stance + 0.16 * s.asymmetry + 0.1 * s.lean + 0.14 * s.kneeBend;
}

function isArchetype(id: string): id is ArchetypeId {
  return id in ARCHETYPES;
}

/** powerPose strength that counts as the superhero stance. */
export const POWER_POSE_MIN = 0.5;

export function scorePose(model: PoseModel, snapshot: PoseSnapshot | null, source: "live" | "mock" = "live"): PoseResult {
  if (!snapshot) {
    return { score: NO_POSE_SCORE, archetype: "unknown", label: "POSE NOT DETECTED", match: 0, signals: null, standout: null, source: "none" };
  }
  const signals = dynamismSignals(snapshot);
  const prediction = predictArchetype(model, snapshot);
  const stiff = prediction.probabilities[STIFF_ARCHETYPE] ?? 0;
  const d = dynamism(signals);
  // Energy: a dynamic body counts most; the classifier saying "not a stiff
  // standing photo" counts too; a confident named archetype is a small bonus.
  const named = prediction.archetype !== STIFF_ARCHETYPE ? prediction.confidence : 0;
  const raw = 0.12 + 0.5 * d + 0.3 * (1 - stiff) + 0.12 * named;
  const loudest = (Object.keys(signals) as (keyof DynamismSignals)[]).sort((a, b) => signals[b] - signals[a])[0];
  const predicted = isArchetype(prediction.archetype) ? prediction.archetype : "unknown";
  // Fists on hips, elbows out: a hero stance even though nothing moves (see powerPose).
  const power = powerPose(snapshot);
  const isPower = power >= POWER_POSE_MIN;
  // Everyday photo poses (peace by the face, hands together, looking away): a solid,
  // not huge, pose score, used when it beats what the body energy alone earned.
  const photo = isPower ? null : photoPose(snapshot);
  const photoScore = photo && photo.strength >= PHOTO_POSE_MIN ? 0.52 + 0.18 * photo.strength : 0;
  const isPhoto = photo !== null && photoScore > raw;
  const archetype = isPower ? "hero" : isPhoto ? "aesthetic" : predicted;
  const score = Math.round(Math.max(0, Math.min(1, isPower ? Math.max(raw, 0.6 + 0.2 * power) : isPhoto ? photoScore : raw)) * 100);
  return {
    score,
    archetype,
    label: archetype === "unknown" ? prediction.archetype.toUpperCase() : ARCHETYPES[archetype].label,
    match: isPower
      ? Math.max(Math.round(power * 100), predicted === "hero" ? Math.round(prediction.confidence * 100) : 0)
      : isPhoto
        ? Math.round(photo.strength * 100)
        : Math.round(prediction.confidence * 100),
    signals,
    standout: isPower ? "SUPERHERO POWER POSE" : isPhoto ? PHOTO_POSE_STANDOUT[photo.kind] : signals[loudest] >= 0.35 ? SIGNAL_LABELS[loudest] : null,
    source,
  };
}

/** Aura the pose adds to (or takes from) the fit score. */
export function poseAura(score: number): number {
  return Math.round((score - POSE_NEUTRAL) * POSE_AURA_PER_POINT);
}

/** One line for prompts and commentary: "HERO STANCE (87% MATCH), POSE 81/100, WIDE STANCE". */
export function describePose(p: PoseResult): string {
  if (p.archetype === "unknown") return `pose not detected (neutral ${p.score}/100)`;
  const parts = [`${ARCHETYPES[p.archetype].callout} (${p.match}% match)`, `pose ${p.score}/100`];
  if (p.standout) parts.push(p.standout.toLowerCase());
  return parts.join(", ");
}
