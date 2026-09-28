import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import type { AnkiNote, AnkiPackage } from "../lib/apkg/package.js";
import { normalizeMediaName, rewriteMediaRefs } from "../lib/apkg/media-refs.js";
import { scheduleFromAnki } from "../lib/apkg/schedule.js";
import { sniffMediaType } from "../lib/apkg/sniff.js";
import { extFromMime } from "../lib/image-utils.js";
import { textArray } from "../lib/sql-array.js";
import { createInitialFsrsState } from "./fsrs.js";
import { deriveConcept, plannedCards, refreshDerivedOriginals, type PlannedCard } from "./note-service.js";
import { getNoteType, type NoteType } from "./note-types.js";
import {
  cardsByNote, deckPaths, existingGuids, homeDeck, isSupportedType, schemaHash, MAX_ERRORS,
  type AnkiImportOptions, type AnkiImportStats,
} from "./anki-import-shared.js";
import { syncImportedCards } from "./anki-import-cards.js";

export { previewAnkiPackage } from "./anki-import-preview.js";
export type { ScheduleMode, AnkiImportOptions, AnkiImportStats, AnkiPreview } from "./anki-import-shared.js";

/**
 * Maps a read Anki package onto LearnForge:
 * - decks → topics (full path; filtered decks never become topics, their cards
 *   go to the deck they came from);
 * - note types → the user's own types, reused on re-import when the Anki id
 *   and the field/template layout match;
 * - notes → notes keyed by guid; a re-import updates a note only when Anki's
 *   copy changed after LearnForge's (Anki's own rule);
 * - cards → rendered by the note renderer, schedule taken from Anki;
 * - media → one stored file per distinct content, references rewritten;
 * - everything LearnForge does not model (review log, deck options, raw ids,
 *   the original field HTML) → `anki_records`, so nothing is lost.
 * Embeddings are left empty and filled in the background afterwards.
 */

interface RecordRow { kind: string; key: string; localId: string | null; raw: unknown }

async function upsertRecords(db: Db, userId: string, importId: string, rows: RecordRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await db.execute(sql`
      INSERT INTO anki_records (user_id, import_id, kind, anki_key, local_id, raw)
      VALUES ${sql.join(chunk.map(r => sql`(${userId}, ${importId}, ${r.kind}, ${r.key}, ${r.localId}, ${JSON.stringify(r.raw)}::jsonb)`), sql`, `)}
      ON CONFLICT (user_id, kind, anki_key) DO UPDATE
        SET import_id = EXCLUDED.import_id, local_id = EXCLUDED.local_id, raw = EXCLUDED.raw, updated_at = NOW()
    `);
  }
}

