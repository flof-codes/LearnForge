import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";

export default async function contextRoutes(app: FastifyInstance) {

  // GET /context/topic/:id?depth — cards for topic and descendants with depth limit
  app.get<{ Params: { id: string }; Querystring: { depth?: string } }>("/context/topic/:id", async (req) => {
    const { id } = req.params;
    const depth = req.query.depth ? parseInt(req.query.depth, 10) : 100;
    const userId = getUserId(req);

    const result = await db.execute(sql`
      WITH RECURSIVE topic_tree AS (
        SELECT id, 0 as depth FROM topics WHERE id = ${id} AND user_id = ${userId}
        UNION ALL
        SELECT t.id, tt.depth + 1 FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
        WHERE tt.depth < ${depth}
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
  });

  // GET /context/similar/:card_id?limit — pgvector cosine similarity search
  app.get<{ Params: { card_id: string }; Querystring: { limit?: string } }>("/context/similar/:card_id", async (req) => {
    const { card_id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 15;
    const userId = getUserId(req);

    // Check if the source card exists and belongs to user
    const sourceCheck = await db.execute(sql`
      SELECT c.id FROM cards c
      JOIN topics t ON c.topic_id = t.id
      WHERE c.id = ${card_id} AND t.user_id = ${userId}
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
      CROSS JOIN (SELECT embedding FROM cards WHERE id = ${card_id}) target
      JOIN topics t ON c.topic_id = t.id
      LEFT JOIN bloom_state bs ON bs.card_id = c.id
      LEFT JOIN reviews r ON r.card_id = c.id
      WHERE c.id != ${card_id} AND c.embedding IS NOT NULL AND t.user_id = ${userId}
      GROUP BY c.id, c.concept, c.tags, c.topic_id, bs.current_level, bs.highest_reached, target.embedding, c.embedding
      ORDER BY c.embedding <=> target.embedding
      LIMIT ${limit}
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
  });
}
