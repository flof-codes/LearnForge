import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";

export async function getStudyCards(db: Db, userId: string, topicId?: string, rawLimit?: number) {
  const limit = Math.max(1, Math.min(100, rawLimit ?? 10));

  const topicFilter = topicId
    ? sql`
        WITH RECURSIVE topic_tree AS (
          SELECT id FROM topics WHERE id = ${topicId}::uuid AND user_id = ${userId}
          UNION ALL
          SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
        )
        SELECT c.id, c.concept, c.front_html, c.back_html, c.topic_id, c.tags,
               fs.stability, fs.difficulty, fs.due, fs.reps, fs.lapses, fs.state,
               bs.current_level, bs.highest_reached
        FROM cards c
        JOIN fsrs_state fs ON fs.card_id = c.id
        LEFT JOIN bloom_state bs ON bs.card_id = c.id
        WHERE fs.due <= NOW()
          AND c.topic_id IN (SELECT id FROM topic_tree)
        ORDER BY fs.due ASC
        LIMIT ${limit}
      `
    : sql`
        SELECT c.id, c.concept, c.front_html, c.back_html, c.topic_id, c.tags,
               fs.stability, fs.difficulty, fs.due, fs.reps, fs.lapses, fs.state,
               bs.current_level, bs.highest_reached
        FROM cards c
        JOIN fsrs_state fs ON fs.card_id = c.id
        LEFT JOIN bloom_state bs ON bs.card_id = c.id
        JOIN topics t ON c.topic_id = t.id
        WHERE fs.due <= NOW()
          AND t.user_id = ${userId}
        ORDER BY fs.due ASC
        LIMIT ${limit}
      `;

  const result = await db.execute<{
    id: string; concept: string; front_html: string; back_html: string;
    topic_id: string; tags: string[] | null;
    stability: number; difficulty: number; due: string; reps: number; lapses: number; state: number;
    current_level: number | null; highest_reached: number | null;
  }>(topicFilter);

  const cardIds = result.rows.map((r) => r.id);

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
    bloomState: {
      currentLevel: row.current_level ?? 0,
      highestReached: row.highest_reached ?? 0,
    },
    fsrsState: {
      due: row.due,
      stability: row.stability,
      difficulty: row.difficulty,
      reps: row.reps,
      lapses: row.lapses,
      state: row.state,
    },
    reviews: reviewsByCard.get(row.id) ?? [],
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
      count(*) FILTER (WHERE fs.due <= NOW() AND fs.state > 0)::int AS due_count,
      count(*) FILTER (WHERE fs.state = 0)::int AS new_count
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
      CASE r.rating
        WHEN 4 THEN 100
        WHEN 3 THEN 75
        WHEN 2 THEN 50
        WHEN 1 THEN 25
        ELSE 0
      END
    )::double precision AS accuracy
    FROM reviews r
    JOIN cards c ON c.id = r.card_id
    ${cardFilter}
    AND r.reviewed_at >= NOW() - INTERVAL '7 days'
  `);

  const accuracy7d = accuracyResult.rows[0]?.accuracy ?? null;

  return {
    totalCards: total_cards,
    dueCount: due_count,
    newCount: new_count,
    bloomLevels,
    bloomStateMatrix,
    accuracy7d: accuracy7d !== null ? Math.round(accuracy7d * 100) / 100 : null,
  };
}

export async function getDueForecast(db: Db, userId: string, topicId?: string, rawRange?: string) {
  const range = rawRange === "year" ? "year" : "month";

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
    ? sql`AND c.topic_id IN (SELECT id FROM topic_tree)`
    : sql`AND c.topic_id IN (SELECT id FROM topics WHERE user_id = ${userId})`;

  // Overdue count (excludes new cards)
  const overdueResult = await db.execute<{ count: number }>(sql`
    ${topicCte}
    SELECT COUNT(*)::int AS count
    FROM cards c
    JOIN fsrs_state fs ON fs.card_id = c.id
    WHERE fs.due <= NOW() AND fs.state > 0
    ${cardFilter}
  `);
  const overdue = overdueResult.rows[0]?.count ?? 0;

  if (range === "month") {
    const bucketsResult = await db.execute<{ due_date: string; count: number }>(sql`
      ${topicCte}
      SELECT DATE(fs.due) AS due_date, COUNT(*)::int AS count
      FROM cards c
      JOIN fsrs_state fs ON fs.card_id = c.id
      WHERE fs.due > NOW()
        AND fs.due <= NOW() + INTERVAL '30 days'
        ${cardFilter}
      GROUP BY DATE(fs.due)
      ORDER BY due_date
    `);

    const countsByDate = new Map<string, number>();
    for (const row of bucketsResult.rows) {
      countsByDate.set(String(row.due_date).slice(0, 10), row.count);
    }

    const buckets: { label: string; date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
      buckets.push({ label, date: dateStr, count: countsByDate.get(dateStr) ?? 0 });
    }

    return { range: "month" as const, buckets, overdue };
  } else {
    const bucketsResult = await db.execute<{ due_month: string; count: number }>(sql`
      ${topicCte}
      SELECT DATE_TRUNC('month', fs.due)::date AS due_month, COUNT(*)::int AS count
      FROM cards c
      JOIN fsrs_state fs ON fs.card_id = c.id
      WHERE fs.due > NOW()
        AND fs.due <= NOW() + INTERVAL '12 months'
        ${cardFilter}
      GROUP BY DATE_TRUNC('month', fs.due)
      ORDER BY due_month
    `);

    const countsByMonth = new Map<string, number>();
    for (const row of bucketsResult.rows) {
      countsByMonth.set(String(row.due_month).slice(0, 7), row.count);
    }

    const buckets: { label: string; date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthStr = d.toISOString().slice(0, 7);
      const label = d.toLocaleString("en-US", { month: "short" });
      buckets.push({ label, date: monthStr, count: countsByMonth.get(monthStr) ?? 0 });
    }

    return { range: "year" as const, buckets, overdue };
  }
}

export async function getStudyStats(db: Db, userId: string, topicId?: string) {
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

  // Card state counts + due
  const statesResult = await db.execute<{
    new_count: number; learning_count: number; relearning_count: number;
    short_term_count: number; mid_term_count: number; long_term_count: number; due_count: number;
  }>(sql`
    ${topicCte}
    SELECT
      COUNT(*) FILTER (WHERE fs.state = 0)::int AS new_count,
      COUNT(*) FILTER (WHERE fs.state = 1)::int AS learning_count,
      COUNT(*) FILTER (WHERE fs.state = 3)::int AS relearning_count,
      COUNT(*) FILTER (WHERE fs.state = 2 AND fs.stability < 21)::int AS short_term_count,
      COUNT(*) FILTER (WHERE fs.state = 2 AND fs.stability >= 21 AND fs.stability < 90)::int AS mid_term_count,
      COUNT(*) FILTER (WHERE fs.state = 2 AND fs.stability >= 90)::int AS long_term_count,
      COUNT(*) FILTER (WHERE fs.due <= NOW() AND fs.state > 0)::int AS due_count
    FROM cards c
    JOIN fsrs_state fs ON fs.card_id = c.id
    ${cardFilter}
  `);

  // Review volume
  const reviewsQuery = topicId
    ? sql`
        ${topicCte}
        SELECT
          COUNT(*) FILTER (WHERE r.reviewed_at::date = CURRENT_DATE)::int AS reviews_today,
          COUNT(*) FILTER (WHERE r.reviewed_at >= NOW() - INTERVAL '30 days')::int AS reviews_30d,
          COUNT(*) FILTER (WHERE r.reviewed_at >= NOW() - INTERVAL '365 days')::int AS reviews_365d
        FROM reviews r
        JOIN cards c ON c.id = r.card_id
        WHERE c.topic_id IN (SELECT id FROM topic_tree)
      `
    : sql`
        SELECT
          COUNT(*) FILTER (WHERE r.reviewed_at::date = CURRENT_DATE)::int AS reviews_today,
          COUNT(*) FILTER (WHERE r.reviewed_at >= NOW() - INTERVAL '30 days')::int AS reviews_30d,
          COUNT(*) FILTER (WHERE r.reviewed_at >= NOW() - INTERVAL '365 days')::int AS reviews_365d
        FROM reviews r
        JOIN cards c ON c.id = r.card_id
        JOIN topics t ON c.topic_id = t.id
        WHERE t.user_id = ${userId}
      `;

  const reviewsResult = await db.execute<{
    reviews_today: number; reviews_30d: number; reviews_365d: number;
  }>(reviewsQuery);

  // Distinct review dates for streak calculation
  const daysQuery = topicId
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

  const daysResult = await db.execute<{ d: string }>(daysQuery);

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

  // Cards created today
  const createdTodayQuery = topicId
    ? sql`
        ${topicCte}
        SELECT COUNT(*)::int AS n FROM cards c
        WHERE c.topic_id IN (SELECT id FROM topic_tree)
          AND c.created_at::date = CURRENT_DATE
      `
    : sql`
        SELECT COUNT(*)::int AS n FROM cards c
        JOIN topics t ON c.topic_id = t.id
        WHERE t.user_id = ${userId}
          AND c.created_at::date = CURRENT_DATE
      `;
  const createdTodayResult = await db.execute<{ n: number }>(createdTodayQuery);

  // Calculate streaks in application code
  const reviewDates = new Set(daysResult.rows.map(r => String(r.d).slice(0, 10)));
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

  const states = statesResult.rows[0] ?? {
    new_count: 0, learning_count: 0, relearning_count: 0,
    short_term_count: 0, mid_term_count: 0, long_term_count: 0, due_count: 0,
  };
  const counts = reviewsResult.rows[0] ?? {
    reviews_today: 0, reviews_30d: 0, reviews_365d: 0,
  };

  return {
    streak,
    creationStreak,
    reviewsToday: counts.reviews_today,
    cardsCreatedToday: createdTodayResult.rows[0]?.n ?? 0,
    averagePerDay: Math.round((counts.reviews_30d / 30) * 10) / 10,
    averagePerMonth: Math.round((counts.reviews_365d / 12) * 10) / 10,
    averagePerYear: counts.reviews_365d,
    dueCount: states.due_count,
    cardStates: {
      new: states.new_count,
      learning: states.learning_count,
      relearning: states.relearning_count,
      shortTerm: states.short_term_count,
      midTerm: states.mid_term_count,
      longTerm: states.long_term_count,
    },
  };
}
