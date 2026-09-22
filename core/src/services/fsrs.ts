import { fsrs, createEmptyCard, generatorParameters, type Card, type Grade, State } from "ts-fsrs";
import { createHash } from "node:crypto";

const defaultFsrs = fsrs(generatorParameters());

export interface FsrsDbState {
  stability: number;
  difficulty: number;
  due: Date;
  lastReview: Date | null;
  reps: number;
  lapses: number;
  state: number;
}

export function createInitialFsrsState(): FsrsDbState {
  const card = createEmptyCard();
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due,
    lastReview: card.last_review ?? null,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
  };
}

// --- Modality multiplier (rules version 1, kept for replaying old reviews) ---

export type StudyModality = "chat" | "web" | "mcq";

const MODALITY_MULTIPLIERS: Record<StudyModality, number> = {
  chat: 1.2,
  web: 0.95,
  mcq: 1.05,
};

export function isValidModality(value: string): value is StudyModality {
  return value === "chat" || value === "web" || value === "mcq";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Interval between the last review (or now) and the due date, in days. */
export function intervalDays(fsrsResult: FsrsDbState, now?: Date): number {
  const anchor = fsrsResult.lastReview ? new Date(fsrsResult.lastReview).getTime() : (now ?? new Date()).getTime();
  return (new Date(fsrsResult.due).getTime() - anchor) / DAY_MS;
}

/** Scales the interval between lastReview and due by `multiplier`. */
export function scaleInterval(fsrsResult: FsrsDbState, multiplier: number, now?: Date): FsrsDbState {
  if (multiplier === 1.0) return fsrsResult;
  const anchor = fsrsResult.lastReview ? new Date(fsrsResult.lastReview).getTime() : (now ?? new Date()).getTime();
  const interval = new Date(fsrsResult.due).getTime() - anchor;
  if (interval <= 0) return fsrsResult;
  return { ...fsrsResult, due: new Date(anchor + Math.round(interval * multiplier)) };
}

/**
 * Adjusts the FSRS-computed due date based on study modality.
 * Scales the interval between lastReview and due by the modality multiplier.
 */
export function applyModalityMultiplier(
  fsrsResult: FsrsDbState,
  modality: StudyModality,
): FsrsDbState {
  return scaleInterval(fsrsResult, MODALITY_MULTIPLIERS[modality]);
}

// --- Interval factor (rules version 2) ---

/** Web self-rating keeps its old multiplier; the dials do not apply there. */
export const WEB_INTERVAL_FACTOR = 0.95;

/**
 * Change rate 0..1 maps onto 1.0..1.5: an unchanged question is plain FSRS,
 * a varied one earns a longer interval. Difficulty 0..1 maps onto 0.7..1.0.
 */
export function tutorIntervalFactor(changeRate: number, sessionDifficulty: number): number {
  const rate = Math.min(1, Math.max(0, changeRate));
  const diff = Math.min(1, Math.max(0, sessionDifficulty));
  return (1 + 0.5 * rate) * (0.7 + 0.3 * diff);
}

/**
 * Applies a factor to the interval. Learning steps shorter than a day are left
 * untouched so ts-fsrs's short-term schedule keeps its timing.
 */
export function applyIntervalFactor(fsrsResult: FsrsDbState, factor: number, now?: Date): FsrsDbState {
  if (intervalDays(fsrsResult, now) < 1) return fsrsResult;
  return scaleInterval(fsrsResult, factor, now);
}

/** A stable identifier for the weights a review was scheduled with. */
export function fsrsParamsVersion(userParams?: { w: number[] } | null): string {
  if (!userParams?.w) return "default";
  return createHash("sha256").update(JSON.stringify(userParams.w)).digest("hex").slice(0, 12);
}

function toCard(currentState: FsrsDbState, now: Date): Card {
  const card: Card = {
    due: new Date(currentState.due),
    stability: currentState.stability,
    difficulty: currentState.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: currentState.reps,
    lapses: currentState.lapses,
    state: currentState.state as State,
    last_review: currentState.lastReview ? new Date(currentState.lastReview) : undefined,
  };
  if (card.last_review) {
    card.elapsed_days = Math.max(0, Math.floor((now.getTime() - card.last_review.getTime()) / DAY_MS));
  }
  return card;
}

function schedulerFor(userParams?: { w: number[] } | null) {
  return userParams?.w ? fsrs(generatorParameters({ w: userParams.w })) : defaultFsrs;
}

/** Predicted recall probability before the review; 0 for a card never reviewed. */
export function retrievabilityBefore(
  currentState: FsrsDbState,
  userParams?: { w: number[] } | null,
  now?: Date,
): number {
  now = now ?? new Date();
  if (!currentState.lastReview || currentState.state === 0) return 0;
  const r = schedulerFor(userParams).get_retrievability(toCard(currentState, now), now, false);
  return typeof r === "number" ? r : 0;
}

/** Whole days since the last review, or 0 for a new card. */
export function elapsedDays(currentState: FsrsDbState, now?: Date): number {
  now = now ?? new Date();
  if (!currentState.lastReview) return 0;
  return Math.max(0, (now.getTime() - new Date(currentState.lastReview).getTime()) / DAY_MS);
}

export function processReview(
  currentState: FsrsDbState,
  rating: Grade,
  userParams?: { w: number[] } | null,
  now?: Date,
): FsrsDbState {
  now = now ?? new Date();
  const result = schedulerFor(userParams).next(toCard(currentState, now), now, rating);
  const updated = result.card;

  return {
    stability: updated.stability,
    difficulty: updated.difficulty,
    due: updated.due,
    lastReview: updated.last_review ?? null,
    reps: updated.reps,
    lapses: updated.lapses,
    state: updated.state as number,
  };
}
