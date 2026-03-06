export interface BloomTransitionResult {
  currentLevel: number;
  highestReached: number;
}

/**
 * Compute Bloom's taxonomy level transition after a review.
 *
 * Rules:
 * - rating >= 3 (Good/Easy) at current_level → advance to min(current+1, 5)
 * - rating >= 3 below current_level → no change (restores confidence)
 * - rating <= 2 (Again/Hard) → drop to max(review_level - 1, 0)
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
