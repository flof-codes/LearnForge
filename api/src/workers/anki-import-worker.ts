import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@learnforge/core/schema";
import {
  readAnkiPackage, previewAnkiPackage, importAnkiPackage, ValidationError,
  markImportStaged, markImportRunning, setImportProgress, markImportDone, markImportFailed,
  type AnkiScheduleMode, type Db,
} from "@learnforge/core";

/**
 * Runs one Anki job off the main thread: parsing a package is synchronous
 * (unzip, zstd, SQLite) and would otherwise stall every request of every user.
 * The worker has its own small database pool and never loads the embedding
 * model; the main thread fills embeddings once the import is done.
 */

export interface AnkiJobData {
  importId: string;
  userId: string;
  mode: "analyze" | "import";
  stagedPath: string;
  schedule: AnkiScheduleMode;
  databaseUrl: string;
  imagePath: string;
  mediaQuotaBytes: number;
  /** Removed by the runner when the job ends, also after a timeout. */
  tempDir: string;
}

const job = workerData as AnkiJobData;
const pool = new pg.Pool({ connectionString: job.databaseUrl, max: 2 });
pool.on("error", (err) => console.error("[anki-import] pool error:", err));
const db = drizzle(pool, { schema }) as unknown as Db;

async function run() {
  const pkg = readAnkiPackage(await readFile(job.stagedPath), undefined, { tempDir: job.tempDir });
  try {
    if (job.mode === "analyze") {
      const preview = await previewAnkiPackage(db, job.userId, pkg);
      await markImportStaged(db, job.importId, pkg.version, preview, pkg.notes.length);
      return;
    }
    await markImportRunning(db, job.importId, pkg.notes.length);
    const stats = await importAnkiPackage(db, job.userId, job.importId, pkg, {
      schedule: job.schedule,
      mediaDir: job.imagePath,
      mediaQuotaBytes: job.mediaQuotaBytes,
      onProgress: (done) => setImportProgress(db, job.importId, done),
    });
    await markImportDone(db, job.importId, stats);
  } finally {
    pkg.close();
  }
}

run()
  .then(() => parentPort?.postMessage({ ok: true }))
  .catch(async (err: unknown) => {
    // A ValidationError is a message for the user (bad or oversized package); anything else is ours.
    const message = err instanceof ValidationError ? err.message : "The import failed unexpectedly";
    if (!(err instanceof ValidationError)) console.error("[anki-import] job failed:", err);
    await markImportFailed(db, job.importId, message).catch(() => {});
    parentPort?.postMessage({ ok: false, error: message });
  })
  .finally(() => pool.end().catch(() => {}));
