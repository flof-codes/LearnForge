import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { loadTopicRates, resolveCardRate } from "./change-rate.js";
import { getCurrentOriginals } from "./originals-service.js";
import { getSession } from "./session-service.js";

import { NOT_DISPUTED } from "./study-filters.js";

export interface GetStudyCardsOptions {
  /** A tutor session: the server issues one question ticket per served card. */
  sessionId?: string;
}

export async function getStudyCards(db: Db, userId: string, topicId?: string, rawLimit?: number, opts: GetStudyCardsOptions = {}) {
  const limit = Math.max(1, Math.min(100, rawLimit ?? 10));
  const session = opts.sessionId ? await getSession(db, userId, opts.sessionId) : null;

  // Focus ordering is only applied to the full "study all" flow.
  // When the caller passes an explicit topic_id, they've already chosen scope, so we keep due-ASC.
  const topicFilter = topicId
    ? sql`
        WITH RECURSIVE topic_tree AS (
          SELECT id FROM topics WHERE id = ${topicId}::uuid AND user_id = ${userId}
          UNION ALL
          SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
        )
        SELECT c.id, c.concept, c.front_html, c.back_html, c.topic_id, c.tags,
               c.card_type, c.cloze_data, c.change_rate, c.current_original_id,
               fs.stability, fs.difficulty, fs.due, fs.reps, fs.lapses, fs.state, fs.last_review,
               bs.current_level, bs.highest_reached, bs.progress
        FROM cards c
        JOIN fsrs_state fs ON fs.card_id = c.id
        LEFT JOIN bloom_state bs ON bs.card_id = c.id
        WHERE fs.due <= NOW()
          AND c.topic_id IN (SELECT id FROM topic_tree)
          AND ${NOT_DISPUTED}
        ORDER BY fs.due ASC
        LIMIT ${limit}
      `
    : sql`
        WITH RECURSIVE active_focus AS (
          SELECT topic_id, priority
          FROM focus_topics
          WHERE user_id = ${userId}
            AND (expires_at IS NULL OR expires_at > NOW())
        ),
        focus_tree AS (
          SELECT af.topic_id, af.priority FROM active_focus af
          UNION ALL
          SELECT t.id, ft.priority
          FROM topics t
          JOIN focus_tree ft ON t.parent_id = ft.topic_id
          WHERE t.user_id = ${userId}
        ),
        topic_priority AS (
          SELECT topic_id, MIN(priority) AS priority FROM focus_tree GROUP BY topic_id
        )
        SELECT c.id, c.concept, c.front_html, c.back_html, c.topic_id, c.tags,
               c.card_type, c.cloze_data, c.change_rate, c.current_original_id,
               fs.stability, fs.difficulty, fs.due, fs.reps, fs.lapses, fs.state, fs.last_review,
               bs.current_level, bs.highest_reached, bs.progress
        FROM cards c
        JOIN fsrs_state fs ON fs.card_id = c.id
        LEFT JOIN bloom_state bs ON bs.card_id = c.id
        JOIN topics t ON c.topic_id = t.id
        LEFT JOIN topic_priority tp ON tp.topic_id = c.topic_id
        WHERE fs.due <= NOW()
          AND t.user_id = ${userId}
          AND ${NOT_DISPUTED}
        ORDER BY tp.priority ASC NULLS LAST, fs.due ASC
        LIMIT ${limit}
      `;

  const result = await db.execute<{
    id: string; concept: string; front_html: string; back_html: string;
    topic_id: string; tags: string[] | null;
    card_type: string; cloze_data: unknown; change_rate: number | null; current_original_id: string | null;
    stability: number; difficulty: number; due: string; reps: number; lapses: number; state: number; last_review: string | null;
    current_level: number | null; highest_reached: number | null; progress: number | null;
  }>(topicFilter);

  const cardIds = result.rows.map((r) => r.id);

  // Effective change rate per card, resolved once for the whole batch.
  const topicRates = await loadTopicRates(db, userId);
  const rates = new Map(result.rows.map(r => [r.id, resolveCardRate({ changeRate: r.change_rate, topicId: r.topic_id }, topicRates)]));
  const originals = await getCurrentOriginals(db, userId, cardIds);

  // Tickets: freeze level, rate and original before the tutor asks anything.
  const tickets = new Map<string, string>();
  if (session && cardIds.length > 0) {
    const values = sql.join(result.rows.map(r => {
      const rate = rates.get(r.id)!;
      return sql`(${session.id}::uuid, ${r.id}::uuid, ${originals.get(r.id)?.id ?? null}::uuid, ${r.current_level ?? 0}, ${rate.changeRate}, ${rate.rateSource}, ${r.last_review}::timestamptz)`;
    }), sql`, `);
    const inserted = await db.execute<{ id: string; card_id: string }>(sql`
      INSERT INTO study_questions (session_id, card_id, original_id, card_level, change_rate, rate_source, last_review_at_serve)
      VALUES ${values}
      RETURNING id, card_id
    `);
    for (const t of inserted.rows) tickets.set(t.card_id, t.id);
    await db.execute(sql`UPDATE study_sessions SET last_activity = NOW() WHERE id = ${session.id}`);
  }

  const reviewsByCard = new Map<string, Array<{ bloomLevel: number; rating: number; questionText: string; answerExpected: string | null; userAnswer: string | null; reviewedAt: string }>>();

  if (cardIds.length > 0) {
    const cardIdList = sql.join(cardIds.map(id => sql`${id}::uuid`), sql`, `);
    const reviewResult = await db.execute<{
      card_id: string; bloom_level: number; rating: number; question_text: string;
      answer_expected: string | null; user_answer: string | null; reviewed_at: string;
    }>(sql`
      SELECT card_id, bloom_level, rating, question_text, answer_expected, user_answer, reviewed_at
      FROM reviews
      WHERE card_id IN (${cardIdList})
      ORDER BY reviewed_at DESC
    `);

    for (const r of reviewResult.rows) {
      const list = reviewsByCard.get(r.card_id) ?? [];
      list.push({
        bloomLevel: r.bloom_level,
        rating: r.rating,
        questionText: r.question_text,
        answerExpected: r.answer_expected,
        userAnswer: r.user_answer,
        reviewedAt: r.reviewed_at,
      });
      reviewsByCard.set(r.card_id, list);
    }
  }

  return result.rows.map((row) => ({
    id: row.id,
    concept: row.concept,
    frontHtml: row.front_html,
    backHtml: row.back_html,
    topicId: row.topic_id,
    tags: row.tags ?? [],
    cardType: row.card_type,
    clozeData: row.cloze_data,
    bloomState: {
      currentLevel: row.current_level ?? 0,
      highestReached: row.highest_reached ?? 0,
      progress: row.progress ?? 0,
    },
    fsrsState: {
      due: row.due,
      stability: row.stability,
      difficulty: row.difficulty,
      reps: row.reps,
      lapses: row.lapses,
      state: row.state,
    },
    changeRate: rates.get(row.id)!.changeRate,
    rateSource: rates.get(row.id)!.rateSource,
    original: originals.get(row.id) ?? null,
    questionId: tickets.get(row.id) ?? null,
    sessionDifficulty: session?.sessionDifficulty ?? null,
    reviews: reviewsByCard.get(row.id) ?? [],
    // Display order for generated options. Ignored at change rate 0, where the
    // original's option order is kept.
    optionShuffle: Array.from({ length: 6 }, (_, i) => i + 1).sort(() => Math.random() - 0.5),
  }));
}

