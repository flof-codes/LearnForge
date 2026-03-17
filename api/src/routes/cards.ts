import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { cards, bloomState, fsrsState, reviews, topics } from "../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { computeEmbedding } from "../services/embeddings.js";
import { createInitialFsrsState } from "../services/fsrs.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";

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

    // Verify topic belongs to user
    const [topic] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, topic_id), eq(topics.userId, userId)));
    if (!topic) throw new NotFoundError("Topic not found");

    const embedding = await computeEmbedding(concept);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .set() partial update
    const updates: Record<string, any> = {};
    if (concept !== undefined) updates.concept = concept;
    if (front_html !== undefined) updates.frontHtml = front_html;
    if (back_html !== undefined) updates.backHtml = back_html;
    if (tags !== undefined) updates.tags = tags;
    if (topic_id !== undefined) updates.topicId = topic_id;

    if (concept !== undefined) {
      updates.embedding = await computeEmbedding(concept);
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