export async function importAnkiPackage(db: Db, userId: string, importId: string, pkg: AnkiPackage, opts: AnkiImportOptions): Promise<AnkiImportStats> {
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? 200;
  const stats: AnkiImportStats = {
    noteTypes: { created: 0, reused: 0, updated: 0, unsupported: 0 },
    topics: { created: 0, reused: 0 },
    notes: { created: 0, updated: 0, unchanged: 0, failed: 0 },
    cards: { created: 0, suspended: 0, unsupported: 0, notRendered: 0 },
    schedule: { new: 0, "anki-fsrs": 0, replay: 0, sm2: 0 },
    media: { stored: 0, reused: 0, failed: 0, overQuota: 0 },
    reviewLogEntries: 0,
    errors: [],
  };
  const fail = (guid: string, message: string) => {
    stats.notes.failed++;
    if (stats.errors.length < MAX_ERRORS) stats.errors.push({ guid, message });
  };

  // ── Media ─────────────────────────────────────────────────────────────
  const mediaIds = new Map<string, string>();
  await mkdir(opts.mediaDir, { recursive: true });
  const usedRow = await db.execute<{ used: string }>(sql`SELECT COALESCE(SUM(size_bytes), 0)::text AS used FROM images WHERE user_id = ${userId}`);
  let used = Number(usedRow.rows[0].used);
  for (const ref of pkg.media) {
    let bytes: Buffer;
    try {
      bytes = pkg.readMedia(ref);
    } catch {
      stats.media.failed++;
      continue;
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    const existing = await db.execute<{ id: string }>(sql`SELECT id FROM images WHERE user_id = ${userId} AND content_hash = ${hash} LIMIT 1`);
    let id = existing.rows[0]?.id;
    if (id) {
      stats.media.reused++;
    } else {
      if (used + bytes.length > opts.mediaQuotaBytes) { stats.media.overQuota++; continue; }
      const mime = sniffMediaType(bytes, ref.name);
      id = randomUUID();
      await writeFile(path.join(opts.mediaDir, `${id}${extFromMime(mime)}`), bytes);
      await db.execute(sql`
        INSERT INTO images (id, user_id, filename, mime_type, content_hash, size_bytes)
        VALUES (${id}, ${userId}, ${ref.name.slice(0, 255)}, ${mime}, ${hash}, ${bytes.length})
      `);
      used += bytes.length;
      stats.media.stored++;
    }
    mediaIds.set(normalizeMediaName(ref.name), id);
  }
  const lookup = (name: string) => mediaIds.get(name);
  const rewrite = (text: string) => rewriteMediaRefs(text, lookup).text;

  // ── Note types ────────────────────────────────────────────────────────
  const usedTypeIds = new Set(pkg.notes.map(n => n.mid));
  const localTypes = new Map<number, { type: NoteType; supported: boolean; rerender: boolean }>();
  const records: RecordRow[] = [];
  for (const nt of pkg.noteTypes) {
    if (!usedTypeIds.has(nt.id)) continue;
    const hash = schemaHash(nt);
    const supported = isSupportedType(nt);
    if (!supported) stats.noteTypes.unsupported++;
    const fields = [...nt.fields].sort((a, b) => a.ord - b.ord);
    const templates = [...nt.templates].sort((a, b) => a.ord - b.ord);
    const css = rewrite(nt.css);
    const found = await db.execute<{ id: string; updated_at: string }>(sql`
      SELECT id, updated_at FROM note_types WHERE user_id = ${userId} AND anki_key = ${String(nt.id)} AND anki_schema = ${hash}
      ORDER BY created_at LIMIT 1
    `);
    let typeId = found.rows[0]?.id;
    let rerender = false;
    if (typeId) {
      if (nt.mtime * 1000 > new Date(found.rows[0].updated_at).getTime()) {
        await db.transaction(async (tx) => {
          await tx.execute(sql`UPDATE note_types SET name = ${nt.name.slice(0, 200)}, css = ${css}, updated_at = NOW() WHERE id = ${typeId}`);
          for (const t of templates) {
            await tx.execute(sql`
              UPDATE card_templates SET name = ${t.name}, front_template = ${rewrite(t.qfmt)}, back_template = ${rewrite(t.afmt)}
              WHERE note_type_id = ${typeId} AND ord = ${t.ord}
            `);
          }
        });
        stats.noteTypes.updated++;
        rerender = true;
      } else {
        stats.noteTypes.reused++;
      }
    } else {
      typeId = await db.transaction(async (tx) => {
        const sortKey = fields[nt.sortFieldIdx] ? `f${fields[nt.sortFieldIdx].ord + 1}` : "f1";
        const ins = await tx.execute<{ id: string }>(sql`
          INSERT INTO note_types (user_id, name, kind, css, sort_field_key, anki_key, anki_schema)
          VALUES (${userId}, ${nt.name.slice(0, 200)}, ${nt.kind === 1 ? "cloze" : "standard"}, ${css}, ${sortKey}, ${String(nt.id)}, ${hash})
          RETURNING id
        `);
        const id = ins.rows[0].id;
        for (const f of fields) {
          await tx.execute(sql`INSERT INTO note_type_fields (note_type_id, key, name, ord) VALUES (${id}, ${`f${f.ord + 1}`}, ${f.name}, ${f.ord})`);
        }
        for (const t of templates) {
          await tx.execute(sql`
            INSERT INTO card_templates (note_type_id, ord, name, front_template, back_template)
            VALUES (${id}, ${t.ord}, ${t.name}, ${rewrite(t.qfmt)}, ${rewrite(t.afmt)})
          `);
        }
        return id;
      });
      stats.noteTypes.created++;
    }
    localTypes.set(nt.id, { type: await getNoteType(db, userId, typeId), supported, rerender });
    records.push({ kind: "notetype", key: String(nt.id), localId: typeId, raw: nt });
  }

  // ── Decks → topics ────────────────────────────────────────────────────
  const paths = deckPaths(pkg);
  const topicByKey = new Map<string, string>();
  const ensureTopic = async (parts: string[]): Promise<string> => {
    let parent: string | null = null;
    for (let i = 1; i <= parts.length; i++) {
      const key = parts.slice(0, i).join("\x1f");
      let id: string | undefined = topicByKey.get(key);
      if (!id) {
        const rec = await db.execute<{ local_id: string }>(sql`
          SELECT r.local_id FROM anki_records r JOIN topics t ON t.id = r.local_id AND t.user_id = ${userId}
          WHERE r.user_id = ${userId} AND r.kind = 'deck' AND r.anki_key = ${key}
        `);
        const reused: string | undefined = rec.rows[0]?.local_id;
        if (reused) {
          id = reused;
          stats.topics.reused++;
        } else {
          const ins: { rows: Array<{ id: string }> } = await db.execute<{ id: string }>(sql`
            INSERT INTO topics (user_id, name, parent_id) VALUES (${userId}, ${parts[i - 1].slice(0, 255)}, ${parent}) RETURNING id
          `);
          id = ins.rows[0].id;
          stats.topics.created++;
        }
        topicByKey.set(key, id);
        const deck = pkg.decks.find(d => d.path.join("\x1f") === key);
        records.push({ kind: "deck", key, localId: id, raw: deck ?? { path: parts.slice(0, i) } });
      }
      parent = id;
    }
    return parent!;
  };
  // Only decks that hold cards become topics; Anki's empty "Default" deck stays behind.
  const usedDecks = new Set(pkg.cards.map(c => (paths.get(homeDeck(c)) ?? ["Default"]).join("\x1f")));
  for (const key of usedDecks) await ensureTopic(key.split("\x1f"));
  for (const dc of pkg.deckConfigs) records.push({ kind: "deck_config", key: String(dc.id ?? dc.name), localId: null, raw: dc });
  records.push({ kind: "collection", key: importId, localId: null, raw: { version: pkg.version, schema: pkg.schema, crt: pkg.crt } });
  await upsertRecords(db, userId, importId, records);

  // ── Notes and cards, in batches ───────────────────────────────────────
  const byNote = cardsByNote(pkg);
  const existing = await existingGuids(db, userId, pkg.notes.map(n => n.guid));
  const fresh = createInitialFsrsState();
  const updatedNotes: string[] = [];

  for (let start = 0; start < pkg.notes.length; start += batchSize) {
    const batch = pkg.notes.slice(start, start + batchSize);
    const batchCards = batch.flatMap(n => byNote.get(n.id) ?? []);
    const revlog = pkg.revlogFor(batchCards.map(c => c.id));
    stats.reviewLogEntries += revlog.length;
    const revlogByCard = new Map<number, typeof revlog>();
    for (const r of revlog) {
      const list = revlogByCard.get(r.cid) ?? [];
      list.push(r);
      revlogByCard.set(r.cid, list);
    }
    const batchRecords: RecordRow[] = [];

    for (const note of batch) {
      const local = localTypes.get(note.mid);
      const ankiCards = byNote.get(note.id) ?? [];
      if (!local) { fail(note.guid, "The note type is missing from the package"); continue; }
      if (ankiCards.length === 0) { fail(note.guid, "The note has no cards"); continue; }
      const { type, supported } = local;
      const fields: Record<string, string> = {};
      for (const f of type.fields) fields[f.key] = rewrite(note.fields[f.ord] ?? "");
      const deckParts = paths.get(homeDeck(ankiCards[0])) ?? ["Default"];
      const topicId = topicByKey.get(deckParts.join("\x1f"))!;

      let planned: PlannedCard[];
      try {
        planned = plannedCards(type, fields, deckParts.join("::"), note.tags, { keepOne: true });
      } catch (err) {
        fail(note.guid, err instanceof Error ? err.message : String(err));
        batchRecords.push({ kind: "note", key: note.guid, localId: null, raw: noteRaw(note) });
        continue;
      }
      const ankiFor = (p: PlannedCard) => ankiCards.find(c => (type.kind === "cloze" ? c.ord + 1 === p.clozeNumber : c.ord === p.templateOrd));
      const concept = deriveConcept(type, fields);
      const prior = existing.get(note.guid);

      // Cards the note gains take Anki's schedule and suspension, on a first import and on an update alike.
      const scheduleFor = (p: PlannedCard) => {
        const anki = ankiFor(p);
        if (!anki) return { schedule: { ...fresh, due: now, source: "new" as const }, suspendedBy: null };
        const schedule = opts.schedule === "keep"
          ? scheduleFromAnki(anki, revlogByCard.get(anki.id) ?? [], pkg.crt, now)
          : { ...fresh, due: now, source: "new" as const };
        return { schedule, suspendedBy: anki.queue === -1 ? "anki" : null };
      };

      try {
        const noteId = await db.transaction(async (tx) => {
          if (prior) {
            const newer = note.mod * 1000 > prior.updatedAt.getTime();
            const typeChanged = prior.noteTypeId !== type.id;
            if (!newer && !local.rerender && !typeChanged) { stats.notes.unchanged++; return prior.id; }
            if (typeChanged) {
              // The note type's layout changed in Anki, so the import made a new type. The note moves
              // onto it; its cards follow by template position and keep their schedule and history.
              await tx.execute(sql`
                UPDATE cards c SET template_id = nt.id
                FROM card_templates old, card_templates nt
                WHERE c.note_id = ${prior.id} AND old.id = c.template_id AND nt.note_type_id = ${type.id} AND nt.ord = old.ord
              `);
              await tx.execute(sql`UPDATE notes SET note_type_id = ${type.id} WHERE id = ${prior.id}`);
              prior.noteTypeId = type.id;
            }
            // Only the templates changed: keep LearnForge's content. A new layout or a newer Anki copy brings Anki's.
            const keepFields = !newer && !typeChanged;
            const current = keepFields
              ? (await tx.execute<{ fields: Record<string, string>; tags: string[] }>(sql`SELECT fields, tags FROM notes WHERE id = ${prior.id}`)).rows[0]
              : { fields, tags: note.tags };
            const plannedNow = keepFields ? plannedCards(type, current.fields, deckParts.join("::"), current.tags, { keepOne: true }) : planned;
            if (!keepFields) {
              await tx.execute(sql`UPDATE notes SET fields = ${JSON.stringify(fields)}::jsonb, tags = ${textArray(note.tags)}, updated_at = NOW() WHERE id = ${prior.id}`);
            }
            await syncImportedCards(tx, prior.id, topicId, plannedNow, keepFields ? deriveConcept(type, current.fields) : concept, current.tags, supported, scheduleFor, stats);
            stats.notes.updated++;
            updatedNotes.push(prior.id);
            return prior.id;
          }
          const ins = await tx.execute<{ id: string }>(sql`
            INSERT INTO notes (user_id, note_type_id, topic_id, fields, tags, anki_guid)
            VALUES (${userId}, ${type.id}, ${topicId}, ${JSON.stringify(fields)}::jsonb, ${textArray(note.tags)}, ${note.guid})
            RETURNING id
          `);
          const noteId = ins.rows[0].id;
          await syncImportedCards(tx, noteId, topicId, planned, concept, note.tags, supported, scheduleFor, stats);
          stats.notes.created++;
          return noteId;
        });
        batchRecords.push({ kind: "note", key: note.guid, localId: noteId, raw: noteRaw(note) });
        for (const c of ankiCards) {
          if (!planned.some(p => ankiFor(p) === c)) stats.cards.notRendered++;
          batchRecords.push({ kind: "card", key: `${note.guid}:${c.ord}`, localId: null, raw: { ...c, revlog: revlogByCard.get(c.id) ?? [] } });
        }
      } catch (err) {
        fail(note.guid, err instanceof Error ? err.message : String(err));
      }
    }
    await upsertRecords(db, userId, importId, batchRecords);
    await opts.onProgress?.(Math.min(start + batchSize, pkg.notes.length), pkg.notes.length);
  }

  for (const id of updatedNotes) await refreshDerivedOriginals(db, userId, id);
  // Types left behind by a layout change are empty now; drop them so the old layout does not linger.
  // A type that still holds a card (a template Anki dropped, suspended as a vanished gap) stays with its history.
  for (const nt of pkg.noteTypes) {
    if (!usedTypeIds.has(nt.id)) continue;
    await db.execute(sql`
      DELETE FROM note_types t WHERE t.user_id = ${userId} AND t.anki_key = ${String(nt.id)} AND t.anki_schema <> ${schemaHash(nt)}
        AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.note_type_id = t.id)
        AND NOT EXISTS (SELECT 1 FROM cards c JOIN card_templates ct ON ct.id = c.template_id WHERE ct.note_type_id = t.id)
    `);
  }
  return stats;
}

function noteRaw(note: AnkiNote) {
  return { id: note.id, mid: note.mid, mod: note.mod, tags: note.tags, fields: note.fields, ...note.raw };
}
