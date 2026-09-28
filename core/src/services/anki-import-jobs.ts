import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import type { AnkiImportStats, AnkiPreview, ScheduleMode } from "./anki-import-shared.js";

/**
 * The job rows of the Anki import: one per uploaded package, moving
 * analyzing → staged → queued → running → done | failed. User-facing reads and
 * writes take the user id; the maintenance functions at the bottom run for the
 * whole server (worker bookkeeping, boot recovery).
 */

export const MAX_OPEN_IMPORTS = 3;
export type AnkiImportStatus = "analyzing" | "staged" | "queued" | "running" | "done" | "failed";

export interface AnkiImportJob {
  id: string;
  filename: string;
  status: AnkiImportStatus;
  packageVersion: string | null;
  options: { schedule: ScheduleMode } | null;
  preview: AnkiPreview | null;
  stats: AnkiImportStats | null;
  error: string | null;
  progress: { done: number; total: number };
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

interface JobRow extends Record<string, unknown> {
  id: string; filename: string; status: AnkiImportStatus; package_version: string | null; options: AnkiImportJob["options"];
  preview: AnkiPreview | null; stats: AnkiImportStats | null; error: string | null; staged_path: string | null;
  progress_done: number; progress_total: number; created_at: string; updated_at: string; finished_at: string | null;
}

function present(r: JobRow): AnkiImportJob {
  return {
    id: r.id, filename: r.filename, status: r.status, packageVersion: r.package_version, options: r.options,
    preview: r.preview, stats: r.stats, error: r.error,
    progress: { done: r.progress_done, total: r.progress_total },
    createdAt: r.created_at, updatedAt: r.updated_at, finishedAt: r.finished_at,
  };
}

async function loadRow(db: Db, userId: string, id: string): Promise<JobRow> {
  const rows = await db.execute<JobRow>(sql`SELECT * FROM anki_imports WHERE id = ${id} AND user_id = ${userId}`);
  if (rows.rows.length === 0) throw new NotFoundError("Import not found");
  return rows.rows[0];
}

/** Checked before the upload is read, so a user at the limit does not upload in vain. */
export async function assertCanStartImport(db: Db, userId: string): Promise<void> {
  const open = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM anki_imports WHERE user_id = ${userId} AND status IN ('analyzing', 'staged', 'queued', 'running')
  `);
  if (open.rows[0].n >= MAX_OPEN_IMPORTS) throw new ValidationError("Finish or discard your open imports first");
}

/** Records a stored upload. The count is checked again under a lock on the user, so parallel uploads cannot pass the limit. */
export async function createImportJob(db: Db, userId: string, input: { id: string; filename: string; stagedPath: string }): Promise<AnkiImportJob> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    await assertCanStartImport(tx as unknown as Db, userId);
    await tx.execute(sql`
      INSERT INTO anki_imports (id, user_id, filename, status, staged_path)
      VALUES (${input.id}, ${userId}, ${input.filename}, 'analyzing', ${input.stagedPath})
    `);
  });
  return getImportJob(db, userId, input.id);
}

export async function getImportJob(db: Db, userId: string, id: string): Promise<AnkiImportJob> {
  return present(await loadRow(db, userId, id));
}

export async function listImportJobs(db: Db, userId: string): Promise<AnkiImportJob[]> {
  const rows = await db.execute<JobRow>(sql`SELECT * FROM anki_imports WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 20`);
  return rows.rows.map(present);
}

/** Moves a staged import to the queue. The status flip is the lock: a second commit finds nothing to claim. */
export async function claimImportJob(db: Db, userId: string, id: string, schedule: ScheduleMode): Promise<{ job: AnkiImportJob; stagedPath: string }> {
  const claimed = await db.execute<{ staged_path: string }>(sql`
    UPDATE anki_imports SET status = 'queued', options = ${JSON.stringify({ schedule })}::jsonb, updated_at = NOW()
    WHERE id = ${id} AND user_id = ${userId} AND status = 'staged' AND staged_path IS NOT NULL
    RETURNING staged_path
  `);
  if (claimed.rows.length === 0) {
    await loadRow(db, userId, id); // someone else's import: 404
    throw new ValidationError("This import is not waiting to be started");
  }
  return { job: await getImportJob(db, userId, id), stagedPath: claimed.rows[0].staged_path };
}

/** Removes a finished or staged import; returns the staged file to delete, if any. The records it wrote stay. */
export async function deleteImportJob(db: Db, userId: string, id: string): Promise<{ stagedPath: string | null }> {
  const row = await loadRow(db, userId, id);
  if (["analyzing", "queued", "running"].includes(row.status)) throw new ValidationError("The import is still running");
  await db.execute(sql`DELETE FROM anki_imports WHERE id = ${id} AND user_id = ${userId}`);
  return { stagedPath: row.staged_path };
}

// ── Maintenance (worker and server, no user context) ─────────────────────

export async function markImportStaged(db: Db, id: string, version: string, preview: AnkiPreview, noteCount: number) {
  await db.execute(sql`
    UPDATE anki_imports SET status = 'staged', package_version = ${version}, preview = ${JSON.stringify(preview)}::jsonb,
      progress_total = ${noteCount}, updated_at = NOW()
    WHERE id = ${id}
  `);
}

export async function markImportRunning(db: Db, id: string, noteCount: number) {
  await db.execute(sql`UPDATE anki_imports SET status = 'running', progress_done = 0, progress_total = ${noteCount}, updated_at = NOW() WHERE id = ${id}`);
}

export async function setImportProgress(db: Db, id: string, done: number) {
  await db.execute(sql`UPDATE anki_imports SET progress_done = ${done}, updated_at = NOW() WHERE id = ${id}`);
}

export async function markImportDone(db: Db, id: string, stats: AnkiImportStats) {
  await db.execute(sql`UPDATE anki_imports SET status = 'done', stats = ${JSON.stringify(stats)}::jsonb, finished_at = NOW(), updated_at = NOW() WHERE id = ${id}`);
}

/** Fails a job unless it already finished; returns its status afterwards. */
export async function markImportFailed(db: Db, id: string, message: string): Promise<AnkiImportStatus | null> {
  await db.execute(sql`
    UPDATE anki_imports SET status = 'failed', error = ${message}, finished_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND status NOT IN ('done', 'failed')
  `);
  const row = await db.execute<{ status: AnkiImportStatus }>(sql`SELECT status FROM anki_imports WHERE id = ${id}`);
  return row.rows[0]?.status ?? null;
}

export async function importStatus(db: Db, id: string): Promise<AnkiImportStatus | null> {
  const row = await db.execute<{ status: AnkiImportStatus }>(sql`SELECT status FROM anki_imports WHERE id = ${id}`);
  return row.rows[0]?.status ?? null;
}

export async function clearStagedPath(db: Db, id: string) {
  await db.execute(sql`UPDATE anki_imports SET staged_path = NULL WHERE id = ${id}`);
}

/**
 * Jobs in flight when the server stopped cannot resume; uploads staged longer
 * than `ttlHours` expire. Returns the staged files that are no longer needed.
 */
export async function sweepAnkiImports(db: Db, opts: { interrupted: boolean; ttlHours: number }): Promise<string[]> {
  if (opts.interrupted) {
    await db.execute(sql`
      UPDATE anki_imports SET status = 'failed', error = 'The server restarted during the import; start it again', finished_at = NOW(), updated_at = NOW()
      WHERE status IN ('analyzing', 'queued', 'running')
    `);
  }
  await db.execute(sql`
    UPDATE anki_imports SET status = 'failed', error = 'The upload expired before it was imported', finished_at = NOW(), updated_at = NOW()
    WHERE status = 'staged' AND updated_at < NOW() - make_interval(hours => ${opts.ttlHours})
  `);
  const stale = await db.execute<{ staged_path: string }>(sql`
    WITH stale AS (
      SELECT id, staged_path FROM anki_imports WHERE status IN ('failed', 'done') AND staged_path IS NOT NULL FOR UPDATE
    )
    UPDATE anki_imports a SET staged_path = NULL FROM stale WHERE a.id = stale.id
    RETURNING stale.staged_path
  `);
  return stale.rows.map(r => r.staged_path).filter(Boolean);
}

/** Users whose imported cards still wait for an embedding (a restart can cut the backfill short). */
export async function usersMissingEmbeddings(db: Db): Promise<string[]> {
  const rows = await db.execute<{ user_id: string }>(sql`
    SELECT DISTINCT n.user_id FROM cards c JOIN notes n ON n.id = c.note_id
    WHERE c.embedding IS NULL AND n.anki_guid IS NOT NULL
  `);
  return rows.rows.map(r => r.user_id);
}
