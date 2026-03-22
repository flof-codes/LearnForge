import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { submitReview } from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";

export default async function reviewRoutes(app: FastifyInstance) {

  // POST /reviews — submit a review
  app.post<{
    Body: { card_id: string; bloom_level: number; rating: number; question_text: string; skip_bloom?: boolean; modality?: string; answer_expected?: string; user_answer?: string };
  }>("/reviews", async (req, reply) => {
    const userId = getUserId(req);
    const result = await submitReview(db, userId, req.body);
    reply.status(201);
    return result;
  });
}
