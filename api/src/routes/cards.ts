import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { createCard, getCard, updateCard, deleteCard, resetCard, searchCards, ValidationError, type ClozeData } from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";

export default async function cardRoutes(app: FastifyInstance) {

  // POST /cards — create a new card with bloom + fsrs state
  app.post<{ Body: { topic_id: string; concept: string; front_html?: string; back_html?: string; tags?: string[]; card_type?: "standard" | "cloze"; cloze_data?: ClozeData } }>("/cards", {
    schema: {
      body: {
        type: "object",
        required: ["topic_id", "concept"],
        properties: {
          topic_id: { type: "string", format: "uuid" },
          concept: { type: "string", minLength: 1 },
          front_html: { type: "string", minLength: 1 },
          back_html: { type: "string", minLength: 1 },
          tags: { type: "array", items: { type: "string" } },
          card_type: { type: "string", enum: ["standard", "cloze"] },
          cloze_data: { type: "object" },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const userId = getUserId(req);
    const result = await createCard(db, userId, req.body);
    reply.status(201);
    return result;
  });

  // GET /cards/search — hybrid search (text + semantic) with RRF fusion
  app.get<{ Querystring: { q?: string; topic_id?: string; limit?: string } }>("/cards/search", async (req) => {
    const userId = getUserId(req);
    const { q, topic_id, limit: limitStr } = req.query;
    if (!q) throw new ValidationError("q is required");
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    return searchCards(db, userId, q, topic_id, limit);
  });

  // GET /cards/:id — single card with bloom_state, fsrs_state, and reviews
  app.get<{ Params: { id: string } }>("/cards/:id", async (req) => {
    const userId = getUserId(req);
    return getCard(db, userId, req.params.id);
  });

  // PUT /cards/:id — update card content
  app.put<{ Params: { id: string }; Body: { concept?: string; front_html?: string; back_html?: string; tags?: string[]; topic_id?: string; cloze_data?: ClozeData } }>("/cards/:id", {
    schema: {
      body: {
        type: "object",
        properties: {
          topic_id: { type: "string", format: "uuid" },
          concept: { type: "string", minLength: 1 },
          front_html: { type: "string", minLength: 1 },
          back_html: { type: "string", minLength: 1 },
          tags: { type: "array", items: { type: "string" } },
          cloze_data: { type: "object" },
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const userId = getUserId(req);
    return updateCard(db, userId, req.params.id, req.body);
  });

  // POST /cards/:id/reset — reset bloom + fsrs state and delete review history
  app.post<{ Params: { id: string } }>("/cards/:id/reset", async (req) => {
    const userId = getUserId(req);
    return resetCard(db, userId, req.params.id);
  });

  // DELETE /cards/:id — hard delete (cascades to bloom_state, fsrs_state, reviews)
  app.delete<{ Params: { id: string } }>("/cards/:id", async (req, reply) => {
    const userId = getUserId(req);
    await deleteCard(db, userId, req.params.id);
    reply.status(204);
  });
}
