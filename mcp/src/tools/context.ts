import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export function registerContextTools(server: McpServer) {
  server.tool(
    "get_topic_context",
    "Get all cards for a topic and its descendants (recursive). Returns card concept, tags, bloom state, and review history.",
    {
      topic_id: z.string().uuid(),
      depth: z.number().int().positive().default(100).describe("Maximum recursion depth for subtopics"),
    },
    async ({ topic_id, depth }) => {
      try {
        const result = await db.execute(sql`
          WITH RECURSIVE topic_tree AS (
            SELECT id, 0 as depth FROM topics WHERE id = ${topic_id}
            UNION ALL
            SELECT t.id, tt.depth + 1 FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
            WHERE tt.depth < ${depth}
          )
          SELECT c.id, c.concept, c.tags, c.topic_id,
            bs.current_level, bs.highest_reached,
            json_agg(json_build_object(
              'bloomLevel', r.bloom_level,
              'rating', r.rating,
              'questionText', r.question_text,
              'answerExpected', r.answer_expected,
              'reviewedAt', r.reviewed_at
            ) ORDER BY r.reviewed_at) FILTER (WHERE r.id IS NOT NULL) as reviews
          FROM cards c
          JOIN topic_tree tt ON c.topic_id = tt.id
          LEFT JOIN bloom_state bs ON bs.card_id = c.id
          LEFT JOIN reviews r ON r.card_id = c.id
          GROUP BY c.id, c.concept, c.tags, c.topic_id, bs.current_level, bs.highest_reached
        `);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
        const cards = result.rows.map((row: any) => ({
          id: row.id,
          concept: row.concept,
          tags: row.tags,
          topicId: row.topic_id,
          bloomState: {
            currentLevel: row.current_level ?? null,
            highestReached: row.highest_reached ?? null,
          },
          reviews: row.reviews ?? [],
        }));

        return { content: [{ type: "text" as const, text: JSON.stringify(cards, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "get_similar_cards",
    "Find cards similar to a given card using pgvector cosine similarity. Returns similarity score, concept, tags, bloom state, and review history.",
    {
      card_id: z.string().uuid(),
      limit: z.number().int().positive().max(100).default(15).describe("Maximum number of similar cards to return"),
    },
    async ({ card_id, limit }) => {
      try {
        const sourceCheck = await db.execute(sql`
          SELECT id FROM cards WHERE id = ${card_id}
        `);
        if (sourceCheck.rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Error: Card not found" }], isError: true };
        }

        const result = await db.execute(sql`
          SELECT c.id, c.concept, c.tags, c.topic_id,
            bs.current_level, bs.highest_reached,
            1 - (c.embedding <=> (SELECT embedding FROM cards WHERE id = ${card_id})) as similarity,
            json_agg(json_build_object(
              'bloomLevel', r.bloom_level,
              'rating', r.rating,
              'questionText', r.question_text,
              'answerExpected', r.answer_expected,
              'reviewedAt', r.reviewed_at
            ) ORDER BY r.reviewed_at) FILTER (WHERE r.id IS NOT NULL) as reviews
          FROM cards c
          LEFT JOIN bloom_state bs ON bs.card_id = c.id
          LEFT JOIN reviews r ON r.card_id = c.id
          WHERE c.id != ${card_id} AND c.embedding IS NOT NULL
          GROUP BY c.id, c.concept, c.tags, c.topic_id, bs.current_level, bs.highest_reached, c.embedding
          ORDER BY c.embedding <=> (SELECT embedding FROM cards WHERE id = ${card_id})
          LIMIT ${limit}
        `);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
        const cards = result.rows.map((row: any) => ({
          id: row.id,
          concept: row.concept,
          tags: row.tags,
          topicId: row.topic_id,
          similarity: parseFloat(row.similarity),
          bloomState: {
            currentLevel: row.current_level ?? null,
            highestReached: row.highest_reached ?? null,
          },
          reviews: row.reviews ?? [],
        }));

        return { content: [{ type: "text" as const, text: JSON.stringify(cards, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