export async function getStudySummary(db: Db, userId: string, topicId?: string) {
  const topicCte = topicId
    ? sql`
        WITH RECURSIVE topic_tree AS (
          SELECT id FROM topics WHERE id = ${topicId}::uuid AND user_id = ${userId}
          UNION ALL
          SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
        )
      `
    : sql``;

  const cardFilter = topicId
    ? sql`WHERE c.topic_id IN (SELECT id FROM topic_tree)`
    : sql`JOIN topics t ON c.topic_id = t.id WHERE t.user_id = ${userId}`;

  // Total cards, due count (excludes new), and new count
  const countsResult = await db.execute<{
    total_cards: number; due_count: number; new_count: number;
  }>(sql`
    ${topicCte}
    SELECT
      count(*)::int AS total_cards,
      count(*) FILTER (WHERE fs.due <= NOW() AND fs.state > 0 AND ${NOT_DISPUTED})::int AS due_count,
      count(*) FILTER (WHERE fs.state = 0 AND ${NOT_DISPUTED})::int AS new_count
    FROM cards c
    JOIN fsrs_state fs ON fs.card_id = c.id
    ${cardFilter}
  `);

  const { total_cards, due_count, new_count } = countsResult.rows[0] ?? { total_cards: 0, due_count: 0, new_count: 0 };

  // Bloom level distribution
  const bloomResult = await db.execute<{ level: number; count: number }>(sql`
    ${topicCte}
    SELECT COALESCE(bs.current_level, 0) AS level, count(*)::int AS count
    FROM cards c
    LEFT JOIN bloom_state bs ON bs.card_id = c.id
    ${cardFilter}
    GROUP BY level
    ORDER BY level
  `);

  const bloomLevels: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of bloomResult.rows) {
    bloomLevels[row.level] = row.count;
  }

  // Bloom × card-state cross-tabulation
  const matrixResult = await db.execute<{ bloom_level: number; card_state: string; count: number }>(sql`
    ${topicCte}
    SELECT
      COALESCE(bs.current_level, 0) AS bloom_level,
      CASE
        WHEN fs.state = 0 THEN 'new'
        WHEN fs.state = 1 THEN 'learning'
        WHEN fs.state = 3 THEN 'relearning'
        WHEN fs.state = 2 AND fs.due <= NOW() THEN 'recall'
        WHEN fs.state = 2 AND fs.stability < 21 THEN 'shortTerm'
        WHEN fs.state = 2 AND fs.stability >= 21 AND fs.stability < 90 THEN 'midTerm'
        WHEN fs.state = 2 AND fs.stability >= 90 THEN 'longTerm'
      END AS card_state,
      COUNT(*)::int AS count
    FROM cards c
    JOIN fsrs_state fs ON fs.card_id = c.id
    LEFT JOIN bloom_state bs ON bs.card_id = c.id
    ${cardFilter}
    GROUP BY bloom_level, card_state
    ORDER BY bloom_level, card_state
  `);

  const bloomStateMatrix: Record<number, Record<string, number>> = {};
  for (let i = 0; i <= 5; i++) {
    bloomStateMatrix[i] = { new: 0, learning: 0, relearning: 0, recall: 0, shortTerm: 0, midTerm: 0, longTerm: 0 };
  }
  for (const row of matrixResult.rows) {
    if (bloomStateMatrix[row.bloom_level]) {
      bloomStateMatrix[row.bloom_level][row.card_state] = row.count;
    }
  }

  // Accuracy over last 7 days
  const accuracyResult = await db.execute<{ accuracy: number | null }>(sql`
    ${topicCte}
    SELECT AVG(
      CASE
        WHEN r.correctness IS NOT NULL THEN r.correctness * 100
        WHEN r.rating = 4 THEN 100
        WHEN r.rating = 3 THEN 75
        WHEN r.rating = 2 THEN 50
        WHEN r.rating = 1 THEN 25
        ELSE 0
      END
    )::double precision AS accuracy
    FROM reviews r
    JOIN cards c ON c.id = r.card_id
    ${cardFilter}
    AND r.reviewed_at >= NOW() - INTERVAL '7 days'
  `);

  const accuracy7d = accuracyResult.rows[0]?.accuracy ?? null;

  // Distinct review dates for streak calculation
  const streakDaysQuery = topicId
    ? sql`
        ${topicCte}
        SELECT DISTINCT (r.reviewed_at AT TIME ZONE 'UTC')::date AS d
        FROM reviews r
        JOIN cards c ON c.id = r.card_id
        WHERE c.topic_id IN (SELECT id FROM topic_tree)
          AND (r.reviewed_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 365
        ORDER BY d DESC
      `
    : sql`
        SELECT DISTINCT (r.reviewed_at AT TIME ZONE 'UTC')::date AS d
        FROM reviews r
        JOIN cards c ON c.id = r.card_id
        JOIN topics t ON c.topic_id = t.id
        WHERE t.user_id = ${userId}
          AND (r.reviewed_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 365
        ORDER BY d DESC
      `;
  const streakDaysResult = await db.execute<{ d: string }>(streakDaysQuery);

  // Distinct creation dates for creation streak
  const creationDaysQuery = topicId
    ? sql`
        ${topicCte}
        SELECT DISTINCT (c.created_at AT TIME ZONE 'UTC')::date AS d
        FROM cards c
        WHERE c.topic_id IN (SELECT id FROM topic_tree)
          AND (c.created_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 365
        ORDER BY d DESC
      `
    : sql`
        SELECT DISTINCT (c.created_at AT TIME ZONE 'UTC')::date AS d
        FROM cards c
        JOIN topics t ON c.topic_id = t.id
        WHERE t.user_id = ${userId}
          AND (c.created_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 365
        ORDER BY d DESC
      `;
  const creationDaysResult = await db.execute<{ d: string }>(creationDaysQuery);

  // Calculate streaks
  const reviewDates = new Set(streakDaysResult.rows.map(r => String(r.d).slice(0, 10)));
  const creationDates = new Set(creationDaysResult.rows.map(r => String(r.d).slice(0, 10)));
  const today = new Date();

  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const check = new Date(today);
    check.setDate(today.getDate() - i);
    const dateStr = check.toISOString().slice(0, 10);
    if (reviewDates.has(dateStr)) {
      streak++;
    } else if (i === 0) {
      continue; // today has no review yet, check from yesterday
    } else {
      break;
    }
  }

  let creationStreak = 0;
  for (let i = 0; i < 366; i++) {
    const check = new Date(today);
    check.setDate(today.getDate() - i);
    const dateStr = check.toISOString().slice(0, 10);
    if (creationDates.has(dateStr)) {
      creationStreak++;
    } else if (i === 0) {
      continue; // today has no creation yet, check from yesterday
    } else {
      break;
    }
  }

  return {
    totalCards: total_cards,
    dueCount: due_count,
    newCount: new_count,
    bloomLevels,
    bloomStateMatrix,
    accuracy7d: accuracy7d !== null ? Math.round(accuracy7d * 100) / 100 : null,
    streak,
    creationStreak,
  };
}
