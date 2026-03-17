import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/connection.js";
import { reviews, fsrsState, bloomState } from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { processReview, applyModalityMultiplier, type FsrsDbState, type StudyModality } from "../services/fsrs.js";
import { computeBloomTransition } from "../services/bloom.js";

export function registerReviewTools(server: McpServer, userId: string) {
  server.tool(
    "submit_review",
    "Submit a review for a card, updating FSRS scheduling and Bloom's taxonomy state. The modality parameter affects interval scheduling: 'chat' (AI conversation, 1.25x interval), 'web' (self-rating, 1.0x), 'mcq' (multiple choice, 0.75x).",
    {
      card_id: z.string().uuid(),
      bloom_level: z.number().int().min(0).max(5),
      rating: z.number().int().min(1).max(4),
      question_text: z.string().min(1).describe("The exact, complete question as shown to the user — including all MCQ options with letters"),
      modality: z.enum(["chat", "web", "mcq"]).default("chat").optional(),
      answer_expected: z.string().optional().describe("The correct/ideal answer (e.g. 'A, C' for MCQ or full text for open response)"),
      user_answer: z.string().optional().describe("The user's actual answer (e.g. 'B, D' for MCQ or the text they provided)"),
    },
    async ({ card_id, bloom_level, rating, question_text, modality: rawModality, answer_expected, user_answer }) => {
      try {
        // Verify card belongs to user through topic
        const ownerCheck = await db.execute<{ id: string }>(sql`
          SELECT c.id FROM cards c JOIN topics t ON c.topic_id = t.id
          WHERE c.id = ${card_id} AND t.user_id = ${userId}
        `);
        if (ownerCheck.rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Error: Card not found" }], isError: true };
        }

        const modality: StudyModality = rawModality ?? "chat";

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

          // 2. Read current fsrs_state -> process -> update
          const [currentFsrs] = await tx
            .select()
            .from(fsrsState)
            .where(eq(fsrsState.cardId, card_id));

          if (!currentFsrs) throw new Error("Card fsrs_state not found");

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

          // 3. Read current bloom_state -> compute transition -> update
          const [currentBloom] = await tx
            .select()
            .from(bloomState)
            .where(eq(bloomState.cardId, card_id));

          if (!currentBloom) throw new Error("Card bloom_state not found");

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

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
