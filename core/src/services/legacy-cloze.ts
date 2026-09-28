import { sql } from "drizzle-orm";
import { textArray } from "../lib/sql-array.js";
import type { Db } from "../db/types.js";
import { stripHtml } from "../lib/strip-html.js";
import { renderCardTemplate, RENDERER_VERSION, findClozeSpans } from "../lib/note-renderer.js";
import { createInitialFsrsState } from "./fsrs.js";
import { resolveNoteType } from "./note-types.js";
import { setOriginal } from "./originals-service.js";

/**
 * One-off, forward-only conversion of release-1 cloze cards (one card holding
 * every gap, rotated by the tutor) into Cloze notes with one card per gap number.
 *
 * Runs at API boot after the migrations, one transaction per card, and is a
 * no-op once no `card_type = 'cloze'` card without a note is left. The old card
 * keeps its id, schedule, level and history for the first gap number; the other
 * numbers start fresh. Cards whose cloze text cannot be parsed are deleted, as
 * decided, and listed in the log.
 */

function escapeOutsideMarkers(text: string): string {
  // Old sourceText was plain text and escaped at render time; the note model
  // treats fields as HTML, so escape everything outside the {{cN::…}} markers.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const spans = findClozeSpans(text);
  let out = "";
  let cursor = 0;
  for (const s of spans) {
    out += esc(text.slice(cursor, s.start));
    out += `{{c${s.number}::${esc(s.answer)}${s.hint !== null ? `::${esc(s.hint)}` : ""}}}`;
    cursor = s.end;
  }
  return out + esc(text.slice(cursor));
}

export interface LegacyClozeReport { converted: number; deleted: string[]; skipped: number }

export async function convertLegacyClozeCards(db: Db, log: (msg: string) => void = console.log): Promise<LegacyClozeReport> {
  const pending = await db.execute<{ id: string; topic_id: string; user_id: string; concept: string; tags: string[] | null; cloze_data: { sourceText?: string } | null; embedding: string | null; topic_name: string }>(sql`
    SELECT c.id, c.topic_id, t.user_id, c.concept, c.tags, c.cloze_data, c.embedding::text AS embedding, t.name AS topic_name
    FROM cards c JOIN topics t ON t.id = c.topic_id
    WHERE c.card_type = 'cloze' AND c.note_id IS NULL
    ORDER BY c.created_at
  `);
  const report: LegacyClozeReport = { converted: 0, deleted: [], skipped: 0 };
  if (pending.rows.length === 0) return report;
  log(`[legacy-cloze] converting ${pending.rows.length} cloze card(s) to notes`);

  for (const card of pending.rows) {
    const source = card.cloze_data?.sourceText;
    const text = source ? escapeOutsideMarkers(source) : "";
    const numbers = [...new Set(findClozeSpans(text).map(s => s.number))].sort((a, b) => a - b);
    if (!source || numbers.length === 0) {
      await db.execute(sql`DELETE FROM cards WHERE id = ${card.id}`);
      report.deleted.push(card.id);
      log(`[legacy-cloze] deleted ${card.id}: no parseable cloze text`);
      continue;
    }

    try {
      const type = await resolveNoteType(db, card.user_id, "cloze");
      const template = type.templates[0];
      const fields = { f1: text, f2: "" };
      const byName = { Text: text, Extra: "" };
      const tags = card.tags ?? [];
      const fsrs = createInitialFsrsState();
      const created: string[] = [];

      await db.transaction(async (tx) => {
        const note = await tx.execute<{ id: string }>(sql`
          INSERT INTO notes (user_id, note_type_id, topic_id, fields, tags)
          VALUES (${card.user_id}, ${type.id}, ${card.topic_id}, ${JSON.stringify(fields)}::jsonb, ${textArray(tags)})
          RETURNING id
        `);
        const noteId = note.rows[0].id;
        for (const [i, n] of numbers.entries()) {
          const r = renderCardTemplate(template.frontTemplate, template.backTemplate, type.css, {
            fields: byName, clozeNumber: n, tags, deck: card.topic_name, templateOrd: 1,
          });
          if (i === 0) {
            await tx.execute(sql`
              UPDATE cards SET note_id = ${noteId}, template_id = ${template.id}, cloze_number = ${n},
                front_html = ${r.frontHtml}, back_html = ${r.backHtml}, card_type = 'standard', cloze_data = NULL,
                renderer_version = ${RENDERER_VERSION}, updated_at = NOW()
              WHERE id = ${card.id}
            `);
            created.push(card.id);
          } else {
            const ins = await tx.execute<{ id: string }>(sql`
              INSERT INTO cards (topic_id, concept, front_html, back_html, tags, note_id, template_id, cloze_number, renderer_version, embedding)
              VALUES (${card.topic_id}, ${card.concept}, ${r.frontHtml}, ${r.backHtml}, ${textArray(tags)}, ${noteId}, ${template.id}, ${n}, ${RENDERER_VERSION}, ${card.embedding}::vector)
              RETURNING id
            `);
            const id = ins.rows[0].id;
            await tx.execute(sql`INSERT INTO bloom_state (card_id) VALUES (${id})`);
            await tx.execute(sql`
              INSERT INTO fsrs_state (card_id, stability, difficulty, due, last_review, reps, lapses, state)
              VALUES (${id}, ${fsrs.stability}, ${fsrs.difficulty}, ${fsrs.due}, ${fsrs.lastReview}, ${fsrs.reps}, ${fsrs.lapses}, ${fsrs.state})
            `);
            created.push(id);
          }
        }
        // Questions compiled for the rotating card no longer match one gap.
        await tx.execute(sql`DELETE FROM glasses_questions WHERE card_id = ${card.id}`);
      });

      // The tutor's original was written for the rotation flow; replace it with a derived one per card.
      const rendered = await db.execute<{ id: string; front_html: string; back_html: string }>(sql`
        SELECT id, front_html, back_html FROM cards WHERE id IN (${sql.join(created.map(id => sql`${id}::uuid`), sql`, `)})
      `);
      for (const c of rendered.rows) {
        await setOriginal(db, card.user_id, {
          card_id: c.id,
          question_text: stripHtml(c.front_html).replace(/\s+/g, " ").trim(),
          expected_answer: stripHtml(c.back_html).replace(/\s+/g, " ").trim(),
          created_by: "derived",
        });
      }
      report.converted++;
    } catch (err) {
      report.skipped++;
      log(`[legacy-cloze] could not convert ${card.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  log(`[legacy-cloze] done: ${report.converted} converted, ${report.deleted.length} deleted, ${report.skipped} skipped`);
  return report;
}
