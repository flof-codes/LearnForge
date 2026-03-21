import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { computeEmbedding } from "../services/embeddings.js";

export function registerContextTools(server: McpServer, userId: string) {
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
            SELECT id, 0 as depth FROM topics WHERE id = ${topic_id} AND user_id = ${userId}
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
              'userAnswer', r.user_answer,
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
        // Verify source card belongs to user
        const sourceCheck = await db.execute(sql`
          SELECT c.id FROM cards c JOIN topics t ON c.topic_id = t.id
          WHERE c.id = ${card_id} AND t.user_id = ${userId}
        `);
        if (sourceCheck.rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Error: Card not found" }], isError: true };
        }

        // Only return similar cards that also belong to user
        const result = await db.execute(sql`
          SELECT c.id, c.concept, c.tags, c.topic_id,
            bs.current_level, bs.highest_reached,
            1 - (c.embedding <=> (SELECT embedding FROM cards WHERE id = ${card_id})) as similarity,
            json_agg(json_build_object(
              'bloomLevel', r.bloom_level,
              'rating', r.rating,
              'questionText', r.question_text,
              'answerExpected', r.answer_expected,
              'userAnswer', r.user_answer,
              'reviewedAt', r.reviewed_at
            ) ORDER BY r.reviewed_at) FILTER (WHERE r.id IS NOT NULL) as reviews
          FROM cards c
          JOIN topics t ON c.topic_id = t.id
          LEFT JOIN bloom_state bs ON bs.card_id = c.id
          LEFT JOIN reviews r ON r.card_id = c.id
          WHERE c.id != ${card_id} AND c.embedding IS NOT NULL AND t.user_id = ${userId}
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

  // ── search_cards ─────────────────────────────────────────────────────
  server.tool(
    "search_cards",
    "Search cards using hybrid text + semantic search. Combines keyword matching on concept/tags with semantic similarity via embeddings, ranked by Reciprocal Rank Fusion.",
    {
      query: z.string().min(1).describe("Search query text"),
      topic_id: z.string().uuid().optional().describe("Optional: restrict to topic and its descendants"),
      limit: z.number().int().positive().max(100).default(10).describe("Maximum results to return"),
    },
    async ({ query, topic_id, limit }) => {
      try {
        const RRF_K = 60;

        // Build optional topic filter CTE
        const topicFilter = topic_id
          ? sql`
            , topic_tree AS (
              SELECT id, 0 as depth FROM topics WHERE id = ${topic_id} AND user_id = ${userId}
              UNION ALL
              SELECT t.id, tt.depth + 1 FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
            )
          `
          : sql``;

        const topicJoin = topic_id
          ? sql`JOIN topic_tree tt ON c.topic_id = tt.id`
          : sql`JOIN topics t ON c.topic_id = t.id AND t.user_id = ${userId}`;

        // 1. Text search: ILIKE on concept and tags::text
        const textResult = await db.execute(sql`
          WITH RECURSIVE dummy AS (SELECT 1) ${topicFilter}
          SELECT c.id,
            ROW_NUMBER() OVER (ORDER BY
              CASE WHEN c.concept ILIKE ${"%" + query + "%"} THEN 0 ELSE 1 END,
              CASE WHEN c.tags::text ILIKE ${"%" + query + "%"} THEN 0 ELSE 1 END,
              c.concept
            ) as rank
          FROM cards c
          ${topicJoin}
          WHERE c.concept ILIKE ${"%" + query + "%"} OR c.tags::text ILIKE ${"%" + query + "%"}
          LIMIT 100
        `);

        // 2. Semantic search: compute query embedding, cosine distance
        const queryEmbedding = await computeEmbedding(query);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
        let semanticRows: any[] = [];
        if (queryEmbedding) {
          const vecStr = `[${queryEmbedding.join(",")}]`;
          const semanticResult = await db.execute(sql`
            WITH RECURSIVE dummy AS (SELECT 1) ${topicFilter}
            SELECT c.id,
              ROW_NUMBER() OVER (ORDER BY c.embedding <=> ${vecStr}::vector) as rank
            FROM cards c
            ${topicJoin}
            WHERE c.embedding IS NOT NULL
            ORDER BY c.embedding <=> ${vecStr}::vector
            LIMIT 100
          `);
          semanticRows = semanticResult.rows;
        }

        // 3. RRF fusion with k=60
        const scores = new Map<string, { textRank: number | null; semanticRank: number | null; score: number }>();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
        for (const row of textResult.rows as any[]) {
          const id = row.id as string;
          const rank = Number(row.rank);
          scores.set(id, {
            textRank: rank,
            semanticRank: null,
            score: 1 / (RRF_K + rank),
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
        for (const row of semanticRows as any[]) {
          const id = row.id as string;
          const rank = Number(row.rank);
          const existing = scores.get(id);
          if (existing) {
            existing.semanticRank = rank;
            existing.score += 1 / (RRF_K + rank);
          } else {
            scores.set(id, {
              textRank: null,
              semanticRank: rank,
              score: 1 / (RRF_K + rank),
            });
          }
        }

        // Sort by RRF score descending and take top `limit`
        const topIds = [...scores.entries()]
          .sort((a, b) => b[1].score - a[1].score)
          .slice(0, limit)
          .map(([id]) => id);

        if (topIds.length === 0) {
          return { content: [{ type: "text" as const, text: JSON.stringify([], null, 2) }] };
        }

        // Fetch full card data for the top results
        const placeholders = topIds.map((id) => sql`${id}`);
        const inList = sql.join(placeholders, sql`, `);

        const fullResult = await db.execute(sql`
          SELECT c.id, c.concept, c.tags, c.topic_id, c.front_html, c.back_html,
            bs.current_level, bs.highest_reached
          FROM cards c
          LEFT JOIN bloom_state bs ON bs.card_id = c.id
          WHERE c.id IN (${inList})
        `);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
        const cardMap = new Map(fullResult.rows.map((row: any) => [row.id, row]));

        const results = topIds
          .map((id) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row = cardMap.get(id) as any;
            if (!row) return null;
            const s = scores.get(id)!;
            return {
              id: row.id,
              concept: row.concept,
              tags: row.tags,
              topicId: row.topic_id,
              frontHtml: row.front_html,
              backHtml: row.back_html,
              bloomState: {
                currentLevel: row.current_level ?? null,
                highestReached: row.highest_reached ?? null,
              },
              score: s.score,
              textRank: s.textRank,
              semanticRank: s.semanticRank,
            };
          })
          .filter(Boolean);

        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
