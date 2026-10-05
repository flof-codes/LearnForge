import { sql } from "drizzle-orm";
import { textArray } from "../lib/sql-array.js";
import type { Db } from "../db/types.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { stripHtml } from "../lib/strip-html.js";
import { renderCardTemplate, clozeNumbersIn, plainClozeText, RENDERER_VERSION } from "../lib/note-renderer.js";
import { computeEmbedding } from "./embeddings.js";
import { createInitialFsrsState } from "./fsrs.js";
import { getNoteType, resolveNoteType, type NoteType } from "./note-types.js";
import { setOriginal, getCurrentOriginals } from "./originals-service.js";

/**
 * Notes: the knowledge itself, once. A note renders into one card per template
 * (standard) or per cloze number (cloze). Cards keep their own schedule, level
 * and history; the note owns content, tags and topic.
 */

export interface Note {
  id: string;
  userId: string;
  noteTypeId: string;
  noteTypeName: string;
  noteTypeKind: string;
  topicId: string;
  fields: Record<string, string>;
  tags: string[];
  ankiGuid: string | null;
  createdAt: string;
  updatedAt: string;
  cards: NoteCardSummary[];
}

export interface NoteCardSummary {
  id: string;
  templateId: string | null;
  templateName: string | null;
  clozeNumber: number;
  suspended: boolean;
  concept: string;
}

interface NoteRow extends Record<string, unknown> {
  id: string; user_id: string; note_type_id: string; topic_id: string; fields: Record<string, string>;
  tags: string[] | null; anki_guid: string | null; created_at: string; updated_at: string;
  type_name: string; type_kind: string;
}

const MAX_CONCEPT = 200;

/**
 * Maps input fields given by key or by name onto the type's keys; unknown names
 * are refused. Without `partial`, every field of the type is present (empty if
 * not given); with it, only the fields that were sent.
 */
export function normalizeFields(type: NoteType, input: Record<string, string>, partial = false): Record<string, string> {
  const byName = new Map(type.fields.map(f => [f.name.toLowerCase(), f.key]));
  const keys = new Set(type.fields.map(f => f.key));
  const out: Record<string, string> = {};
  if (!partial) for (const f of type.fields) out[f.key] = "";
  for (const [k, v] of Object.entries(input ?? {})) {
    const key = keys.has(k) ? k : byName.get(k.toLowerCase());
    if (!key) throw new ValidationError(`Unknown field "${k}" for note type ${type.name}`);
    if (typeof v !== "string") throw new ValidationError(`Field "${k}" must be a string`);
    out[key] = v;
  }
  return out;
}

function fieldsByName(type: NoteType, fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of type.fields) out[f.name] = fields[f.key] ?? "";
  return out;
}

export function deriveConcept(type: NoteType, fields: Record<string, string>): string {
  const sortKey = type.sortFieldKey ?? type.fields[0]?.key;
  const plain = (v: string) => stripHtml(plainClozeText(v)).trim();
  const primary = sortKey ? plain(fields[sortKey] ?? "") : "";
  const text = primary || type.fields.map(f => plain(fields[f.key] ?? "")).find(Boolean) || type.name;
  return text.replace(/\s+/g, " ").slice(0, MAX_CONCEPT);
}

function embeddingTextFor(concept: string, tags: string[], type: NoteType, fields: Record<string, string>): string {
  const body = type.fields.map(f => stripHtml(plainClozeText(fields[f.key] ?? ""))).join("\n");
  return [concept, tags.join(", "), body].join("\n").slice(0, 4000);
}

export interface PlannedCard { templateId: string; templateOrd: number; clozeNumber: number; frontHtml: string; backHtml: string }

/**
 * Cards a note must have: (template, clozeNumber) pairs. Cloze types produce
 * one card per number found in any field, as Anki does. `keepOne` follows
 * Anki's rule that a note never loses its last card: when nothing renders, the
 * first template (or gap 1) is kept instead of refusing the note. Editors
 * leave it off, so a user is told that the note would be empty.
 */
