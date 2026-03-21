import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { cards, bloomState, fsrsState, reviews, topics } from "../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { computeEmbedding, buildEmbeddingText } from "../services/embeddings.js";
import { createInitialFsrsState } from "../services/fsrs.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";
import { validateCardHtml } from "../lib/sanitize-card-html.js";

async function verifyCardOwnership(cardId: string, userId: string): Promise<void> {
  const result = await db.execute<{ id: string }>(sql`
    SELECT c.id FROM cards c
    JOIN topics t ON c.topic_id = t.id
    WHERE c.id = ${cardId} AND t.user_id = ${userId}
  `);
  if (result.rows.length === 0) throw new NotFoundError("Card not found");
}

export default async function cardRoutes(app: FastifyInstance) {

  // POST /cards — create a new card with bloom + fsrs state
  app.post<{ Body: { topic_id: string; concept: string; front_html: string; back_html: string; tags?: string[] } }>("/cards", async (req, reply) => {
    const { topic_id, concept, front_html, back_html, tags } = req.body;
    const userId = getUserId(req);

    if (!topic_id) throw new ValidationError("topic_id is required");
    if (!concept) throw new ValidationError("concept is required");
    if (!front_html) throw new ValidationError("front_html is required");
    if (!back_html) throw new ValidationError("back_html is required");
    validateCardHtml(front_html, "front_html");
    validateCardHtml(back_html, "back_html");

    // Verify topic belongs to user
    const [topic] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, topic_id), eq(topics.userId, userId)));
    if (!topic) throw new NotFoundError("Topic not found");

    const embeddingText = buildEmbeddingText(concept, tags ?? [], front_html, back_html);
    const embedding = await computeEmbedding(embeddingText);
    const initialFsrs = createInitialFsrsState();

    const result = await db.transaction(async (tx) => {
      const [card] = await tx.insert(cards).values({
        topicId: topic_id,
        concept,
        frontHtml: front_html,
        backHtml: back_html,
        tags: tags ?? [],
        embedding,
      }).returning();

      const [bloom] = await tx.insert(bloomState).values({
        cardId: card.id,
      }).returning();

      const [fsrs] = await tx.insert(fsrsState).values({
        cardId: card.id,
        stability: initialFsrs.stability,
        difficulty: initialFsrs.difficulty,
        due: initialFsrs.due,
        lastReview: initialFsrs.lastReview,
        reps: initialFsrs.reps,
        lapses: initialFsrs.lapses,
        state: initialFsrs.state,
      }).returning();

      return { ...card, bloomState: bloom, fsrsState: fsrs };
    });

    reply.status(201);
    return result;
  });

  // GET /cards/search — hybrid search (text + semantic) with RRF fusion
  app.get<{ Querystring: { q?: string; topic_id?: string; limit?: string } }>("/cards/search", async (req) => {
    const { q, topic_id, limit: limitStr } = req.query;
    if (!q || !q.trim()) throw new ValidationError("q is required");
    const userId = getUserId(req);
    const parsed = limitStr ? parseInt(limitStr, 10) : 20;
    const limit = Math.min(Math.max(1, Number.isNaN(parsed) ? 20 : parsed), 100);
    const overFetch = limit * 3;

    // Build topic filter using top-level CTE (WITH RECURSIVE can't be inside IN subquery)
    const topicCte = topic_id
      ? sql`, topic_tree AS (
          SELECT id FROM topics WHERE id = ${topic_id} AND user_id = ${userId}
          UNION ALL
          SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
        )`
      : sql``;
    const topicJoin = topic_id
      ? sql`JOIN topic_tree tt ON c.topic_id = tt.id`
      : sql`JOIN topics t ON c.topic_id = t.id AND t.user_id = ${userId}`;

    // Text search: ILIKE on concept and tags
    const textResult = await db.execute<{ id: string }>(sql`
      WITH RECURSIVE dummy AS (SELECT 1) ${topicCte}
      SELECT c.id FROM cards c
      ${topicJoin}
      WHERE (c.concept ILIKE ${"%" + q + "%"} OR c.tags::text ILIKE ${"%" + q + "%"})
      ORDER BY c.updated_at DESC
      LIMIT ${overFetch}
    `);

    // Semantic search: cosine distance on embedding
    const queryEmbedding = await computeEmbedding(q);
    const vecLiteral = `[${queryEmbedding.join(",")}]`;
    const semanticResult = await db.execute<{ id: string }>(sql`
      WITH RECURSIVE dummy AS (SELECT 1) ${topicCte}
      SELECT c.id FROM cards c
      ${topicJoin}
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vecLiteral}::vector
      LIMIT ${overFetch}
    `);

    // RRF fusion (k=60)
    const k = 60;
    const scores = new Map<string, number>();
    for (let i = 0; i < textResult.rows.length; i++) {
      const id = textResult.rows[i].id;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i));
    }
    for (let i = 0; i < semanticResult.rows.length; i++) {
      const id = semanticResult.rows[i].id;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i));
    }

    const rankedIds = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({ id, score }));

    if (rankedIds.length === 0) return [];

    const placeholders = rankedIds.map((r) => sql`${r.id}`);
    const inList = sql.join(placeholders, sql`, `);

    const cardRows = await db.execute<{
      id: string; concept: string; tags: string[] | null; topic_id: string;
      front_html: string; back_html: string; created_at: string; updated_at: string;
      current_level: number | null; highest_reached: number | null;
      stability: number | null; difficulty: number | null; due: string | null;
      state: number | null; last_review: string | null; reps: number | null; lapses: number | null;
    }>(sql`
      SELECT c.id, c.concept, c.tags, c.topic_id, c.front_html, c.back_html,
        c.created_at, c.updated_at,
        bs.current_level, bs.highest_reached,
        fs.stability, fs.difficulty, fs.due, fs.state, fs.last_review, fs.reps, fs.lapses
      FROM cards c
      LEFT JOIN bloom_state bs ON bs.card_id = c.id
      LEFT JOIN fsrs_state fs ON fs.card_id = c.id
      WHERE c.id IN (${inList})
    `);

    const cardMap = new Map(cardRows.rows.map((row) => [row.id, row]));

    return rankedIds.map(({ id, score }) => {
      const row = cardMap.get(id)!;
      return {
        id: row.id,
        concept: row.concept,
        tags: row.tags,
        topicId: row.topic_id,
        frontHtml: row.front_html,
        backHtml: row.back_html,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        score,
        bloomState: { currentLevel: row.current_level ?? null, highestReached: row.highest_reached ?? null },
        fsrsState: row.due ? {
          stability: row.stability, difficulty: row.difficulty, due: row.due,
          state: row.state, lastReview: row.last_review, reps: row.reps, lapses: row.lapses,
        } : null,
      };
    });
  });

  // GET /cards/:id — single card with bloom_state, fsrs_state, and reviews
  app.get<{ Params: { id: string } }>("/cards/:id", async (req) => {
    const { id } = req.params;
    const userId = getUserId(req);

    await verifyCardOwnership(id, userId);

    const [card] = await db.select().from(cards).where(eq(cards.id, id));
    if (!card) throw new NotFoundError("Card not found");

    const [bloom] = await db.select().from(bloomState).where(eq(bloomState.cardId, id));
    const [fsrs] = await db.select().from(fsrsState).where(eq(fsrsState.cardId, id));
    const cardReviews = await db.select().from(reviews).where(eq(reviews.cardId, id));

    return { ...card, bloomState: bloom ?? null, fsrsState: fsrs ?? null, reviews: cardReviews };
  });

  // PUT /cards/:id — update card content
  app.put<{ Params: { id: string }; Body: { concept?: string; front_html?: string; back_html?: string; tags?: string[]; topic_id?: string } }>("/cards/:id", async (req) => {
    const { id } = req.params;
    const { concept, front_html, back_html, tags, topic_id } = req.body;
    const userId = getUserId(req);

    await verifyCardOwnership(id, userId);

    // If topic_id is being changed, verify new topic belongs to user
    if (topic_id !== undefined) {
      const [newTopic] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, topic_id), eq(topics.userId, userId)));
      if (!newTopic) throw new NotFoundError("Topic not found");
    }

    if (front_html !== undefined) validateCardHtml(front_html, "front_html");
    if (back_html !== undefined) validateCardHtml(back_html, "back_html");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .set() partial update
    const updates: Record<string, any> = {};
    if (concept !== undefined) updates.concept = concept;
    if (front_html !== undefined) updates.frontHtml = front_html;
    if (back_html !== undefined) updates.backHtml = back_html;
    if (tags !== undefined) updates.tags = tags;
    if (topic_id !== undefined) updates.topicId = topic_id;

    if (concept !== undefined || front_html !== undefined || back_html !== undefined || tags !== undefined) {
      const [currentCard] = await db.select().from(cards).where(eq(cards.id, id));
      if (currentCard) {
        const finalConcept = concept ?? currentCard.concept;
        const finalTags = tags ?? currentCard.tags ?? [];
        const finalFront = front_html ?? currentCard.frontHtml;
        const finalBack = back_html ?? currentCard.backHtml;
        updates.embedding = await computeEmbedding(buildEmbeddingText(finalConcept, finalTags, finalFront, finalBack));
      }
    }

    const [updated] = await db.update(cards).set(updates).where(eq(cards.id, id)).returning();
    if (!updated) throw new NotFoundError("Card not found");

    return updated;
  });

  // POST /cards/:id/reset — reset bloom + fsrs state and delete review history
  app.post<{ Params: { id: string } }>("/cards/:id/reset", async (req) => {
    const { id } = req.params;
    const userId = getUserId(req);

    await verifyCardOwnership(id, userId);

    const [card] = await db.select().from(cards).where(eq(cards.id, id));
    if (!card) throw new NotFoundError("Card not found");

    const initialFsrs = createInitialFsrsState();

    const result = await db.transaction(async (tx) => {
      const [bloom] = await tx
        .update(bloomState)
        .set({ currentLevel: 0, highestReached: 0, updatedAt: new Date() })
        .where(eq(bloomState.cardId, id))
        .returning();

      const [fsrs] = await tx
        .update(fsrsState)
        .set({
          stability: initialFsrs.stability,
          difficulty: initialFsrs.difficulty,
          due: initialFsrs.due,
          lastReview: initialFsrs.lastReview,
          reps: initialFsrs.reps,
          lapses: initialFsrs.lapses,
          state: initialFsrs.state,
        })
        .where(eq(fsrsState.cardId, id))
        .returning();

      await tx.delete(reviews).where(eq(reviews.cardId, id));

      return { ...card, bloomState: bloom, fsrsState: fsrs, reviews: [] };
    });

    return result;
  });

  // DELETE /cards/:id — hard delete (cascades to bloom_state, fsrs_state, reviews)
  app.delete<{ Params: { id: string } }>("/cards/:id", async (req, reply) => {
    const { id } = req.params;
    const userId = getUserId(req);

    await verifyCardOwnership(id, userId);

    const [deleted] = await db.delete(cards).where(eq(cards.id, id)).returning();
    if (!deleted) throw new NotFoundError("Card not found");

    reply.status(204);
  });
}
