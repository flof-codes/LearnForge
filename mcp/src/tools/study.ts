import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export function registerStudyTools(server: McpServer, userId: string) {
  server.tool(
    "get_study_cards",
    "Get cards ready to study (new + due for review), optionally filtered by topic (includes descendants)",
    {
      topic_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(10).optional(),
    },
    async ({ topic_id, limit: rawLimit }) => {
      try {
        const limit = rawLimit ?? 10;

        const topicFilter = topic_id
          ? sql`
              WITH RECURSIVE topic_tree AS (
                SELECT id FROM topics WHERE id = ${topic_id}::uuid AND user_id = ${userId}
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
          id: string;
          concept: string;
          front_html: string;
          back_html: string;
          topic_id: string;
          tags: string[] | null;
          stability: number;
          difficulty: number;
          due: string;
          reps: number;
          lapses: number;
          state: number;
          current_level: number | null;
          highest_reached: number | null;
        }>(topicFilter);

        const cardIds = result.rows.map((r) => r.id);

        const reviewsByCard = new Map<string, Array<{ bloomLevel: number; rating: number; questionText: string; answerExpected: string | null; userAnswer: string | null; reviewedAt: string }>>();

        if (cardIds.length > 0) {
          const reviewResult = await db.execute<{
            card_id: string;
            bloom_level: number;
            rating: number;
            question_text: string;
            answer_expected: string | null;
            user_answer: string | null;
            reviewed_at: string;
          }>(sql`
            SELECT card_id, bloom_level, rating, question_text, answer_expected, user_answer, reviewed_at
            FROM reviews
            WHERE card_id IN (${sql.join(cardIds.map(id => sql`${id}::uuid`), sql`, `)})
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

        const cards = result.rows.map((row) => ({
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

        return { content: [{ type: "text" as const, text: JSON.stringify(cards, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "get_due_forecast",
    "Get a forecast of when cards are due, bucketed by day (month range) or month (year range)",
    {
      topic_id: z.string().uuid().optional(),
      range: z.enum(["month", "year"]).optional().default("month"),
    },
    async ({ topic_id, range: rawRange }) => {
      try {
        const range = rawRange ?? "month";

        const topicCte = topic_id
          ? sql`
              WITH RECURSIVE topic_tree AS (
                SELECT id FROM topics WHERE id = ${topic_id}::uuid AND user_id = ${userId}
                UNION ALL
                SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
              )
            `
          : sql``;

        const cardFilter = topic_id
          ? sql`AND c.topic_id IN (SELECT id FROM topic_tree)`
          : sql``;

        // When no topic_id, we need to join topics to filter by user
        const userJoin = topic_id
          ? sql``
          : sql`JOIN topics t ON c.topic_id = t.id`;

        const userFilter = topic_id
          ? sql``
          : sql`AND t.user_id = ${userId}`;

        // Overdue count (excludes new cards)
        const overdueResult = await db.execute<{ count: number }>(sql`
          ${topicCte}
          SELECT COUNT(*)::int AS count
          FROM cards c
          JOIN fsrs_state fs ON fs.card_id = c.id
          ${userJoin}
          WHERE fs.due <= NOW() AND fs.state > 0
          ${cardFilter}
          ${userFilter}
        `);
        const overdue = overdueResult.rows[0]?.count ?? 0;

        if (range === "month") {
          const bucketsResult = await db.execute<{ due_date: string; count: number }>(sql`
            ${topicCte}
            SELECT DATE(fs.due) AS due_date, COUNT(*)::int AS count
            FROM cards c
            JOIN fsrs_state fs ON fs.card_id = c.id
            ${userJoin}
            WHERE fs.due > NOW()
              AND fs.due <= NOW() + INTERVAL '30 days'
              ${cardFilter}
              ${userFilter}
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

          return { content: [{ type: "text" as const, text: JSON.stringify({ range: "month", buckets, overdue }, null, 2) }] };
        } else {
          const bucketsResult = await db.execute<{ due_month: string; count: number }>(sql`
            ${topicCte}
            SELECT DATE_TRUNC('month', fs.due)::date AS due_month, COUNT(*)::int AS count
            FROM cards c
            JOIN fsrs_state fs ON fs.card_id = c.id
            ${userJoin}
            WHERE fs.due > NOW()
              AND fs.due <= NOW() + INTERVAL '12 months'
              ${cardFilter}
              ${userFilter}
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

          return { content: [{ type: "text" as const, text: JSON.stringify({ range: "year", buckets, overdue }, null, 2) }] };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "get_study_summary",
    "Get a study session summary with total cards, due count, Bloom level distribution, and 7-day accuracy",
    {
      topic_id: z.string().uuid().optional(),
    },
    async ({ topic_id }) => {
      try {
        const topicCte = topic_id
          ? sql`
              WITH RECURSIVE topic_tree AS (
                SELECT id FROM topics WHERE id = ${topic_id}::uuid AND user_id = ${userId}
                UNION ALL
                SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
              )
            `
          : sql``;

        const cardFilter = topic_id
          ? sql`WHERE c.topic_id IN (SELECT id FROM topic_tree)`
          : sql`JOIN topics t ON c.topic_id = t.id WHERE t.user_id = ${userId}`;

        // Total cards, due count (excludes new), and new count
        const countsResult = await db.execute<{
          total_cards: number;
          due_count: number;
          new_count: number;
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
        const bloomResult = await db.execute<{
          level: number;
          count: number;
        }>(sql`
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

        // Accuracy over last 7 days (rating: 4=100%, 3=75%, 2=50%, 1=25%)
        const accuracyResult = await db.execute<{
          accuracy: number | null;
        }>(sql`
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

        const summary = {
          totalCards: total_cards,
          dueCount: due_count,
          newCount: new_count,
          bloomLevels,
          accuracy7d: accuracy7d !== null ? Math.round(accuracy7d * 100) / 100 : null,
        };

        return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
