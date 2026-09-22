import { eq, sql, asc } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { reviews, fsrsState, bloomState, users } from "../db/schema/index.js";
import {
  processReview, applyModalityMultiplier, applyIntervalFactor, tutorIntervalFactor, WEB_INTERVAL_FACTOR,
  createInitialFsrsState, isValidModality, intervalDays, elapsedDays, retrievabilityBefore, fsrsParamsVersion,
  type FsrsDbState, type StudyModality,
} from "./fsrs.js";
import {
  computeBloomTransition, computeLevelStep, applyLevelStep, correctnessFromRating, ratingFromCorrectness,
  RULES_VERSION,
} from "./bloom.js";
import { loadTopicRates, resolveCardRate, type EffectiveRate } from "./change-rate.js";
import { validateDifficulty, SESSION_EXPIRY_HOURS } from "./session-service.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuestionStyle = "open" | "single" | "multiple" | "self";

export interface SubmitReviewInput {
  /** Ticket from get_study_cards (tutor sessions). Optional for web self-rating and legacy callers. */
  question_id?: string;
  card_id?: string;
  /** The level the question was written for. `target_level` and `bloom_level` are aliases. */
  target_level?: number;
  bloom_level?: number;
  /** FSRS rating 1..4. Required when no correctness is given (self-rating). */
  rating?: number;
  /** 0..1 as judged by the tutor for open questions. */
  correctness?: number;
  style?: QuestionStyle;
  /** Choice questions: the correct ids and the ids the learner picked; the server grades. The options as shown belong in question_text. */
  correct_option_ids?: string[];
  selected_option_ids?: string[];
  question_text: string;
  skip_bloom?: boolean;
  modality?: string;
  session_difficulty?: number;
  answer_expected?: string;
  user_answer?: string;
}

interface CardStateRow extends Record<string, unknown> {
  card_id: string;
  fsrs_params: unknown;
  stability: number; difficulty: number; due: Date; last_review: Date | null;
  reps: number; lapses: number; state: number;
  current_level: number; highest_reached: number; progress: number;
  card_change_rate: number | null; topic_id: string;
  // ticket columns (null without a ticket)
  q_id: string | null; q_card_level: number | null; q_change_rate: number | null; q_rate_source: string | null;
  q_last_review_at_serve: Date | null; q_stale: boolean | null; q_expired: boolean | null;
  s_id: string | null; s_difficulty: number | null;
  existing_review_id: string | null;
}

/** Scores a choice answer: single = hit or miss, multiple = hits minus wrong picks over the correct count. */
export function gradeChoice(style: "single" | "multiple", correct: string[], selected: string[]): number {
  const correctSet = new Set(correct);
  const selectedSet = new Set(selected);
  if (correctSet.size === 0) throw new ValidationError("correct_option_ids must not be empty");
  if (style === "single") {
    return selectedSet.size === 1 && correctSet.has([...selectedSet][0]) ? 1 : 0;
  }
  let hits = 0, wrong = 0;
  for (const id of selectedSet) { if (correctSet.has(id)) hits++; else wrong++; }
  return Math.max(0, (hits - wrong) / correctSet.size);
}

