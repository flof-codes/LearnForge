import { eq, sql, asc } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { reviews, fsrsState, bloomState, users } from "../db/schema/index.js";
import { processReview, applyModalityMultiplier, createInitialFsrsState, isValidModality, type FsrsDbState, type StudyModality } from "./fsrs.js";
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

  const modality: StudyModality = (rawModality && isValidModality(rawModality))
    ? rawModality
    : "web";

  const result = await db.transaction(async (tx) => {
    // 1. Single query: verify ownership + load user params + FSRS state + Bloom state
    const stateRows = await tx.execute<{
      fsrs_params: unknown;
      stability: number;
      difficulty: number;
      due: Date;
      last_review: Date | null;
      reps: number;
      lapses: number;
      state: number;
      current_level: number;
      highest_reached: number;
    }>(sql`
      SELECT
        u.fsrs_params,
        fs.stability, fs.difficulty, fs.due, fs.last_review, fs.reps, fs.lapses, fs.state,
        bs.current_level, bs.highest_reached
      FROM cards c
      JOIN topics t ON c.topic_id = t.id
      JOIN users u ON u.id = t.user_id
      JOIN fsrs_state fs ON fs.card_id = c.id
      JOIN bloom_state bs ON bs.card_id = c.id
      WHERE c.id = ${card_id} AND t.user_id = ${userId}
    `);
    if (stateRows.rows.length === 0) throw new NotFoundError("Card not found");
    const s = stateRows.rows[0];

    // 2. Compute FSRS + Bloom transitions (in-memory, no DB)
    const userParams = s.fsrs_params as { w: number[] } | null;
    const rawFsrs = processReview(
      {
        stability: s.stability,
        difficulty: s.difficulty,
        due: s.due,
        lastReview: s.last_review,
        reps: s.reps,
        lapses: s.lapses,
        state: s.state,
      } as FsrsDbState,
      rating as 1 | 2 | 3 | 4,
      userParams,
    );
    const updatedFsrs = applyModalityMultiplier(rawFsrs, modality);

    const updatedBloom = skip_bloom
      ? null
      : computeBloomTransition(rating, bloom_level, s.current_level, s.highest_reached);

    // 3. Single CTE: INSERT review + UPDATE fsrs_state + UPDATE bloom_state
    if (updatedBloom) {
      const cteRows = await tx.execute<{
        r_id: string; r_card_id: string; r_bloom_level: number; r_rating: number;
        r_question_text: string; r_modality: string; r_answer_expected: string | null;
        r_user_answer: string | null; r_reviewed_at: Date;
        fs_stability: number; fs_difficulty: number; fs_due: Date;
        fs_last_review: Date | null; fs_reps: number; fs_lapses: number; fs_state: number;
        bs_current_level: number; bs_highest_reached: number;
      }>(sql`
        WITH ins_review AS (
          INSERT INTO reviews (card_id, bloom_level, rating, question_text, modality, answer_expected, user_answer)
          VALUES (${card_id}, ${bloom_level}, ${rating}, ${question_text}, ${modality}, ${answer_expected ?? null}, ${user_answer ?? null})
          RETURNING *
        ), upd_fsrs AS (
          UPDATE fsrs_state SET
            stability = ${updatedFsrs.stability},
            difficulty = ${updatedFsrs.difficulty},
            due = ${updatedFsrs.due},
            last_review = ${updatedFsrs.lastReview},
            reps = ${updatedFsrs.reps},
            lapses = ${updatedFsrs.lapses},
            state = ${updatedFsrs.state}
          WHERE card_id = ${card_id}
          RETURNING *
        ), upd_bloom AS (
          UPDATE bloom_state SET
            current_level = ${updatedBloom.currentLevel},
            highest_reached = ${updatedBloom.highestReached},
            updated_at = NOW()
          WHERE card_id = ${card_id}
          RETURNING *
        )
        SELECT
          ins_review.id AS r_id, ins_review.card_id AS r_card_id,
          ins_review.bloom_level AS r_bloom_level, ins_review.rating AS r_rating,
          ins_review.question_text AS r_question_text, ins_review.modality AS r_modality,
          ins_review.answer_expected AS r_answer_expected, ins_review.user_answer AS r_user_answer,
          ins_review.reviewed_at AS r_reviewed_at,
          upd_fsrs.stability AS fs_stability, upd_fsrs.difficulty AS fs_difficulty,
          upd_fsrs.due AS fs_due, upd_fsrs.last_review AS fs_last_review,
          upd_fsrs.reps AS fs_reps, upd_fsrs.lapses AS fs_lapses, upd_fsrs.state AS fs_state,
          upd_bloom.current_level AS bs_current_level, upd_bloom.highest_reached AS bs_highest_reached
        FROM ins_review, upd_fsrs, upd_bloom
      `);
      const row = cteRows.rows[0];
      return {
        review: {
          id: row.r_id, cardId: row.r_card_id, bloomLevel: row.r_bloom_level,
          rating: row.r_rating, questionText: row.r_question_text, modality: row.r_modality,
          answerExpected: row.r_answer_expected, userAnswer: row.r_user_answer,
          reviewedAt: row.r_reviewed_at,
        },
        fsrsState: {
          cardId: card_id, stability: row.fs_stability, difficulty: row.fs_difficulty,
          due: row.fs_due, lastReview: row.fs_last_review, reps: row.fs_reps,
          lapses: row.fs_lapses, state: row.fs_state,
        },
        bloomState: {
          cardId: card_id, currentLevel: row.bs_current_level,
          highestReached: row.bs_highest_reached,
        },
      };
    }

    // skip_bloom path: INSERT review + UPDATE fsrs only
    const cteRows = await tx.execute<{
      r_id: string; r_card_id: string; r_bloom_level: number; r_rating: number;
      r_question_text: string; r_modality: string; r_answer_expected: string | null;
      r_user_answer: string | null; r_reviewed_at: Date;
      fs_stability: number; fs_difficulty: number; fs_due: Date;
      fs_last_review: Date | null; fs_reps: number; fs_lapses: number; fs_state: number;
    }>(sql`
      WITH ins_review AS (
        INSERT INTO reviews (card_id, bloom_level, rating, question_text, modality, answer_expected, user_answer)
        VALUES (${card_id}, ${bloom_level}, ${rating}, ${question_text}, ${modality}, ${answer_expected ?? null}, ${user_answer ?? null})
        RETURNING *
      ), upd_fsrs AS (
        UPDATE fsrs_state SET
          stability = ${updatedFsrs.stability},
          difficulty = ${updatedFsrs.difficulty},
          due = ${updatedFsrs.due},
          last_review = ${updatedFsrs.lastReview},
          reps = ${updatedFsrs.reps},
          lapses = ${updatedFsrs.lapses},
          state = ${updatedFsrs.state}
        WHERE card_id = ${card_id}
        RETURNING *
      )
      SELECT
        ins_review.id AS r_id, ins_review.card_id AS r_card_id,
        ins_review.bloom_level AS r_bloom_level, ins_review.rating AS r_rating,
        ins_review.question_text AS r_question_text, ins_review.modality AS r_modality,
        ins_review.answer_expected AS r_answer_expected, ins_review.user_answer AS r_user_answer,
        ins_review.reviewed_at AS r_reviewed_at,
        upd_fsrs.stability AS fs_stability, upd_fsrs.difficulty AS fs_difficulty,
        upd_fsrs.due AS fs_due, upd_fsrs.last_review AS fs_last_review,
        upd_fsrs.reps AS fs_reps, upd_fsrs.lapses AS fs_lapses, upd_fsrs.state AS fs_state
      FROM ins_review, upd_fsrs
    `);
    const row = cteRows.rows[0];
    return {
      review: {
        id: row.r_id, cardId: row.r_card_id, bloomLevel: row.r_bloom_level,
        rating: row.r_rating, questionText: row.r_question_text, modality: row.r_modality,
        answerExpected: row.r_answer_expected, userAnswer: row.r_user_answer,
        reviewedAt: row.r_reviewed_at,
      },
      fsrsState: {
        cardId: card_id, stability: row.fs_stability, difficulty: row.fs_difficulty,
        due: row.fs_due, lastReview: row.fs_last_review, reps: row.fs_reps,
        lapses: row.fs_lapses, state: row.fs_state,
      },
      bloomState: {
        cardId: card_id, currentLevel: s.current_level,
        highestReached: s.highest_reached,
      },
    };
  });

  // Optimization trigger: increment counter, check if re-optimization needed.
  // Wrapped in try/catch so failures never affect the review response.
  try {
    const [updated] = await db
      .update(users)
      .set({ reviewsSinceOptimization: sql`${users.reviewsSinceOptimization} + 1` })
      .where(eq(users.id, userId))
      .returning({ counter: users.reviewsSinceOptimization });

    if (updated && updated.counter >= 100) {
      const totalResult = await db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM reviews r
        JOIN cards c ON c.id = r.card_id
        JOIN topics t ON c.topic_id = t.id
        WHERE t.user_id = ${userId}
      `);
      const totalReviews = parseInt(totalResult.rows[0]?.count ?? "0", 10);
      if (totalReviews >= 500) {
        optimizeUserParams(db, userId).catch(() => {});
      }
    }
  } catch (err) {
    console.error("FSRS optimization trigger failed:", err);
  }

  return result;
}

export interface DeleteReviewOptions {
  restrictToRecent?: boolean;
}

export async function deleteReview(
  db: Db,
  userId: string,
  reviewId: string,
  opts?: DeleteReviewOptions,
) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!reviewId || !UUID_RE.test(reviewId)) {
    throw new ValidationError("review_id must be a valid UUID");
  }

  // Fetch review + verify ownership via card → topic → user
  const rows = await db.execute<{
    id: string;
    card_id: string;
    bloom_level: number;
    rating: number;
    modality: string;
    reviewed_at: string;
  }>(sql`
    SELECT r.id, r.card_id, r.bloom_level, r.rating, r.modality, r.reviewed_at
    FROM reviews r
    JOIN cards c ON c.id = r.card_id
    JOIN topics t ON c.topic_id = t.id
    WHERE r.id = ${reviewId} AND t.user_id = ${userId}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Review not found");

  const review = rows.rows[0];

  // Time guard: only today/yesterday if restricted
  if (opts?.restrictToRecent) {
    const reviewedAt = new Date(review.reviewed_at);
    const startOfYesterday = new Date();
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);

    if (reviewedAt < startOfYesterday) {
      throw new ValidationError("Only reviews from today or yesterday can be deleted");
    }
  }

  const cardId = review.card_id;

  const result = await db.transaction(async (tx) => {
    // Delete the target review
    await tx.delete(reviews).where(eq(reviews.id, reviewId));

    // Fetch remaining reviews for replay, ordered chronologically
    const remainingReviews = await tx
      .select({
        rating: reviews.rating,
        bloomLevel: reviews.bloomLevel,
        modality: reviews.modality,
        reviewedAt: reviews.reviewedAt,
      })
      .from(reviews)
      .where(eq(reviews.cardId, cardId))
      .orderBy(asc(reviews.reviewedAt));

    // Load user FSRS params
    const [user] = await tx
      .select({ fsrsParams: users.fsrsParams })
      .from(users)
      .where(eq(users.id, userId));
    const userParams = user?.fsrsParams as { w: number[] } | null;

    // Replay from initial state
    let currentFsrs: FsrsDbState = createInitialFsrsState();
    let currentBloom = { currentLevel: 0, highestReached: 0 };

    for (const r of remainingReviews) {
      const modality: StudyModality = isValidModality(r.modality) ? r.modality : "web";
      const rawFsrs = processReview(
        currentFsrs,
        r.rating as 1 | 2 | 3 | 4,
        userParams,
        r.reviewedAt,
      );
      currentFsrs = applyModalityMultiplier(rawFsrs, modality);
      currentBloom = computeBloomTransition(
        r.rating,
        r.bloomLevel,
        currentBloom.currentLevel,
        currentBloom.highestReached,
      );
    }

    // Write final states
    const [savedFsrs] = await tx
      .update(fsrsState)
      .set({
        stability: currentFsrs.stability,
        difficulty: currentFsrs.difficulty,
        due: currentFsrs.due,
        lastReview: currentFsrs.lastReview,
        reps: currentFsrs.reps,
        lapses: currentFsrs.lapses,
        state: currentFsrs.state,
      })
      .where(eq(fsrsState.cardId, cardId))
      .returning();

    const [savedBloom] = await tx
      .update(bloomState)
      .set({
        currentLevel: currentBloom.currentLevel,
        highestReached: currentBloom.highestReached,
      })
      .where(eq(bloomState.cardId, cardId))
      .returning();

    return {
      deletedReviewId: reviewId,
      cardId,
      remainingReviews: remainingReviews.length,
      fsrsState: savedFsrs,
      bloomState: savedBloom,
    };
  });

  return result;
}
