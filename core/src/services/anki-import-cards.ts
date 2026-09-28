import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import type { ImportedSchedule } from "../lib/apkg/schedule.js";
import { RENDERER_VERSION } from "../lib/note-renderer.js";
import { textArray } from "../lib/sql-array.js";
import { stripHtml } from "../lib/strip-html.js";
import { createInitialFsrsState } from "./fsrs.js";
import type { PlannedCard } from "./note-service.js";
import type { AnkiImportStats } from "./anki-import-shared.js";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Writes a note's cards. New (template, gap) pairs are inserted with the
 * schedule `scheduleFor` gives (Anki's or fresh); existing ones get new HTML
 * and keep their schedule. Unsupported note types (image occlusion) are
 * suspended with reason `unsupported`. Embeddings are cleared for the
 * background backfill.
 */
export async function syncImportedCards(
  tx: Tx, noteId: string, topicId: string, planned: PlannedCard[], concept: string, tags: string[], supported: boolean,
  scheduleFor: ((p: PlannedCard) => { schedule: ImportedSchedule; suspendedBy: string | null }) | null,
  stats?: AnkiImportStats,
) {
  const existing = await tx.execute<{ id: string; template_id: string; cloze_number: number; suspended: boolean; suspended_by: string | null }>(sql`
    SELECT id, template_id, cloze_number, suspended, suspended_by FROM cards WHERE note_id = ${noteId}
  `);
  const byKey = new Map(existing.rows.map(c => [`${c.template_id}:${c.cloze_number}`, c]));
  const wanted = new Set<string>();
  const fresh = createInitialFsrsState();
  for (const p of planned) {
    const key = `${p.templateId}:${p.clozeNumber}`;
    wanted.add(key);
    const row = byKey.get(key);
    if (row) {
      await tx.execute(sql`
        UPDATE cards SET front_html = ${p.frontHtml}, back_html = ${p.backHtml}, concept = ${concept}, tags = ${textArray(tags)},
          renderer_version = ${RENDERER_VERSION}, embedding = NULL, updated_at = NOW(),
          suspended = CASE WHEN suspended_by = 'gap' THEN false ELSE suspended END,
          suspended_by = CASE WHEN suspended_by = 'gap' THEN NULL ELSE suspended_by END
        WHERE id = ${row.id}
      `);
      continue;
    }
    const plan = scheduleFor?.(p) ?? { schedule: { ...fresh, due: new Date(), source: "new" as const }, suspendedBy: null };
    const suspendedBy = supported ? plan.suspendedBy : "unsupported";
    const card = await tx.execute<{ id: string }>(sql`
      INSERT INTO cards (topic_id, concept, front_html, back_html, tags, note_id, template_id, cloze_number, renderer_version, suspended, suspended_by)
      VALUES (${topicId}, ${concept}, ${p.frontHtml}, ${p.backHtml}, ${textArray(tags)}, ${noteId}, ${p.templateId}, ${p.clozeNumber}, ${RENDERER_VERSION},
              ${suspendedBy !== null}, ${suspendedBy})
      RETURNING id
    `);
    const cardId = card.rows[0].id;
    const s = plan.schedule;
    await tx.execute(sql`INSERT INTO bloom_state (card_id) VALUES (${cardId})`);
    await tx.execute(sql`
      INSERT INTO fsrs_state (card_id, stability, difficulty, due, last_review, reps, lapses, state)
      VALUES (${cardId}, ${s.stability}, ${s.difficulty}, ${s.due}, ${s.lastReview}, ${s.reps}, ${s.lapses}, ${s.state})
    `);
    await insertDerivedOriginal(tx, cardId, p);
    if (stats) {
      stats.cards.created++;
      stats.schedule[s.source]++;
      if (suspendedBy === "anki") stats.cards.suspended++;
      if (suspendedBy === "unsupported") stats.cards.unsupported++;
    }
  }
  for (const c of existing.rows) {
    if (wanted.has(`${c.template_id}:${c.cloze_number}`)) continue;
    await tx.execute(sql`
      UPDATE cards SET suspended = true, suspended_by = COALESCE(suspended_by, 'gap'), topic_id = ${topicId}, updated_at = NOW() WHERE id = ${c.id}
    `);
  }
  await tx.execute(sql`DELETE FROM glasses_questions WHERE card_id IN (SELECT id FROM cards WHERE note_id = ${noteId})`);
}

async function insertDerivedOriginal(tx: Tx, cardId: string, p: PlannedCard) {
  const question = stripHtml(p.frontHtml).replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!question) return;
  const answer = stripHtml(p.backHtml).replace(/\s+/g, " ").trim().slice(0, 2000);
  const ins = await tx.execute<{ id: string }>(sql`
    INSERT INTO card_originals (card_id, version, question_text, expected_answer, created_by)
    VALUES (${cardId}, 1, ${question}, ${answer}, 'derived') RETURNING id
  `);
  await tx.execute(sql`UPDATE cards SET current_original_id = ${ins.rows[0].id} WHERE id = ${cardId}`);
}