export function plannedCards(type: NoteType, fields: Record<string, string>, deck: string, tags: string[], opts: { keepOne?: boolean } = {}): PlannedCard[] {
  const byName = fieldsByName(type, fields);
  const out: PlannedCard[] = [];
  const render = (t: NoteType["templates"][number], n: number) => renderCardTemplate(t.frontTemplate, t.backTemplate, type.css, {
    fields: byName, clozeNumber: n, tags, deck, templateOrd: t.ord + 1,
  });
  const numbers = type.kind === "cloze" ? clozeNumbersIn(type.fields.map(f => fields[f.key] ?? "").join("\n")) : [0];
  if (type.kind === "cloze" && numbers.length === 0 && !opts.keepOne) throw new ValidationError("A cloze note needs at least one {{c1::…}} gap");
  for (const t of type.templates) {
    for (const n of numbers) {
      const r = render(t, n);
      if (type.kind !== "cloze" && r.frontIsEmpty) continue; // Anki's empty-card rule
      out.push({ templateId: t.id, templateOrd: t.ord, clozeNumber: n, frontHtml: r.frontHtml, backHtml: r.backHtml });
    }
  }
  if (out.length === 0 && opts.keepOne && type.templates.length > 0) {
    const t = type.templates[0];
    const n = type.kind === "cloze" ? 1 : 0;
    const r = render(t, n);
    out.push({ templateId: t.id, templateOrd: t.ord, clozeNumber: n, frontHtml: r.frontHtml, backHtml: r.backHtml });
  }
  if (out.length === 0) throw new ValidationError("The note renders no card: fill at least one field the front template uses");
  return out;
}

/** The topic's full path, parts joined by "::" like an Anki deck name, for `{{Deck}}`. */
export async function topicPath(db: Db, userId: string, topicId: string): Promise<string> {
  const rows = await db.execute<{ name: string }>(sql`
    WITH RECURSIVE up AS (
      SELECT id, parent_id, name, 0 AS depth FROM topics WHERE id = ${topicId} AND user_id = ${userId}
      UNION ALL
      SELECT t.id, t.parent_id, t.name, up.depth + 1 FROM topics t JOIN up ON t.id = up.parent_id WHERE up.depth < 50
    )
    SELECT name FROM up ORDER BY depth DESC
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Topic not found");
  return rows.rows.map(r => r.name).join("::");
}

export interface CreateNoteInput {
  topic_id: string;
  /** Note type id or built-in key: "open", "choice", "cloze". */
  note_type: string;
  fields: Record<string, string>;
  tags?: string[];
  concept?: string;
  anki_guid?: string;
  /** A connected app's own id for the note. Sent again, the existing note comes back and nothing is created. */
  source_ref?: string;
}

async function noteBySourceRef(db: Db, userId: string, sourceRef: string): Promise<string | null> {
  const r = await db.execute<{ id: string }>(sql`SELECT id FROM notes WHERE user_id = ${userId} AND source_ref = ${sourceRef}`);
  return r.rows[0]?.id ?? null;
}

export async function createNote(db: Db, userId: string, input: CreateNoteInput): Promise<Note> {
  if (!input.topic_id) throw new ValidationError("topic_id is required");
  if (!input.note_type) throw new ValidationError("note_type is required");
  const sourceRef = input.source_ref?.trim() || null;
  if (sourceRef) {
    const existing = await noteBySourceRef(db, userId, sourceRef);
    if (existing) return getNote(db, userId, existing);
  }
  const type = await resolveNoteType(db, userId, input.note_type);
  const fields = normalizeFields(type, input.fields);
  const tags = input.tags ?? [];
  const deck = await topicPath(db, userId, input.topic_id);
  const cardsToMake = plannedCards(type, fields, deck, tags);
  const concept = (input.concept?.trim() || deriveConcept(type, fields)).slice(0, MAX_CONCEPT);
  const embedding = await computeEmbedding(embeddingTextFor(concept, tags, type, fields));
  const fsrs = createInitialFsrsState();

  const noteId = await db.transaction(async (tx) => {
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO notes (user_id, note_type_id, topic_id, fields, tags, anki_guid, source_ref)
      VALUES (${userId}, ${type.id}, ${input.topic_id}, ${JSON.stringify(fields)}::jsonb, ${textArray(tags)}, ${input.anki_guid ?? null}, ${sourceRef})
      RETURNING id
    `);
    const id = ins.rows[0].id;
    for (const c of cardsToMake) {
      const card = await tx.execute<{ id: string }>(sql`
        INSERT INTO cards (topic_id, concept, front_html, back_html, tags, note_id, template_id, cloze_number, renderer_version, embedding)
        VALUES (${input.topic_id}, ${concept}, ${c.frontHtml}, ${c.backHtml}, ${textArray(tags)}, ${id}, ${c.templateId}, ${c.clozeNumber}, ${RENDERER_VERSION}, ${embedding ? `[${embedding.join(",")}]` : null}::vector)
        RETURNING id
      `);
      const cardId = card.rows[0].id;
      await tx.execute(sql`INSERT INTO bloom_state (card_id) VALUES (${cardId})`);
      await tx.execute(sql`
        INSERT INTO fsrs_state (card_id, stability, difficulty, due, last_review, reps, lapses, state)
        VALUES (${cardId}, ${fsrs.stability}, ${fsrs.difficulty}, ${fsrs.due}, ${fsrs.lastReview}, ${fsrs.reps}, ${fsrs.lapses}, ${fsrs.state})
      `);
    }
    return id;
  });
  await refreshDerivedOriginals(db, userId, noteId);
  return getNote(db, userId, noteId);
}

