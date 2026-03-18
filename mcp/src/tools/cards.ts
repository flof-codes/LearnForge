import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/connection.js";
import { cards, bloomState, fsrsState, reviews, topics } from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { computeEmbedding } from "../services/embeddings.js";
import { createInitialFsrsState } from "../services/fsrs.js";
import { validateCardHtml } from "../lib/sanitize-card-html.js";

export function registerCardTools(server: McpServer, userId: string) {
  // ── create_card ──────────────────────────────────────────────────────
  server.tool(
    "create_card",
    "Create a flashcard with embedding, bloom state, and FSRS scheduling state",
    {
      topic_id: z.string().uuid(),
      concept: z.string(),
      front_html: z.string(),
      back_html: z.string(),
      tags: z.array(z.string()).optional(),
    },
    async ({ topic_id, concept, front_html, back_html, tags }) => {
      try {
        validateCardHtml(front_html, "front_html");
        validateCardHtml(back_html, "back_html");

        // Verify topic belongs to user
        const [topic] = await db.select({ id: topics.id }).from(topics)
          .where(sql`${topics.id} = ${topic_id} AND ${topics.userId} = ${userId}`);
        if (!topic) {
          return { content: [{ type: "text" as const, text: "Error: Topic not found" }], isError: true };
        }

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

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── get_card ─────────────────────────────────────────────────────────
  server.tool(
    "get_card",
    "Get a card with its bloom state, FSRS scheduling state, and review history",
    { card_id: z.string().uuid() },
    async ({ card_id }) => {
      try {
        // Verify card belongs to user through topic
        const ownerCheck = await db.execute<{ id: string }>(sql`
          SELECT c.id FROM cards c JOIN topics t ON c.topic_id = t.id
          WHERE c.id = ${card_id} AND t.user_id = ${userId}
        `);
        if (ownerCheck.rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Error: Card not found" }], isError: true };
        }

        const [card] = await db.select().from(cards).where(eq(cards.id, card_id));
        const [bloom] = await db.select().from(bloomState).where(eq(bloomState.cardId, card_id));
        const [fsrs] = await db.select().from(fsrsState).where(eq(fsrsState.cardId, card_id));
        const cardReviews = await db.select().from(reviews).where(eq(reviews.cardId, card_id));

        const result = { ...card, bloomState: bloom ?? null, fsrsState: fsrs ?? null, reviews: cardReviews };
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── update_card ──────────────────────────────────────────────────────
  server.tool(
    "update_card",
    "Update a card's content. Recomputes embedding if concept changes",
    {
      card_id: z.string().uuid(),
      concept: z.string().optional(),
      front_html: z.string().optional(),
      back_html: z.string().optional(),
      tags: z.array(z.string()).optional(),
      topic_id: z.string().uuid().optional(),
    },
    async ({ card_id, concept, front_html, back_html, tags, topic_id }) => {
      try {
        if (front_html !== undefined) validateCardHtml(front_html, "front_html");
        if (back_html !== undefined) validateCardHtml(back_html, "back_html");

        // Verify card belongs to user through topic
        const ownerCheck = await db.execute<{ id: string }>(sql`
          SELECT c.id FROM cards c JOIN topics t ON c.topic_id = t.id
          WHERE c.id = ${card_id} AND t.user_id = ${userId}
        `);
        if (ownerCheck.rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Error: Card not found" }], isError: true };
        }

        // If moving to a new topic, verify it also belongs to user
        if (topic_id !== undefined) {
          const [newTopic] = await db.select({ id: topics.id }).from(topics)
            .where(sql`${topics.id} = ${topic_id} AND ${topics.userId} = ${userId}`);
          if (!newTopic) {
            return { content: [{ type: "text" as const, text: "Error: Target topic not found" }], isError: true };
          }
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

        const [updated] = await db.update(cards).set(updates).where(eq(cards.id, card_id)).returning();
        if (!updated) {
          return { content: [{ type: "text" as const, text: "Error: Card not found" }], isError: true };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── delete_card ──────────────────────────────────────────────────────
  server.tool(
    "delete_card",
    "Delete a card. Bloom state, FSRS state, and reviews cascade-delete via FK",
    { card_id: z.string().uuid() },
    async ({ card_id }) => {
      try {
        // Verify card belongs to user through topic
        const ownerCheck = await db.execute<{ id: string }>(sql`
          SELECT c.id FROM cards c JOIN topics t ON c.topic_id = t.id
          WHERE c.id = ${card_id} AND t.user_id = ${userId}
        `);
        if (ownerCheck.rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Error: Card not found" }], isError: true };
        }

        const [deleted] = await db.delete(cards).where(eq(cards.id, card_id)).returning();
        if (!deleted) {
          return { content: [{ type: "text" as const, text: "Error: Card not found" }], isError: true };
        }

        return { content: [{ type: "text" as const, text: `Deleted card "${deleted.concept}" (${deleted.id})` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
