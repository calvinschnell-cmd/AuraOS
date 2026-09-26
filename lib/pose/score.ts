import { predictArchetype, type PoseModel } from "./classifier";
import { dynamismSignals, type DynamismSignals } from "./features";
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
  standing: { label: "NPC IDLE", callout: "an NPC idle animation", noun: "NPC idle animation" },
} as const;
export type ArchetypeId = keyof typeof ARCHETYPES;

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
  const score = Math.round(Math.max(0, Math.min(1, raw)) * 100);
  const loudest = (Object.keys(signals) as (keyof DynamismSignals)[]).sort((a, b) => signals[b] - signals[a])[0];
  const archetype = isArchetype(prediction.archetype) ? prediction.archetype : "unknown";
  return {
    score,
    archetype,
    label: archetype === "unknown" ? prediction.archetype.toUpperCase() : ARCHETYPES[archetype].label,
    match: Math.round(prediction.confidence * 100),
    signals,
    standout: signals[loudest] >= 0.35 ? SIGNAL_LABELS[loudest] : null,
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