export async function submitReview(db: Db, userId: string, input: SubmitReviewInput) {
  const {
    question_id, card_id, rating: rawRating, correctness: rawCorrectness, question_text,
    skip_bloom, modality: rawModality, answer_expected, user_answer,
  } = input;
  const targetLevel = input.target_level ?? input.bloom_level;

  if (!question_text) throw new ValidationError("question_text is required");
  if (question_id !== undefined && !UUID_RE.test(question_id)) throw new ValidationError("question_id must be a valid UUID");
  if (!question_id && !card_id) throw new ValidationError("card_id or question_id is required");
  if (card_id !== undefined && !UUID_RE.test(card_id)) throw new ValidationError("card_id must be a valid UUID");
  if (targetLevel === undefined || targetLevel < 0 || targetLevel > 5) {
    throw new ValidationError("bloom_level must be between 0 and 5");
  }
  if (rawRating !== undefined && (rawRating < 1 || rawRating > 4)) throw new ValidationError("rating must be between 1 and 4");
  if (rawCorrectness !== undefined && (typeof rawCorrectness !== "number" || Number.isNaN(rawCorrectness) || rawCorrectness < 0 || rawCorrectness > 1)) {
    throw new ValidationError("correctness must be between 0 and 1");
  }
  const sessionDifficultyInput = input.session_difficulty === undefined ? undefined : validateDifficulty(input.session_difficulty);

  const legacyModality: StudyModality = (rawModality && isValidModality(rawModality)) ? rawModality : "web";

  // --- Grading: server for choice questions, tutor for open ones, self-rating otherwise ---
  let style: QuestionStyle = input.style ?? (rawCorrectness !== undefined ? "open" : "self");
  let correctness: number;
  let gradedBy: "server" | "tutor" | "self";
  if ((style === "single" || style === "multiple") && input.correct_option_ids && input.selected_option_ids) {
    correctness = gradeChoice(style, input.correct_option_ids, input.selected_option_ids);
    gradedBy = "server";
  } else if (rawCorrectness !== undefined) {
    correctness = rawCorrectness;
    gradedBy = "tutor";
    if (style === "self") style = "open";
  } else if (rawRating !== undefined) {
    correctness = correctnessFromRating(rawRating);
    gradedBy = "self";
    if (!input.style) style = "self";
  } else {
    throw new ValidationError("rating or correctness is required");
  }
  const rating = (rawCorrectness !== undefined || gradedBy === "server") ? ratingFromCorrectness(correctness) : (rawRating as 1 | 2 | 3 | 4);

  const result = await db.transaction(async (tx) => {
    // 1. Take the row locks first. The state is read in a second statement so a
    //    submit that waited on a concurrent one sees that one's committed review
    //    (READ COMMITTED gives every statement a fresh snapshot).
    if (question_id) {
      await tx.execute(sql`
        SELECT sq.id FROM study_questions sq
        JOIN study_sessions ss ON ss.id = sq.session_id AND ss.user_id = ${userId}
        JOIN fsrs_state fs ON fs.card_id = sq.card_id
        JOIN bloom_state bs ON bs.card_id = sq.card_id
        WHERE sq.id = ${question_id}
        FOR UPDATE OF sq, fs, bs
      `);
    } else {
      await tx.execute(sql`
        SELECT fs.card_id FROM fsrs_state fs
        JOIN bloom_state bs ON bs.card_id = fs.card_id
        JOIN cards c ON c.id = fs.card_id
        JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
        WHERE fs.card_id = ${card_id}
        FOR UPDATE OF fs, bs
      `);
    }

    //    Ownership is checked through the topic; the ticket additionally through its session.
    const stateRows = await tx.execute<CardStateRow>(question_id
      ? sql`
        SELECT c.id AS card_id, u.fsrs_params,
          fs.stability, fs.difficulty, fs.due, fs.last_review, fs.reps, fs.lapses, fs.state,
          bs.current_level, bs.highest_reached, bs.progress,
          c.change_rate AS card_change_rate, c.topic_id,
          sq.id AS q_id, sq.card_level AS q_card_level, sq.change_rate AS q_change_rate, sq.rate_source AS q_rate_source,
          sq.last_review_at_serve AS q_last_review_at_serve,
          (fs.last_review IS DISTINCT FROM sq.last_review_at_serve) AS q_stale,
          (sq.served_at < NOW() - (${SESSION_EXPIRY_HOURS} || ' hours')::interval) AS q_expired,
          ss.id AS s_id, ss.session_difficulty AS s_difficulty,
          (SELECT r.id FROM reviews r WHERE r.question_id = sq.id) AS existing_review_id
        FROM study_questions sq
        JOIN study_sessions ss ON ss.id = sq.session_id AND ss.user_id = ${userId}
        JOIN cards c ON c.id = sq.card_id
        JOIN topics t ON c.topic_id = t.id AND t.user_id = ${userId}
        JOIN users u ON u.id = t.user_id
        JOIN fsrs_state fs ON fs.card_id = c.id
        JOIN bloom_state bs ON bs.card_id = c.id
        WHERE sq.id = ${question_id}
      `
      : sql`
        SELECT c.id AS card_id, u.fsrs_params,
          fs.stability, fs.difficulty, fs.due, fs.last_review, fs.reps, fs.lapses, fs.state,
          bs.current_level, bs.highest_reached, bs.progress,
          c.change_rate AS card_change_rate, c.topic_id,
          NULL::uuid AS q_id, NULL::smallint AS q_card_level, NULL::real AS q_change_rate, NULL::text AS q_rate_source,
          NULL::timestamptz AS q_last_review_at_serve, NULL::boolean AS q_stale, NULL::boolean AS q_expired,
          NULL::uuid AS s_id, NULL::real AS s_difficulty, NULL::uuid AS existing_review_id
        FROM cards c
        JOIN topics t ON c.topic_id = t.id AND t.user_id = ${userId}
        JOIN users u ON u.id = t.user_id
        JOIN fsrs_state fs ON fs.card_id = c.id
        JOIN bloom_state bs ON bs.card_id = c.id
        WHERE c.id = ${card_id}
      `);
    if (stateRows.rows.length === 0) throw new NotFoundError(question_id ? "Question ticket not found" : "Card not found");
    const s = stateRows.rows[0];
    if (card_id && s.card_id !== card_id) throw new ValidationError("card_id does not match the question ticket");
    const cardId = s.card_id;

    // 2. Exactly-once: a ticket already answered returns the stored review unchanged.
    if (s.existing_review_id) {
      const [existing] = await tx.select().from(reviews).where(eq(reviews.id, s.existing_review_id));
      return {
        duplicate: true,
        review: mapReview(existing),
        fsrsState: { cardId, stability: s.stability, difficulty: s.difficulty, due: s.due, lastReview: s.last_review, reps: s.reps, lapses: s.lapses, state: s.state },
        bloomState: { cardId, currentLevel: s.current_level, highestReached: s.highest_reached, progress: s.progress },
      };
    }
    if (s.q_stale) {
      throw new ValidationError("Question ticket is stale: the card was reviewed after it was served. Fetch the card again.");
    }
    if (s.q_expired) {
      throw new ValidationError(`Question ticket expired: it was served more than ${SESSION_EXPIRY_HOURS} hours ago. Fetch the card again.`);
    }

    // 3. Settings the question was asked under: from the ticket when present.
    // Web self-study sends modality "web" and no ticket; a legacy tutor call without a ticket is still a tutor review.
    const isWeb = !question_id && legacyModality === "web";
    let effective: EffectiveRate;
    if (s.q_id) {
      effective = { changeRate: s.q_change_rate!, rateSource: s.q_rate_source as EffectiveRate["rateSource"], sourceTopicId: null, sourceTopicName: null };
    } else {
      const topicRates = await loadTopicRates(tx, userId);
      effective = resolveCardRate({ changeRate: s.card_change_rate, topicId: s.topic_id }, topicRates);
    }
    let sessionDifficulty = s.s_difficulty ?? 1;
    if (sessionDifficultyInput !== undefined) {
      sessionDifficulty = sessionDifficultyInput;
      if (s.s_id) {
        await tx.execute(sql`UPDATE study_sessions SET session_difficulty = ${sessionDifficulty}, last_activity = NOW() WHERE id = ${s.s_id}`);
      }
    } else if (s.s_id) {
      await tx.execute(sql`UPDATE study_sessions SET last_activity = NOW() WHERE id = ${s.s_id}`);
    }

    // 4. Level progress. Only questions at the card's stored level count.
    const cardLevel = s.q_card_level ?? s.current_level;
    const onLevel = targetLevel === cardLevel;
    // Forensic snapshot only: undo replays the log, it does not restore this.
    const stateBefore = {
      fsrs: { stability: s.stability, difficulty: s.difficulty, due: s.due, lastReview: s.last_review, reps: s.reps, lapses: s.lapses, state: s.state },
      bloom: { currentLevel: s.current_level, highestReached: s.highest_reached, progress: s.progress },
    };
    const levelStep = skip_bloom ? 0 : computeLevelStep(correctness, effective.changeRate, onLevel);
    const updatedBloom = skip_bloom
      ? { currentLevel: s.current_level, highestReached: s.highest_reached, progress: s.progress, levelStep: 0 }
      : applyLevelStep(levelStep, s.current_level, s.progress, s.highest_reached);

    // 5. FSRS, then the interval factor. Web self-rating keeps its old multiplier.
    const userParams = s.fsrs_params as { w: number[] } | null;
    const now = new Date();
    const before: FsrsDbState = { stability: s.stability, difficulty: s.difficulty, due: s.due, lastReview: s.last_review, reps: s.reps, lapses: s.lapses, state: s.state };
    const retrievability = retrievabilityBefore(before, userParams, now);
    const elapsed = elapsedDays(before, now);
    const rawFsrs = processReview(before, rating, userParams, now);
    const intervalFactor = isWeb ? WEB_INTERVAL_FACTOR : tutorIntervalFactor(effective.changeRate, sessionDifficulty);
    const updatedFsrs = applyIntervalFactor(rawFsrs, intervalFactor, now);
    const fsrsIntervalDays = intervalDays(rawFsrs, now);
    const scheduledDays = intervalDays(updatedFsrs, now);

    const modality: StudyModality = isWeb ? "web" : (style === "single" || style === "multiple") ? "mcq" : (question_id ? "chat" : legacyModality);

    // 6. Insert review + update state. The unique index on question_id makes a
    //    concurrent duplicate fail here instead of writing twice.
    const [inserted] = await tx.insert(reviews).values({
      cardId, bloomLevel: targetLevel, rating, questionText: question_text, modality,
      answerExpected: answer_expected ?? null, userAnswer: user_answer ?? null,
      questionId: question_id ?? null, style, targetLevel, cardLevel, onLevel, correctness, gradedBy,
      changeRate: effective.changeRate, sessionDifficulty: isWeb ? null : sessionDifficulty,
      levelStep, intervalFactor, fsrsIntervalDays, scheduledDays, elapsedDays: elapsed, retrievability,
      rulesVersion: RULES_VERSION, fsrsParamsVersion: fsrsParamsVersion(userParams),
      skipBloom: !!skip_bloom, stateBefore,
    }).returning();

    const [savedFsrs] = await tx.update(fsrsState).set({
      stability: updatedFsrs.stability, difficulty: updatedFsrs.difficulty, due: updatedFsrs.due,
      lastReview: updatedFsrs.lastReview, reps: updatedFsrs.reps, lapses: updatedFsrs.lapses, state: updatedFsrs.state,
    }).where(eq(fsrsState.cardId, cardId)).returning();

    const [savedBloom] = skip_bloom
      ? await tx.select().from(bloomState).where(eq(bloomState.cardId, cardId))
      : await tx.update(bloomState).set({
          currentLevel: updatedBloom.currentLevel, highestReached: updatedBloom.highestReached,
          progress: updatedBloom.progress, updatedAt: new Date(),
        }).where(eq(bloomState.cardId, cardId)).returning();

    return {
      duplicate: false,
      review: mapReview(inserted),
      fsrsState: { cardId, stability: savedFsrs.stability, difficulty: savedFsrs.difficulty, due: savedFsrs.due, lastReview: savedFsrs.lastReview, reps: savedFsrs.reps, lapses: savedFsrs.lapses, state: savedFsrs.state },
      bloomState: { cardId, currentLevel: savedBloom.currentLevel, highestReached: savedBloom.highestReached, progress: savedBloom.progress },
      grading: { correctness, rating, gradedBy, onLevel, levelStep, levelBefore: s.current_level, intervalFactor, scheduledDays },
    };
  });

  // Optimizer call path disabled — see docs/fsrs-optimizer-sigill-incident.md.
  // The @open-spaced-repetition/binding prebuilt native addon requires AVX2/FMA/BMI2,
  // which the production host (Ivy Bridge, 2013) does not have. First call into
  // computeParameters hit an unsupported instruction and the kernel delivered SIGILL,
  // killing the entire Node process (API + MCP). No JS handler could catch it.
  //
  // Counter is still incremented so state is preserved for when the optimizer is
  // re-enabled (rebuild from source / move to modern host / fork-based isolation).
  if (!result.duplicate) {
    try {
      await db
        .update(users)
        .set({ reviewsSinceOptimization: sql`${users.reviewsSinceOptimization} + 1` })
        .where(eq(users.id, userId));
    } catch (err) {
      console.error("FSRS optimization counter update failed:", err);
    }
  }

  return result;
}

