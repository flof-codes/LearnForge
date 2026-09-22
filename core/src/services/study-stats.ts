import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NOT_DISPUTED } from "./study-filters.js";

// Forecast and Anki-style statistics, split out of study-service.ts to keep that file readable.

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
    WHERE fs.due <= NOW() AND fs.state > 0 AND ${NOT_DISPUTED}
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
        AND ${NOT_DISPUTED}
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
        AND ${NOT_DISPUTED}
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
  // Query 1: Card states + review volumes + cards created today (shared CTE)
  const statsQuery = topicId
    ? sql`
        WITH RECURSIVE topic_tree AS (
          SELECT id FROM topics WHERE id = ${topicId}::uuid AND user_id = ${userId}
          UNION ALL
          SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
        ),
        card_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE fs.state = 0)::int AS new_count,
            COUNT(*) FILTER (WHERE fs.state = 1)::int AS learning_count,
            COUNT(*) FILTER (WHERE fs.state = 3)::int AS relearning_count,
            COUNT(*) FILTER (WHERE fs.state = 2 AND fs.stability < 21)::int AS short_term_count,
            COUNT(*) FILTER (WHERE fs.state = 2 AND fs.stability >= 21 AND fs.stability < 90)::int AS mid_term_count,
            COUNT(*) FILTER (WHERE fs.state = 2 AND fs.stability >= 90)::int AS long_term_count,
            COUNT(*) FILTER (WHERE fs.due <= NOW() AND fs.state > 0 AND ${NOT_DISPUTED})::int AS due_count,
            COUNT(*) FILTER (WHERE c.created_at::date = CURRENT_DATE)::int AS cards_created_today
          FROM cards c
          JOIN fsrs_state fs ON fs.card_id = c.id
          WHERE c.topic_id IN (SELECT id FROM topic_tree)
        ),
        review_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE r.reviewed_at::date = CURRENT_DATE)::int AS reviews_today,
            COUNT(*) FILTER (WHERE r.reviewed_at >= NOW() - INTERVAL '30 days')::int AS reviews_30d,
            COUNT(*) FILTER (WHERE r.reviewed_at >= NOW() - INTERVAL '365 days')::int AS reviews_365d
          FROM reviews r
          JOIN cards c ON c.id = r.card_id
          WHERE c.topic_id IN (SELECT id FROM topic_tree)
        )
        SELECT * FROM card_stats CROSS JOIN review_stats
      `
    : sql`
        WITH card_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE fs.state = 0)::int AS new_count,
            COUNT(*) FILTER (WHERE fs.state = 1)::int AS learning_count,
            COUNT(*) FILTER (WHERE fs.state = 3)::int AS relearning_count,
            COUNT(*) FILTER (WHERE fs.state = 2 AND fs.stability < 21)::int AS short_term_count,
            COUNT(*) FILTER (WHERE fs.state = 2 AND fs.stability >= 21 AND fs.stability < 90)::int AS mid_term_count,
            COUNT(*) FILTER (WHERE fs.state = 2 AND fs.stability >= 90)::int AS long_term_count,
            COUNT(*) FILTER (WHERE fs.due <= NOW() AND fs.state > 0 AND ${NOT_DISPUTED})::int AS due_count,
            COUNT(*) FILTER (WHERE c.created_at::date = CURRENT_DATE)::int AS cards_created_today
          FROM cards c
          JOIN fsrs_state fs ON fs.card_id = c.id
          JOIN topics t ON c.topic_id = t.id
          WHERE t.user_id = ${userId}
        ),
        review_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE r.reviewed_at::date = CURRENT_DATE)::int AS reviews_today,
            COUNT(*) FILTER (WHERE r.reviewed_at >= NOW() - INTERVAL '30 days')::int AS reviews_30d,
            COUNT(*) FILTER (WHERE r.reviewed_at >= NOW() - INTERVAL '365 days')::int AS reviews_365d
          FROM reviews r
          JOIN cards c ON c.id = r.card_id
          JOIN topics t ON c.topic_id = t.id
          WHERE t.user_id = ${userId}
        )
        SELECT * FROM card_stats CROSS JOIN review_stats
      `;

  const statsResult = await db.execute<{
    new_count: number; learning_count: number; relearning_count: number;
    short_term_count: number; mid_term_count: number; long_term_count: number;
    due_count: number; cards_created_today: number;
    reviews_today: number; reviews_30d: number; reviews_365d: number;
  }>(statsQuery);

  // Query 2: Streak dates — review + creation dates in one query (shared CTE)
  const streakQuery = topicId
    ? sql`
        WITH RECURSIVE topic_tree AS (
          SELECT id FROM topics WHERE id = ${topicId}::uuid AND user_id = ${userId}
          UNION ALL
          SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
        ),
        review_dates AS (
          SELECT DISTINCT (r.reviewed_at AT TIME ZONE 'UTC')::date AS d, 'review' AS source
          FROM reviews r
          JOIN cards c ON c.id = r.card_id
          WHERE c.topic_id IN (SELECT id FROM topic_tree)
            AND (r.reviewed_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 365
        ),
        creation_dates AS (
          SELECT DISTINCT (c.created_at AT TIME ZONE 'UTC')::date AS d, 'creation' AS source
          FROM cards c
          WHERE c.topic_id IN (SELECT id FROM topic_tree)
            AND (c.created_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 365
        )
        SELECT d, source FROM review_dates
        UNION ALL
        SELECT d, source FROM creation_dates
        ORDER BY d DESC
      `
    : sql`
        WITH review_dates AS (
          SELECT DISTINCT (r.reviewed_at AT TIME ZONE 'UTC')::date AS d, 'review' AS source
          FROM reviews r
          JOIN cards c ON c.id = r.card_id
          JOIN topics t ON c.topic_id = t.id
          WHERE t.user_id = ${userId}
            AND (r.reviewed_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 365
        ),
        creation_dates AS (
          SELECT DISTINCT (c.created_at AT TIME ZONE 'UTC')::date AS d, 'creation' AS source
          FROM cards c
          JOIN topics t ON c.topic_id = t.id
          WHERE t.user_id = ${userId}
            AND (c.created_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 365
        )
        SELECT d, source FROM review_dates
        UNION ALL
        SELECT d, source FROM creation_dates
        ORDER BY d DESC
      `;

  const streakResult = await db.execute<{ d: string; source: string }>(streakQuery);

  // Split streak dates by source
  const reviewDates = new Set<string>();
  const creationDates = new Set<string>();
  for (const row of streakResult.rows) {
    const dateStr = String(row.d).slice(0, 10);
    if (row.source === 'review') reviewDates.add(dateStr);
    else creationDates.add(dateStr);
  }

  // Calculate streaks in application code
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

  const row = statsResult.rows[0] ?? {
    new_count: 0, learning_count: 0, relearning_count: 0,
    short_term_count: 0, mid_term_count: 0, long_term_count: 0,
    due_count: 0, cards_created_today: 0,
    reviews_today: 0, reviews_30d: 0, reviews_365d: 0,
  };

  return {
    streak,
    creationStreak,
    reviewsToday: row.reviews_today,
    cardsCreatedToday: row.cards_created_today,
    averagePerDay: Math.round((row.reviews_30d / 30) * 10) / 10,
    averagePerMonth: Math.round((row.reviews_365d / 12) * 10) / 10,
    averagePerYear: row.reviews_365d,
    dueCount: row.due_count,
    cardStates: {
      new: row.new_count,
      learning: row.learning_count,
      relearning: row.relearning_count,
      shortTerm: row.short_term_count,
      midTerm: row.mid_term_count,
      longTerm: row.long_term_count,
    },
  };
}
