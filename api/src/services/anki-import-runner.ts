import { Worker } from "node:worker_threads";
import { readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import {
  backfillEmbeddings, markImportFailed, importStatus, clearStagedPath, sweepAnkiImports, usersMissingEmbeddings,
  type AnkiScheduleMode,
} from "@learnforge/core";
import { db } from "../db/connection.js";
import { config } from "../config.js";
import type { AnkiJobData } from "../workers/anki-import-worker.js";

/**
 * One Anki job at a time, each in its own worker thread with a deadline. The
 * database row is the job's state; a restart marks whatever was in flight as
 * failed, since a half-run job cannot be resumed from memory (re-running the
 * import is safe: notes are keyed by guid, records by Anki key). Each job gets
 * its own temp directory, removed when the job ends however it ends.
 */

const JOB_TIMEOUT_MS = parseInt(process.env.ANKI_JOB_TIMEOUT_MINUTES ?? "30", 10) * 60 * 1000;
const STAGED_TTL_HOURS = 24;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

interface QueuedJob { importId: string; userId: string; mode: "analyze" | "import"; stagedPath: string; schedule: AnkiScheduleMode }

const queue: QueuedJob[] = [];
let running = false;

function workerUrl(): URL {
  // tsx runs the .ts sources in development, the image runs compiled .js.
  const ext = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  return new URL(`../workers/anki-import-worker${ext}`, import.meta.url);
}

const jobTempDir = (importId: string) => path.join(config.importPath, `${importId}.work`);

function runJob(job: QueuedJob): Promise<void> {
  return new Promise((resolve) => {
    const data: AnkiJobData = {
      ...job, databaseUrl: config.databaseUrl, imagePath: config.imagePath, mediaQuotaBytes: config.mediaQuotaBytes,
      tempDir: jobTempDir(job.importId),
    };
    const worker = new Worker(workerUrl(), { workerData: data, resourceLimits: { maxOldGenerationSizeMb: 1536 } });
    let settled = false;
    const finish = async (failure?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const status = failure ? await markImportFailed(db, job.importId, failure).catch(() => null) : await importStatus(db, job.importId).catch(() => null);
      await rm(jobTempDir(job.importId), { recursive: true, force: true }).catch(() => {});
      if (job.mode === "import" || status === "failed") {
        await unlink(job.stagedPath).catch(() => {});
        await clearStagedPath(db, job.importId).catch(() => {});
      }
      if (job.mode === "import" && status === "done") startEmbeddingBackfill(job.userId);
      resolve();
    };
    const timer = setTimeout(() => {
      // Stop the worker first, so the temp directory is not removed under it.
      void worker.terminate().finally(() => finish("The import took too long and was stopped"));
    }, JOB_TIMEOUT_MS);
    worker.on("message", () => void finish());
    worker.on("error", (err) => {
      console.error("[anki-import] worker error:", err);
      void finish("The import failed unexpectedly");
    });
    worker.on("exit", (code) => void finish(code === 0 ? undefined : "The import failed unexpectedly"));
  });
}

async function drain() {
  if (running) return;
  running = true;
  try {
    for (let job = queue.shift(); job; job = queue.shift()) await runJob(job);
  } finally {
    running = false;
  }
}

export function enqueueAnkiJob(job: QueuedJob) {
  queue.push(job);
  void drain();
}

const backfilling = new Set<string>();

/** Imported cards arrive without embeddings; fill them in the background, one user at a time. */
export function startEmbeddingBackfill(userId: string) {
  if (backfilling.has(userId)) return;
  backfilling.add(userId);
  void (async () => {
    try {
      const run = backfillEmbeddings(db, { userId, batchSize: 20, importedOnly: true });
      for (let step = await run.next(); !step.done; step = await run.next()) { /* runs to completion */ }
    } catch (err) {
      console.error("[anki-import] embedding backfill failed:", err);
    } finally {
      backfilling.delete(userId);
    }
  })();
}

async function removeFiles(paths: string[]) {
  for (const p of paths) await unlink(p).catch(() => {});
}

/**
 * At boot: jobs that were in flight are lost, their temp directories go, and
 * cards an interrupted backfill left without embeddings get one. Afterwards an
 * hourly sweep expires uploads that were never committed.
 */
export async function recoverAnkiImports() {
  await removeFiles(await sweepAnkiImports(db, { interrupted: true, ttlHours: STAGED_TTL_HOURS }));
  const entries = await readdir(config.importPath).catch(() => [] as string[]);
  for (const e of entries) if (e.endsWith(".work")) await rm(path.join(config.importPath, e), { recursive: true, force: true }).catch(() => {});
  for (const userId of await usersMissingEmbeddings(db)) startEmbeddingBackfill(userId);
  setInterval(() => {
    sweepAnkiImports(db, { interrupted: false, ttlHours: STAGED_TTL_HOURS })
      .then(removeFiles)
      .catch((err) => console.error("[anki-import] sweep failed:", err));
  }, SWEEP_INTERVAL_MS).unref();
}