function mapReview(r: typeof reviews.$inferSelect) {
  return {
    id: r.id, cardId: r.cardId, bloomLevel: r.bloomLevel, rating: r.rating, questionText: r.questionText,
    modality: r.modality, answerExpected: r.answerExpected, userAnswer: r.userAnswer, reviewedAt: r.reviewedAt,
    questionId: r.questionId, style: r.style, targetLevel: r.targetLevel, cardLevel: r.cardLevel, onLevel: r.onLevel,
    correctness: r.correctness, gradedBy: r.gradedBy, changeRate: r.changeRate, sessionDifficulty: r.sessionDifficulty,
    levelStep: r.levelStep, intervalFactor: r.intervalFactor, fsrsIntervalDays: r.fsrsIntervalDays,
    scheduledDays: r.scheduledDays, elapsedDays: r.elapsedDays, retrievability: r.retrievability,
    rulesVersion: r.rulesVersion, skipBloom: r.skipBloom,
  };
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
  if (!reviewId || !UUID_RE.test(reviewId)) {
    throw new ValidationError("review_id must be a valid UUID");
  }

  // Fetch review + verify ownership via card → topic → user
  const rows = await db.execute<{
    id: string;
    card_id: string;
    reviewed_at: string;
  }>(sql`
    SELECT r.id, r.card_id, r.reviewed_at
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
    await tx.execute(sql`SELECT card_id FROM fsrs_state WHERE card_id = ${cardId} FOR UPDATE`);

    // Delete the target review. Its ticket, if any, becomes answerable again.
    await tx.delete(reviews).where(eq(reviews.id, reviewId));

    // Fetch remaining reviews for replay, ordered chronologically
    const remainingReviews = await tx
      .select({
        rating: reviews.rating,
        bloomLevel: reviews.bloomLevel,
        modality: reviews.modality,
        reviewedAt: reviews.reviewedAt,
        rulesVersion: reviews.rulesVersion,
        levelStep: reviews.levelStep,
        intervalFactor: reviews.intervalFactor,
        skipBloom: reviews.skipBloom,
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

    // Replay from initial state. Rows written under rules version 2 carry the
    // factor and level step they were graded with; older rows use the v1 rules.
    let currentFsrs: FsrsDbState = createInitialFsrsState();
    let currentBloom = { currentLevel: 0, highestReached: 0, progress: 0 };

    for (const r of remainingReviews) {
      const rawFsrs = processReview(currentFsrs, r.rating as 1 | 2 | 3 | 4, userParams, r.reviewedAt);
      if ((r.rulesVersion ?? 1) >= 2) {
        currentFsrs = applyIntervalFactor(rawFsrs, r.intervalFactor ?? 1, r.reviewedAt);
        if (!r.skipBloom) {
          const next = applyLevelStep(r.levelStep ?? 0, currentBloom.currentLevel, currentBloom.progress, currentBloom.highestReached);
          currentBloom = { currentLevel: next.currentLevel, highestReached: next.highestReached, progress: next.progress };
        }
      } else {
        const modality: StudyModality = isValidModality(r.modality) ? r.modality : "web";
        currentFsrs = applyModalityMultiplier(rawFsrs, modality);
        const next = computeBloomTransition(r.rating, r.bloomLevel, currentBloom.currentLevel, currentBloom.highestReached);
        currentBloom = { currentLevel: next.currentLevel, highestReached: next.highestReached, progress: 0 };
      }
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
        progress: currentBloom.progress,
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
