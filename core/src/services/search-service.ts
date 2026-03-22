import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { computeEmbedding } from "./embeddings.js";
import { ValidationError } from "../lib/errors.js";

export async function searchCards(db: Db, userId: string, query: string, topicId?: string, rawLimit?: number) {
  if (!query || !query.trim()) throw new ValidationError("q is required");
  const parsed = rawLimit ?? 20;
  const limit = Math.min(Math.max(1, Number.isNaN(parsed) ? 20 : parsed), 100);
  const overFetch = limit * 3;

  // Build topic filter using top-level CTE
  const topicCte = topicId
    ? sql`, topic_tree AS (
        SELECT id FROM topics WHERE id = ${topicId} AND user_id = ${userId}
        UNION ALL
        SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
      )`
    : sql``;
  const topicJoin = topicId
    ? sql`JOIN topic_tree tt ON c.topic_id = tt.id`
    : sql`JOIN topics t ON c.topic_id = t.id AND t.user_id = ${userId}`;

  // Text search: ILIKE on concept and tags
  const textResult = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE dummy AS (SELECT 1) ${topicCte}
    SELECT c.id FROM cards c
    ${topicJoin}
    WHERE (c.concept ILIKE ${"%" + query + "%"} OR c.tags::text ILIKE ${"%" + query + "%"})
    ORDER BY c.updated_at DESC
    LIMIT ${overFetch}
  `);

  // Semantic search: cosine distance on embedding
  const queryEmbedding = await computeEmbedding(query);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
  let semanticRows: any[] = [];
  if (queryEmbedding) {
    const vecLiteral = `[${queryEmbedding.join(",")}]`;
    const semanticResult = await db.execute<{ id: string }>(sql`
      WITH RECURSIVE dummy AS (SELECT 1) ${topicCte}
      SELECT c.id FROM cards c
      ${topicJoin}
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vecLiteral}::vector
      LIMIT ${overFetch}
    `);
    semanticRows = semanticResult.rows;
  }

  // RRF fusion (k=60)
  const k = 60;
  const scores = new Map<string, number>();
  for (let i = 0; i < textResult.rows.length; i++) {
    const id = textResult.rows[i].id;
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i));
  }
  for (let i = 0; i < semanticRows.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = (semanticRows[i] as any).id as string;
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
}