/**
 * The original question of a typed card is derived from its rendered front,
 * regenerated on every edit and therefore never stale.
 */
export async function refreshDerivedOriginals(db: Db, userId: string, noteId: string): Promise<void> {
  const cards = await db.execute<{ id: string; front_html: string; back_html: string }>(sql`
    SELECT id, front_html, back_html FROM cards WHERE note_id = ${noteId} AND suspended = false
  `);
  const current = await getCurrentOriginals(db, userId, cards.rows.map(c => c.id));
  for (const c of cards.rows) {
    const question = stripHtml(c.front_html).replace(/\s+/g, " ").trim().slice(0, 2000);
    const answer = stripHtml(c.back_html).replace(/\s+/g, " ").trim().slice(0, 2000);
    if (!question) continue;
    const existing = current.get(c.id);
    if (existing && (existing.status === "disputed" || (existing.questionText === question && existing.expectedAnswer === answer))) continue;
    await setOriginal(db, userId, { card_id: c.id, question_text: question, expected_answer: answer, created_by: "derived" });
  }
}

export async function getNote(db: Db, userId: string, noteId: string): Promise<Note> {
  const rows = await db.execute<NoteRow>(sql`
    SELECT n.*, nt.name AS type_name, nt.kind AS type_kind
    FROM notes n JOIN note_types nt ON nt.id = n.note_type_id
    WHERE n.id = ${noteId} AND n.user_id = ${userId}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Note not found");
  const n = rows.rows[0];
  const cards = await db.execute<{ id: string; template_id: string | null; template_name: string | null; cloze_number: number; suspended: boolean; concept: string }>(sql`
    SELECT c.id, c.template_id, ct.name AS template_name, c.cloze_number, c.suspended, c.concept
    FROM cards c LEFT JOIN card_templates ct ON ct.id = c.template_id
    WHERE c.note_id = ${noteId}
    ORDER BY ct.ord NULLS LAST, c.cloze_number
  `);
  return {
    id: n.id, userId: n.user_id, noteTypeId: n.note_type_id, noteTypeName: n.type_name, noteTypeKind: n.type_kind,
    topicId: n.topic_id, fields: n.fields, tags: n.tags ?? [], ankiGuid: n.anki_guid, createdAt: n.created_at, updatedAt: n.updated_at,
    cards: cards.rows.map(c => ({ id: c.id, templateId: c.template_id, templateName: c.template_name, clozeNumber: c.cloze_number, suspended: c.suspended, concept: c.concept })),
  };
}

export interface UpdateNoteInput {
  fields?: Record<string, string>;
  tags?: string[];
  topic_id?: string;
  concept?: string;
}

/**
 * Re-renders every card of the note. New cloze numbers get new cards; numbers
 * that vanished are suspended, not deleted, so their history survives, and a
 * number that comes back un-suspends its card.
 */
export async function updateNote(db: Db, userId: string, noteId: string, input: UpdateNoteInput): Promise<Note> {
  const current = await getNote(db, userId, noteId);
  const type = await getNoteType(db, userId, current.noteTypeId);
  const fields = input.fields ? { ...current.fields, ...normalizeFields(type, input.fields, true) } : current.fields;
  const tags = input.tags ?? current.tags;
  const topicId = input.topic_id ?? current.topicId;
  const deck = await topicPath(db, userId, topicId);
  const planned = plannedCards(type, fields, deck, tags);
  const contentChanged = input.fields !== undefined || input.tags !== undefined || input.concept !== undefined;
  const concept = (input.concept?.trim() || (input.fields ? deriveConcept(type, fields) : current.cards[0]?.concept) || deriveConcept(type, fields)).slice(0, MAX_CONCEPT);
  const embedding = contentChanged ? await computeEmbedding(embeddingTextFor(concept, tags, type, fields)) : null;
  const fsrs = createInitialFsrsState();

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE notes SET fields = ${JSON.stringify(fields)}::jsonb, tags = ${textArray(tags)}, topic_id = ${topicId}, updated_at = NOW()
      WHERE id = ${noteId}
    `);
    const existing = await tx.execute<{ id: string; template_id: string; cloze_number: number; suspended: boolean }>(sql`
      SELECT id, template_id, cloze_number, suspended FROM cards WHERE note_id = ${noteId}
    `);
    const byKey = new Map(existing.rows.map(c => [`${c.template_id}:${c.cloze_number}`, c]));
    const wanted = new Set<string>();
    for (const c of planned) {
      const key = `${c.templateId}:${c.clozeNumber}`;
      wanted.add(key);
      const row = byKey.get(key);
      if (row) {
        await tx.execute(sql`
          UPDATE cards SET front_html = ${c.frontHtml}, back_html = ${c.backHtml}, concept = ${concept}, tags = ${textArray(tags)},
            topic_id = ${topicId}, renderer_version = ${RENDERER_VERSION}, updated_at = NOW(),
            suspended = CASE WHEN suspended_by = 'gap' THEN false ELSE suspended END,
            suspended_by = CASE WHEN suspended_by = 'gap' THEN NULL ELSE suspended_by END
            ${embedding ? sql`, embedding = ${`[${embedding.join(",")}]`}::vector` : sql``}
          WHERE id = ${row.id}
        `);
      } else {
        const card = await tx.execute<{ id: string }>(sql`
          INSERT INTO cards (topic_id, concept, front_html, back_html, tags, note_id, template_id, cloze_number, renderer_version, embedding)
          VALUES (${topicId}, ${concept}, ${c.frontHtml}, ${c.backHtml}, ${textArray(tags)}, ${noteId}, ${c.templateId}, ${c.clozeNumber}, ${RENDERER_VERSION},
                  ${embedding ? `[${embedding.join(",")}]` : null}::vector)
          RETURNING id
        `);
        const cardId = card.rows[0].id;
        await tx.execute(sql`INSERT INTO bloom_state (card_id) VALUES (${cardId})`);
        await tx.execute(sql`
          INSERT INTO fsrs_state (card_id, stability, difficulty, due, last_review, reps, lapses, state)
          VALUES (${cardId}, ${fsrs.stability}, ${fsrs.difficulty}, ${fsrs.due}, ${fsrs.lastReview}, ${fsrs.reps}, ${fsrs.lapses}, ${fsrs.state})
        `);
      }
    }
    for (const c of existing.rows) {
      if (!wanted.has(`${c.template_id}:${c.cloze_number}`) && !c.suspended) {
        await tx.execute(sql`UPDATE cards SET suspended = true, suspended_by = 'gap', topic_id = ${topicId}, updated_at = NOW() WHERE id = ${c.id}`);
      } else if (!wanted.has(`${c.template_id}:${c.cloze_number}`)) {
        await tx.execute(sql`UPDATE cards SET topic_id = ${topicId} WHERE id = ${c.id}`);
      }
    }
    // Compiled glasses questions were built from the old content.
    await tx.execute(sql`DELETE FROM glasses_questions WHERE card_id IN (SELECT id FROM cards WHERE note_id = ${noteId})`);
  });
  await refreshDerivedOriginals(db, userId, noteId);
  return getNote(db, userId, noteId);
}

