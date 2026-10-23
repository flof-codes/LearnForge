import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import type { AnkiCard, AnkiNoteType, AnkiPackage } from "../lib/apkg/package.js";
import type { ImportedSchedule } from "../lib/apkg/schedule.js";
import { textArray } from "../lib/sql-array.js";

/** Types and helpers shared by the Anki preview and import. */

export type ScheduleMode = "keep" | "fresh";

export interface AnkiImportOptions {
  schedule: ScheduleMode;
  mediaDir: string;
  mediaQuotaBytes: number;
  batchSize?: number;
  onProgress?: (done: number, total: number) => Promise<void> | void;
  now?: Date;
}

export interface AnkiImportStats {
  noteTypes: { created: number; reused: number; updated: number; unsupported: number };
  topics: { created: number; reused: number };
  notes: { created: number; updated: number; unchanged: number; failed: number };
  cards: { created: number; suspended: number; unsupported: number; notRendered: number };
  schedule: Record<ImportedSchedule["source"], number>;
  media: { stored: number; reused: number; failed: number; overQuota: number };
  reviewLogEntries: number;
  errors: Array<{ guid: string; message: string }>;
}

export interface AnkiPreview {
  version: string;
  schema: number;
  counts: { notes: number; cards: number; reviewLogEntries: number; media: number; mediaBytes: number; new: number; learning: number; review: number; suspended: number };
  decks: Array<{ path: string; cards: number }>;
  noteTypes: Array<{ name: string; kind: "standard" | "cloze"; notes: number; supported: boolean; known: boolean }>;
  duplicates: { total: number; newer: number };
}

const STOCK_IMAGE_OCCLUSION = 6;
export const MAX_ERRORS = 50;

/** Anki's image occlusion type: the stock kind, or a copy of it (its template calls Anki's occlusion script). */
export function isOcclusionType(nt: Pick<AnkiNoteType, "originalStockKind" | "templates">): boolean {
  if (nt.originalStockKind === STOCK_IMAGE_OCCLUSION) return true;
  return nt.templates.some(t => /anki\.imageOcclusion/.test(t.qfmt + t.afmt));
}

/** The built-in occlusion type's fields; Anki's stock type has them in this order. */
export const OCCLUSION_FIELDS = ["Occlusion", "Image", "Header", "Back Extra", "Comments"];

/**
 * Maps an Anki occlusion type's field ords onto the built-in type's field names:
 * by name, else by Anki's stock order. Null when the occlusion and image fields cannot be found.
 */
export function occlusionFieldMap(fields: Array<{ ord: number; name: string }>): Map<number, string> | null {
  const byName = new Map(fields.map(f => [f.name.trim().toLowerCase(), f.ord]));
  const map = new Map<number, string>();
  if (OCCLUSION_FIELDS.slice(0, 2).every(n => byName.has(n.toLowerCase()))) {
    for (const n of OCCLUSION_FIELDS) {
      const ord = byName.get(n.toLowerCase());
      if (ord !== undefined) map.set(ord, n);
    }
    return map;
  }
  if (fields.length !== OCCLUSION_FIELDS.length) return null;
  for (const f of fields) map.set(f.ord, OCCLUSION_FIELDS[f.ord]);
  return map;
}

/** Image occlusion maps onto the built-in type; every other Anki type is copied as it is. */
export function isSupportedType(nt: AnkiNoteType): boolean {
  return !isOcclusionType(nt) || occlusionFieldMap(nt.fields) !== null;
}

export function schemaHash(nt: AnkiNoteType): string {
  const layout = [nt.kind, [...nt.fields].sort((a, b) => a.ord - b.ord).map(f => f.name), [...nt.templates].sort((a, b) => a.ord - b.ord).map(t => t.name)];
  return createHash("sha256").update(JSON.stringify(layout)).digest("hex").slice(0, 16);
}

/** The deck a card really belongs to: a filtered deck only borrows it. */
export const homeDeck = (c: AnkiCard) => (c.odid ? c.odid : c.did);

export function cardsByNote(pkg: AnkiPackage): Map<number, AnkiCard[]> {
  const map = new Map<number, AnkiCard[]>();
  for (const c of pkg.cards) {
    const list = map.get(c.nid) ?? [];
    list.push(c);
    map.set(c.nid, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.ord - b.ord);
  return map;
}

export function deckPaths(pkg: AnkiPackage): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const d of pkg.decks) if (!d.filtered) out.set(d.id, d.path.map(p => p.trim() || "Untitled"));
  // Cards whose deck is missing or filtered with no home land in "Default".
  for (const c of pkg.cards) {
    const id = homeDeck(c);
    if (!out.has(id)) out.set(id, ["Default"]);
  }
  return out;
}

export async function existingGuids(db: Db, userId: string, guids: string[]) {
  const map = new Map<string, { id: string; updatedAt: Date; noteTypeId: string }>();
  for (let i = 0; i < guids.length; i += 1000) {
    const chunk = guids.slice(i, i + 1000);
    const rows = await db.execute<{ id: string; anki_guid: string; updated_at: string; note_type_id: string }>(sql`
      SELECT id, anki_guid, updated_at, note_type_id FROM notes WHERE user_id = ${userId} AND anki_guid = ANY(${textArray(chunk)})
    `);
    for (const r of rows.rows) map.set(r.anki_guid, { id: r.id, updatedAt: new Date(r.updated_at), noteTypeId: r.note_type_id });
  }
  return map;
}
