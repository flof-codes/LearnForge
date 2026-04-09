import { fsrs, createEmptyCard, generatorParameters, type Card, type Grade, State } from "ts-fsrs";

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

// --- Modality multiplier ---

export type StudyModality = "chat" | "web" | "mcq";

const MODALITY_MULTIPLIERS: Record<StudyModality, number> = {
  chat: 1.2,
  web: 0.95,
  mcq: 1.05,
};

export function isValidModality(value: string): value is StudyModality {
  return value === "chat" || value === "web" || value === "mcq";
}

/**
 * Adjusts the FSRS-computed due date based on study modality.
 * Scales the interval between lastReview and due by the modality multiplier.
 */
export function applyModalityMultiplier(
  fsrsResult: FsrsDbState,
  modality: StudyModality,
): FsrsDbState {
  const multiplier = MODALITY_MULTIPLIERS[modality];
  if (multiplier === 1.0) return fsrsResult;

  const anchor = fsrsResult.lastReview
    ? new Date(fsrsResult.lastReview).getTime()
    : Date.now();
  const dueTime = new Date(fsrsResult.due).getTime();
  const interval = dueTime - anchor;

  if (interval <= 0) return fsrsResult;

  return { ...fsrsResult, due: new Date(anchor + Math.round(interval * multiplier)) };
}

export function processReview(
  currentState: FsrsDbState,
  rating: Grade,
  userParams?: { w: number[] } | null,
  now?: Date,
): FsrsDbState {
  now = now ?? new Date();

  const f = userParams?.w
    ? fsrs(generatorParameters({ w: userParams.w }))
    : defaultFsrs;

  // Reconstruct ts-fsrs Card from our persisted state
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

  // Recalculate elapsed_days
  if (card.last_review) {
    card.elapsed_days = Math.max(0, Math.floor((now.getTime() - card.last_review.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const result = f.next(card, now, rating);
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