/** After a note type changed (templates, CSS, fields), every note of it renders again. */
export async function rerenderNotesOfType(db: Db, userId: string, noteTypeId: string): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`SELECT id FROM notes WHERE note_type_id = ${noteTypeId} AND user_id = ${userId}`);
  for (const r of rows.rows) await updateNote(db, userId, r.id, {});
  return rows.rows.length;
}

export async function deleteNote(db: Db, userId: string, noteId: string): Promise<{ deletedCards: number }> {
  const note = await getNote(db, userId, noteId);
  await db.execute(sql`DELETE FROM notes WHERE id = ${noteId} AND user_id = ${userId}`);
  return { deletedCards: note.cards.length };
}

/** Lists a user's notes, optionally below a topic (recursive). */
export async function listNotes(db: Db, userId: string, topicId?: string, limit = 50, offset = 0) {
  const scope = topicId
    ? sql`AND n.topic_id IN (
        WITH RECURSIVE tree AS (
          SELECT id FROM topics WHERE id = ${topicId}::uuid AND user_id = ${userId}
          UNION ALL SELECT t.id FROM topics t JOIN tree tr ON t.parent_id = tr.id
        ) SELECT id FROM tree)`
    : sql``;
  const rows = await db.execute<{ id: string; note_type_id: string; type_name: string; type_kind: string; topic_id: string; fields: Record<string, string>; tags: string[] | null; updated_at: string; card_count: number; concept: string | null }>(sql`
    SELECT n.id, n.note_type_id, nt.name AS type_name, nt.kind AS type_kind, n.topic_id, n.fields, n.tags, n.updated_at,
           (SELECT count(*)::int FROM cards c WHERE c.note_id = n.id) AS card_count,
           (SELECT c.concept FROM cards c WHERE c.note_id = n.id ORDER BY c.cloze_number LIMIT 1) AS concept
    FROM notes n JOIN note_types nt ON nt.id = n.note_type_id
    WHERE n.user_id = ${userId} ${scope}
    ORDER BY n.updated_at DESC
    LIMIT ${Math.max(1, Math.min(200, limit))} OFFSET ${Math.max(0, offset)}
  `);
  return rows.rows.map(r => ({
    id: r.id, noteTypeId: r.note_type_id, noteTypeName: r.type_name, noteTypeKind: r.type_kind, topicId: r.topic_id,
    fields: r.fields, tags: r.tags ?? [], updatedAt: r.updated_at, cardCount: r.card_count, concept: r.concept,
  }));
}
