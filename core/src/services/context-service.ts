import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NotFoundError } from "../lib/errors.js";

export async function getTopicContext(db: Db, userId: string, topicId: string, depth?: number) {
  const maxDepth = depth ?? 100;

  const result = await db.execute(sql`
    WITH RECURSIVE topic_tree AS (
      SELECT id, 0 as depth FROM topics WHERE id = ${topicId} AND user_id = ${userId}
      UNION ALL
      SELECT t.id, tt.depth + 1 FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
      WHERE tt.depth < ${maxDepth}
    )
    SELECT c.id, c.concept, c.tags, c.topic_id, c.front_html,
      c.created_at, c.updated_at,
      bs.current_level, bs.highest_reached,
      fs.due, fs.state as fsrs_state, fs.last_review,
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
    LEFT JOIN fsrs_state fs ON fs.card_id = c.id
    LEFT JOIN reviews r ON r.card_id = c.id
    GROUP BY c.id, c.concept, c.tags, c.topic_id, c.front_html, c.created_at, c.updated_at, bs.current_level, bs.highest_reached, fs.due, fs.state, fs.last_review
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
  return result.rows.map((row: any) => ({
    id: row.id,
    concept: row.concept,
    tags: row.tags,
    topicId: row.topic_id,
    frontHtml: row.front_html,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bloomState: {
      currentLevel: row.current_level ?? null,
      highestReached: row.highest_reached ?? null,
    },
    fsrsState: row.due ? { due: row.due, state: row.fsrs_state, lastReview: row.last_review } : null,
    reviews: row.reviews ?? [],
  }));
}

export async function getSimilarCards(db: Db, userId: string, cardId: string, limit?: number) {
  const maxLimit = limit ?? 15;

  // Check if the source card exists and belongs to user
  const sourceCheck = await db.execute(sql`
    SELECT c.id FROM cards c
    JOIN topics t ON c.topic_id = t.id
    WHERE c.id = ${cardId} AND t.user_id = ${userId}
  `);
  if (sourceCheck.rows.length === 0) {
    throw new NotFoundError("Card not found");
  }

  const result = await db.execute(sql`
    SELECT c.id, c.concept, c.tags, c.topic_id,
      bs.current_level, bs.highest_reached,
      1 - (c.embedding <=> target.embedding) as similarity,
      json_agg(json_build_object(
        'bloomLevel', r.bloom_level,
        'rating', r.rating,
        'questionText', r.question_text,
        'answerExpected', r.answer_expected,
        'userAnswer', r.user_answer,
        'reviewedAt', r.reviewed_at
      ) ORDER BY r.reviewed_at) FILTER (WHERE r.id IS NOT NULL) as reviews
    FROM cards c
    CROSS JOIN (SELECT embedding FROM cards WHERE id = ${cardId}) target
    JOIN topics t ON c.topic_id = t.id
    LEFT JOIN bloom_state bs ON bs.card_id = c.id
    LEFT JOIN reviews r ON r.card_id = c.id
    WHERE c.id != ${cardId} AND c.embedding IS NOT NULL AND t.user_id = ${userId}
    GROUP BY c.id, c.concept, c.tags, c.topic_id, bs.current_level, bs.highest_reached, target.embedding, c.embedding
    ORDER BY c.embedding <=> target.embedding
    LIMIT ${maxLimit}
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
  return result.rows.map((row: any) => ({
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
}
