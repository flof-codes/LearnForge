import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { submitReview } from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";

export default async function reviewRoutes(app: FastifyInstance) {

  // POST /reviews — submit a review
  app.post<{
    Body: { card_id: string; bloom_level: number; rating: number; question_text: string; skip_bloom?: boolean; modality?: string; answer_expected?: string; user_answer?: string };
  }>("/reviews", {
    schema: {
      body: {
        type: "object",
        required: ["card_id", "bloom_level", "rating", "question_text"],
        properties: {
          card_id: { type: "string", format: "uuid" },
          bloom_level: { type: "integer", minimum: 0, maximum: 5 },
          rating: { type: "integer", minimum: 1, maximum: 4 },
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
}
