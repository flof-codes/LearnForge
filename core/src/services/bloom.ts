export interface BloomTransitionResult {
  currentLevel: number;
  highestReached: number;
}

/**
 * Rules version 1 (kept for replaying reviews written before release 1).
 *
 * - rating >= 3 (Good/Easy) at current_level → advance to min(current+1, 5)
 * - rating >= 3 below current_level → no change (restores confidence)
 * - rating <= 2 (Again/Hard) → drop to max(current_level - 1, 0)
 * - highest_reached is updated if current exceeds it
 */
export function computeBloomTransition(
  rating: number,
  reviewLevel: number,
  currentLevel: number,
  highestReached: number,
): BloomTransitionResult {
  let newLevel = currentLevel;

  if (rating >= 3) {
    if (reviewLevel === currentLevel) {
      newLevel = Math.min(currentLevel + 1, 5);
    }
    // reviewing below current level with good rating: no change
  } else {
    // rating <= 2: drop
    newLevel = Math.max(currentLevel - 1, 0);
  }

  return {
    currentLevel: newLevel,
    highestReached: Math.max(highestReached, newLevel),
  };
}

// --- Rules version 2: graded progress inside a level ---

export const RULES_VERSION = 2;
export const DEFAULT_CHANGE_RATE = 0.8;
export const LEVEL_THRESHOLD = 0.5;
export const PASS_MARK = 0.5;
export const MIN_LEVEL = 0;
export const MAX_LEVEL = 5;

export interface LevelProgressResult extends BloomTransitionResult {
  progress: number;
  levelStep: number;
}

/**
 * Self-rated reviews (web study, legacy API path) carry no correctness score.
 * Map the FSRS rating to one so the level rule applies uniformly.
 */
export function correctnessFromRating(rating: number): number {
  switch (rating) {
    case 4: return 1.0;
    case 3: return 0.8;
    case 2: return 0.4;
    default: return 0;
  }
}

/** Tutor reviews report a 0..1 correctness; the FSRS rating is derived from it. */
export function ratingFromCorrectness(correctness: number): 1 | 2 | 3 | 4 {
  if (correctness >= 0.95) return 4;
  if (correctness >= 0.8) return 3;
  if (correctness >= 0.5) return 2;
  return 1;
}

/**
 * The step a single answer adds to the progress bar inside the level.
 * Only questions asked at the card's stored level count; the change rate
 * scales the step, so rate 0 never moves a level.
 */
export function computeLevelStep(correctness: number, changeRate: number, onLevel: boolean): number {
  if (!onLevel || changeRate <= 0) return 0;
  const c = Math.min(1, Math.max(0, correctness));
  return c >= PASS_MARK ? changeRate * c : -changeRate * (1 - c);
}

/**
 * Apply a level step. Crossing +0.5 climbs one level, −0.5 drops one; progress
 * resets to 0 on a move and cannot build up outwards at the lowest or highest level.
 */
export function applyLevelStep(
  step: number,
  currentLevel: number,
  progress: number,
  highestReached: number,
): LevelProgressResult {
  let level = currentLevel;
  let p = progress + step;

  if (p >= LEVEL_THRESHOLD) {
    if (level < MAX_LEVEL) { level += 1; p = 0; } else { p = 0; }
  } else if (p <= -LEVEL_THRESHOLD) {
    if (level > MIN_LEVEL) { level -= 1; p = 0; } else { p = 0; }
  }

  return {
    currentLevel: level,
    highestReached: Math.max(highestReached, level),
    progress: p,
    levelStep: step,
  };
}
