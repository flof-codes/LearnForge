import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { textArray } from "../lib/sql-array.js";
import { occlusionFieldMap } from "./anki-import-shared.js";
import { updateNote } from "./note-service.js";
import { getNoteType, resolveNoteType } from "./note-types.js";

/**
 * One-off, forward-only move of image occlusion notes that an Anki import
 * before the built-in type existed copied as their own type, with every card
 * suspended as `unsupported`. Each note moves onto the built-in "occlusion"
 * type; its cards keep id, schedule, level and history, are rendered again,
 * and — once rendered — freed, unless Anki had them suspended. A note that
 * does not render stays suspended. The emptied copy is deleted.
 *
 * Runs at API boot after the migrations and is a no-op once no such type is left.
 */

export interface OcclusionMigrationReport { types: number; notes: number; cardsFreed: number; failed: string[] }

export async function convertImportedOcclusionTypes(db: Db, log: (msg: string) => void = console.log): Promise<OcclusionMigrationReport> {
  const report: OcclusionMigrationReport = { types: 0, notes: 0, cardsFreed: 0, failed: [] };
  const pending = await db.execute<{ id: string; user_id: string }>(sql`
    SELECT nt.id, nt.user_id FROM note_types nt
    WHERE nt.builtin_key IS NULL AND nt.anki_key IS NOT NULL
      AND EXISTS (SELECT 1 FROM card_templates ct WHERE ct.note_type_id = nt.id AND ct.front_template LIKE '%anki.imageOcclusion%')
      AND EXISTS (SELECT 1 FROM notes n WHERE n.note_type_id = nt.id)
  `);

  for (const row of pending.rows) {
    const old = await getNoteType(db, row.user_id, row.id);
    const map = occlusionFieldMap(old.fields);
    if (!map) {
      log(`occlusion migration: type ${old.id} has no occlusion/image field, left as it is`);
      continue;
    }
    const target = await resolveNoteType(db, row.user_id, "occlusion");
    const keyByName = new Map(target.fields.map(f => [f.name, f.key]));
    const keyMap = old.fields.flatMap(f => (map.has(f.ord) ? [[f.key, keyByName.get(map.get(f.ord)!)!] as const] : []));

    const moved = await db.transaction(async (tx) => {
      const notes = await tx.execute<{ id: string; fields: Record<string, string> }>(sql`
        SELECT id, fields FROM notes WHERE note_type_id = ${old.id} AND user_id = ${row.user_id}
      `);
      for (const n of notes.rows) {
        const fields: Record<string, string> = Object.fromEntries(target.fields.map(f => [f.key, ""]));
        for (const [from, to] of keyMap) fields[to] = n.fields[from] ?? "";
        await tx.execute(sql`UPDATE notes SET note_type_id = ${target.id}, fields = ${JSON.stringify(fields)}::jsonb WHERE id = ${n.id}`);
      }
      const ids = notes.rows.map(n => n.id);
      if (ids.length === 0) return ids;
      // Both types have one template; the cards follow by its position.
      await tx.execute(sql`
        UPDATE cards c SET template_id = nt.id
        FROM card_templates old, card_templates nt
        WHERE c.note_id = ANY(${textArray(ids)}::uuid[]) AND old.id = c.template_id AND nt.note_type_id = ${target.id} AND nt.ord = old.ord
      `);
      await tx.execute(sql`
        UPDATE anki_records SET local_id = ${target.id}, updated_at = NOW()
        WHERE user_id = ${row.user_id} AND kind = 'notetype' AND local_id = ${old.id}
      `);
      await tx.execute(sql`
        DELETE FROM note_types t WHERE t.id = ${old.id}
          AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.note_type_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM cards c JOIN card_templates ct ON ct.id = c.template_id WHERE ct.note_type_id = t.id)
      `);
      return ids;
    });

    // Rendering goes through the note service, outside the move, one note at a time.
    const rendered: string[] = [];
    for (const id of moved) {
      try {
        await updateNote(db, row.user_id, id, {});
        rendered.push(id);
      } catch (err) {
        report.failed.push(id);
        log(`occlusion migration: note ${id} did not render, its cards stay suspended: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (rendered.length > 0) {
      // Anki's own suspension survives in the import's raw card record (queue -1).
      const freed = await db.execute<{ id: string }>(sql`
        WITH held AS (
          SELECT c.id, EXISTS (
            SELECT 1 FROM anki_records r
            WHERE r.user_id = ${row.user_id} AND r.kind = 'card'
              AND r.anki_key = n.anki_guid || ':' || (c.cloze_number - 1) AND r.raw->>'queue' = '-1'
          ) AS by_anki
          FROM cards c JOIN notes n ON n.id = c.note_id
          WHERE c.note_id = ANY(${textArray(rendered)}::uuid[]) AND c.suspended_by = 'unsupported'
        )
        UPDATE cards c SET suspended = held.by_anki, suspended_by = CASE WHEN held.by_anki THEN 'anki' END, updated_at = NOW()
        FROM held WHERE c.id = held.id
        RETURNING c.id
      `);
      report.cardsFreed += freed.rows.length;
    }
    report.types++;
    report.notes += moved.length;
  }
  if (report.types > 0) log(`occlusion migration: ${report.notes} note(s) of ${report.types} type(s) moved, ${report.cardsFreed} card(s) freed`);
  return report;
}
