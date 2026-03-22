import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { computeEmbedding, buildEmbeddingText } from "./embeddings.js";

export interface BackfillOptions {
  batchSize?: number;
  userId?: string;
  dryRun?: boolean;
}

export interface BackfillProgress {
  processed: number;
  failed: number;
  total: number;
  current?: string;
}

export async function* backfillEmbeddings(
  db: Db,
  options?: BackfillOptions,
): AsyncGenerator<BackfillProgress> {
  const batchSize = options?.batchSize ?? 10;
  const dryRun = options?.dryRun ?? false;

  const userFilter = options?.userId
    ? sql`AND t.user_id = ${options.userId}`
    : sql``;

  // Count total cards needing backfill
  const countResult = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text as count FROM cards c
    JOIN topics t ON c.topic_id = t.id
    WHERE c.embedding IS NULL ${userFilter}
  `);
  const total = parseInt(countResult.rows[0].count, 10);

  let processed = 0;
  let failed = 0;

  while (processed + failed < total) {
    const batch = await db.execute<{
      id: string; concept: string; tags: string[] | null;
      front_html: string; back_html: string;
    }>(sql`
      SELECT c.id, c.concept, c.tags, c.front_html, c.back_html
      FROM cards c
      JOIN topics t ON c.topic_id = t.id
      WHERE c.embedding IS NULL ${userFilter}
      ORDER BY c.created_at ASC
      LIMIT ${batchSize}
    `);

    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      const text = buildEmbeddingText(
        row.concept,
        row.tags ?? [],
        row.front_html,
        row.back_html,
      );

      const embedding = await computeEmbedding(text);

      if (embedding && !dryRun) {
        const vecLiteral = `[${embedding.join(",")}]`;
        await db.execute(sql`
          UPDATE cards SET embedding = ${vecLiteral}::vector(1024)
          WHERE id = ${row.id}
        `);
        processed++;
      } else if (embedding && dryRun) {
        processed++;
      } else {
        failed++;
      }

      yield {
        processed,
        failed,
        total,
        current: row.concept.slice(0, 60),
      };
    }
  }
}
