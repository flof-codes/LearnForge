import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { reviews, fsrsState, bloomState, users } from "../db/schema/index.js";
import { processReview, applyModalityMultiplier, isValidModality, type FsrsDbState, type StudyModality } from "./fsrs.js";
import { computeBloomTransition } from "./bloom.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { optimizeUserParams } from "./fsrs-optimizer.js";

export interface SubmitReviewInput {
  card_id: string;
  bloom_level: number;
  rating: number;
  question_text: string;
  skip_bloom?: boolean;
  modality?: string;
  answer_expected?: string;
  user_answer?: string;
}

export async function submitReview(db: Db, userId: string, input: SubmitReviewInput) {
  const { card_id, bloom_level, rating, question_text, skip_bloom, modality: rawModality, answer_expected, user_answer } = input;

  if (!card_id) throw new ValidationError("card_id is required");
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(card_id)) throw new ValidationError("card_id must be a valid UUID");
  if (bloom_level === undefined || bloom_level < 0 || bloom_level > 5) {
    throw new ValidationError("bloom_level must be between 0 and 5");
  }
  if (!rating || rating < 1 || rating > 4) {
    throw new ValidationError("rating must be between 1 and 4");
  }
  if (!question_text) throw new ValidationError("question_text is required");

  // Verify card belongs to user
  const ownershipCheck = await db.execute<{ id: string }>(sql`
    SELECT c.id FROM cards c
    JOIN topics t ON c.topic_id = t.id
    WHERE c.id = ${card_id} AND t.user_id = ${userId}
  `);
  if (ownershipCheck.rows.length === 0) throw new NotFoundError("Card not found");

  const modality: StudyModality = (rawModality && isValidModality(rawModality))
    ? rawModality
    : "web";

  const result = await db.transaction(async (tx) => {
    // 1. Insert review record
    const [review] = await tx.insert(reviews).values({
      cardId: card_id,
      bloomLevel: bloom_level,
      rating,
      questionText: question_text,
      modality,
      answerExpected: answer_expected,
      userAnswer: user_answer,
    }).returning();

    // 2. Load user's FSRS params (if optimized)
    const [user] = await tx
      .select({ fsrsParams: users.fsrsParams })
      .from(users)
      .where(eq(users.id, userId));
    const userParams = user?.fsrsParams as { w: number[] } | null;

    // 3. Read current fsrs_state → process → update
    const [currentFsrs] = await tx
      .select()
      .from(fsrsState)
      .where(eq(fsrsState.cardId, card_id));

    if (!currentFsrs) throw new NotFoundError("Card not found");

    const rawFsrs = processReview(
      {
        stability: currentFsrs.stability,
        difficulty: currentFsrs.difficulty,
        due: currentFsrs.due,
        lastReview: currentFsrs.lastReview,
        reps: currentFsrs.reps,
        lapses: currentFsrs.lapses,
        state: currentFsrs.state,
      } as FsrsDbState,
      rating as 1 | 2 | 3 | 4,
      userParams,
    );

    const updatedFsrs = applyModalityMultiplier(rawFsrs, modality);

    const [savedFsrs] = await tx
      .update(fsrsState)
      .set({
        stability: updatedFsrs.stability,
        difficulty: updatedFsrs.difficulty,
        due: updatedFsrs.due,
        lastReview: updatedFsrs.lastReview,
        reps: updatedFsrs.reps,
        lapses: updatedFsrs.lapses,
        state: updatedFsrs.state,
      })
      .where(eq(fsrsState.cardId, card_id))
      .returning();

    // 4. Read current bloom_state → compute transition → update (skip for manual reviews)
    const [currentBloom] = await tx
      .select()
      .from(bloomState)
      .where(eq(bloomState.cardId, card_id));

    if (!currentBloom) throw new NotFoundError("Card not found");

    if (skip_bloom) {
      return { review, fsrsState: savedFsrs, bloomState: currentBloom };
    }

    const updatedBloom = computeBloomTransition(
      rating,
      bloom_level,
      currentBloom.currentLevel,
      currentBloom.highestReached,
    );

    const [savedBloom] = await tx
      .update(bloomState)
      .set({
        currentLevel: updatedBloom.currentLevel,
        highestReached: updatedBloom.highestReached,
      })
      .where(eq(bloomState.cardId, card_id))
      .returning();

    return { review, fsrsState: savedFsrs, bloomState: savedBloom };
  });

  // After successful transaction: increment optimization counter and check trigger
  const [updated] = await db
    .update(users)
    .set({ reviewsSinceOptimization: sql`${users.reviewsSinceOptimization} + 1` })
    .where(eq(users.id, userId))
    .returning({ counter: users.reviewsSinceOptimization });

  if (updated && updated.counter >= 100) {
    // Check total review count to avoid optimizing on too little data
    const totalResult = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count FROM reviews r
      JOIN cards c ON c.id = r.card_id
      JOIN topics t ON c.topic_id = t.id
      WHERE t.user_id = ${userId}
    `);
    const totalReviews = parseInt(totalResult.rows[0]?.count ?? "0", 10);
    if (totalReviews >= 500) {
      // Fire-and-forget — don't block the review response
      optimizeUserParams(db, userId).catch(() => {});
    }
  }

  return result;
}
