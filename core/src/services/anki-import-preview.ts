import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import type { AnkiPackage } from "../lib/apkg/package.js";
import { deckPaths, existingGuids, homeDeck, isSupportedType, schemaHash, type AnkiPreview } from "./anki-import-shared.js";

/** What an Anki package holds and what importing it would change, read without writing anything. */
export async function previewAnkiPackage(db: Db, userId: string, pkg: AnkiPackage): Promise<AnkiPreview> {
  const paths = deckPaths(pkg);
  const deckCounts = new Map<string, number>();
  const counts = { notes: pkg.notes.length, cards: pkg.cards.length, reviewLogEntries: pkg.revlogCount, media: pkg.media.length, mediaBytes: 0, new: 0, learning: 0, review: 0, suspended: 0 };
  for (const c of pkg.cards) {
    const p = (paths.get(homeDeck(c)) ?? ["Default"]).join("::");
    deckCounts.set(p, (deckCounts.get(p) ?? 0) + 1);
    if (c.queue === -1) counts.suspended++;
    if (c.type === 0) counts.new++;
    else if (c.type === 2) counts.review++;
    else counts.learning++;
  }
  counts.mediaBytes = pkg.media.reduce((s, m) => s + (m.size ?? 0), 0);

  const known = await db.execute<{ anki_key: string; anki_schema: string }>(sql`
    SELECT anki_key, anki_schema FROM note_types WHERE user_id = ${userId} AND anki_key IS NOT NULL
  `);
  const knownKeys = new Set(known.rows.map(r => `${r.anki_key}:${r.anki_schema}`));
  const notesPerType = new Map<number, number>();
  for (const n of pkg.notes) notesPerType.set(n.mid, (notesPerType.get(n.mid) ?? 0) + 1);
  const noteTypes = pkg.noteTypes
    .filter(nt => notesPerType.has(nt.id))
    .map(nt => ({
      name: nt.name, kind: nt.kind === 1 ? "cloze" as const : "standard" as const, notes: notesPerType.get(nt.id) ?? 0,
      supported: isSupportedType(nt), known: knownKeys.has(`${nt.id}:${schemaHash(nt)}`),
    }));

  const existing = await existingGuids(db, userId, pkg.notes.map(n => n.guid));
  let newer = 0;
  for (const n of pkg.notes) {
    const e = existing.get(n.guid);
    if (e && n.mod * 1000 > e.updatedAt.getTime()) newer++;
  }

  return {
    version: pkg.version, schema: pkg.schema, counts,
    decks: [...deckCounts.entries()].map(([p, cards]) => ({ path: p, cards })).sort((a, b) => a.path.localeCompare(b.path)),
    noteTypes,
    duplicates: { total: existing.size, newer },
  };
}
