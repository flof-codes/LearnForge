import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@learnforge/core/schema";
import { backfillEmbeddings } from "@learnforge/core";

const args = process.argv.slice(2);
const batchSize = parseInt(args.find(a => a.startsWith("--batch-size="))?.split("=")[1] ?? "10", 10);
const userId = args.find(a => a.startsWith("--user-id="))?.split("=")[1];
const dryRun = args.includes("--dry-run");

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://learnforge:learnforge@localhost:5432/learnforge";
const pool = new pg.Pool({ connectionString: databaseUrl });
const db = drizzle(pool, { schema });

console.log(`Backfill embeddings${dryRun ? " (DRY RUN)" : ""}`);
console.log(`  batch size: ${batchSize}`);
if (userId) console.log(`  user: ${userId}`);
console.log("");

try {
  for await (const progress of backfillEmbeddings(db, { batchSize, userId, dryRun })) {
    const pct = Math.round(((progress.processed + progress.failed) / progress.total) * 100);
    console.log(`[${progress.processed + progress.failed}/${progress.total}] (${pct}%) ${progress.current}...`);
  }
  console.log("\nDone.");
} catch (err) {
  console.error("Backfill failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
