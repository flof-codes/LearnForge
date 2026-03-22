import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { getTopicContext, getSimilarCards } from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";

export default async function contextRoutes(app: FastifyInstance) {

  // GET /context/topic/:id?depth — cards for topic and descendants with depth limit
  app.get<{ Params: { id: string }; Querystring: { depth?: string } }>("/context/topic/:id", async (req) => {
    const userId = getUserId(req);
    const depth = req.query.depth ? parseInt(req.query.depth, 10) : undefined;
    return getTopicContext(db, userId, req.params.id, depth);
  });

  // GET /context/similar/:card_id?limit — pgvector cosine similarity search
  app.get<{ Params: { card_id: string }; Querystring: { limit?: string } }>("/context/similar/:card_id", async (req) => {
    const userId = getUserId(req);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    return getSimilarCards(db, userId, req.params.card_id, limit);
  });
}
