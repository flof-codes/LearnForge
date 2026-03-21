#!/usr/bin/env npx tsx
// Backfill embeddings for cards with NULL embedding (after model change).
// Run with: cd api && npx tsx scripts/backfill-embeddings.ts

import pg from "pg";
import { computeEmbedding, buildEmbeddingText } from "../src/services/embeddings.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://learnforge:learnforge@localhost:5432/learnforge";

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<{ id: string; concept: string; tags: string[] | null; front_html: string; back_html: string }>(
      `SELECT id, concept, tags, front_html, back_html FROM cards WHERE embedding IS NULL`
    );

    console.log(`Found ${rows.length} cards to backfill`);

    for (let i = 0; i < rows.length; i++) {
      const card = rows[i];
      const text = buildEmbeddingText(card.concept, card.tags ?? [], card.front_html, card.back_html);
      const embedding = await computeEmbedding(text);
      if (!embedding) {
        console.log(`Skipping card ${i + 1}/${rows.length} (${card.id}): embedding returned null`);
        continue;
      }
      await client.query(
        `UPDATE cards SET embedding = $1::vector WHERE id = $2`,
        [`[${embedding.join(",")}]`, card.id]
      );
      console.log(`Processing card ${i + 1}/${rows.length}`);
    }

    console.log("Backfill complete");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
