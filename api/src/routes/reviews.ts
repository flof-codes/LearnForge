import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { reviews, fsrsState, bloomState } from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { processReview, applyModalityMultiplier, isValidModality, type FsrsDbState, type StudyModality } from "../services/fsrs.js";
import { computeBloomTransition } from "../services/bloom.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";

export default async function reviewRoutes(app: FastifyInstance) {

  // POST /reviews — submit a review
  app.post<{
    Body: { card_id: string; bloom_level: number; rating: number; question_text: string; skip_bloom?: boolean; modality?: string; answer_expected?: string; user_answer?: string };
  }>("/reviews", async (req, reply) => {
    const { card_id, bloom_level, rating, question_text, skip_bloom, modality: rawModality, answer_expected, user_answer } = req.body;
    const userId = getUserId(req);

    if (!card_id) throw new ValidationError("card_id is required");
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

      // 2. Read current fsrs_state → process → update
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

      // 3. Read current bloom_state → compute transition → update (skip for manual reviews)
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

    reply.status(201);
    return result;
  });
}
