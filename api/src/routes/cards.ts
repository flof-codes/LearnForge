import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import {
  createCard,
  getCard,
  updateCard,
  deleteCard,
  resetCard,
  searchCards,
  listCards,
  ValidationError,
  type ClozeData,
  type CardListStatus,
  type CardListSort,
} from "@learnforge/core";
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

  // GET /cards/search — hybrid search (text + semantic) with RRF fusion + offset pagination
  app.get<{ Querystring: { q?: string; topic_id?: string; limit?: string; offset?: string } }>(
    "/cards/search",
    async (req) => {
      const userId = getUserId(req);
      const { q, topic_id, limit: limitStr, offset: offsetStr } = req.query;
      if (!q) throw new ValidationError("q is required");
      const limit = limitStr ? parseInt(limitStr, 10) : undefined;
      const offset = offsetStr ? parseInt(offsetStr, 10) : undefined;
      const result = await searchCards(db, userId, q, topic_id, limit, offset);
      return { cards: result.cards, total: result.total, has_more: result.hasMore };
    },
  );

  // GET /cards — paginated list with server-side filter + sort (for browse UI)
  app.get<{
    Querystring: {
      topic_id?: string;
      include_descendants?: string;
      search?: string;
      bloom_level?: string;
      status?: string;
      sort?: string;
      offset?: string;
      limit?: string;
    };
  }>("/cards", async (req) => {
    const userId = getUserId(req);
    const q = req.query;

    const allowedStatus = ["all", "new", "learning", "due"] as const;
    const allowedSort = ["newest", "oldest", "updated", "studied", "concept"] as const;

    const status = q.status && (allowedStatus as readonly string[]).includes(q.status)
      ? (q.status as CardListStatus)
      : undefined;
    const sort = q.sort && (allowedSort as readonly string[]).includes(q.sort)
      ? (q.sort as CardListSort)
      : undefined;

    let bloomLevel: number | undefined;
    if (q.bloom_level !== undefined && q.bloom_level !== "") {
      const n = parseInt(q.bloom_level, 10);
      if (!Number.isNaN(n) && n >= 0 && n <= 5) bloomLevel = n;
    }

    const limit = q.limit ? parseInt(q.limit, 10) : undefined;
    const offset = q.offset ? parseInt(q.offset, 10) : undefined;

    const includeDescendants = q.include_descendants === undefined
      ? undefined
      : q.include_descendants !== "false" && q.include_descendants !== "0";

    const result = await listCards(db, userId, {
      topicId: q.topic_id && q.topic_id.length > 0 ? q.topic_id : undefined,
      includeDescendants,
      search: q.search,
      bloomLevel,
      status,
      sort,
      limit: Number.isNaN(limit) ? undefined : limit,
      offset: Number.isNaN(offset) ? undefined : offset,
    });

    return {
      cards: result.cards,
      total: result.total,
      has_more: result.hasMore,
    };
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
