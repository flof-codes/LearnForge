import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { submitReview, deleteReview, type SubmitReviewInput } from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";

export default async function reviewRoutes(app: FastifyInstance) {

  // POST /reviews — submit a review
  app.post<{
    Body: SubmitReviewInput;
  }>("/reviews", {
    schema: {
      body: {
        type: "object",
        required: ["bloom_level", "question_text"],
        properties: {
          card_id: { type: "string", format: "uuid" },
          question_id: { type: "string", format: "uuid" },
          bloom_level: { type: "integer", minimum: 0, maximum: 5 },
          target_level: { type: "integer", minimum: 0, maximum: 5 },
          rating: { type: "integer", minimum: 1, maximum: 4 },
          correctness: { type: "number", minimum: 0, maximum: 1 },
          style: { type: "string", enum: ["open", "single", "multiple", "self"] },
          correct_option_ids: { type: "array", items: { type: "string" } },
          selected_option_ids: { type: "array", items: { type: "string" } },
          session_difficulty: { type: "number", minimum: 0, maximum: 1 },
          question_text: { type: "string", minLength: 1 },
          skip_bloom: { type: "boolean" },
          modality: { type: "string", enum: ["chat", "web", "mcq"] },
          answer_expected: { type: "string" },
          user_answer: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const userId = getUserId(req);
    const result = await submitReview(db, userId, req.body);
    reply.status(201);
    return result;
  });

  // DELETE /reviews/:id — delete a single review and recalculate card state
  app.delete<{
    Params: { id: string };
  }>("/reviews/:id", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
    },
  }, async (req) => {
    const userId = getUserId(req);
    const result = await deleteReview(db, userId, req.params.id);
    return result;
  });
}
