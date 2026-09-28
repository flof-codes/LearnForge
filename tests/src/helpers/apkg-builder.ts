import AdmZip from "adm-zip";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Synthetic Anki packages for what real Anki will not produce: the Anki 2.0
 * format (collection.anki2 alone, schema 11), hostile files and edge cases.
 * Packages exported by real Anki live in tests/fixtures/anki.
 */

export interface SynthNote { guid: string; mid: number; fields: string[]; tags?: string; mod?: number }
export interface SynthCard { nid: number; ord: number; did: number; type?: number; queue?: number; due?: number; ivl?: number; factor?: number; reps?: number }
export interface SynthModel { id: number; name: string; type?: number; css?: string; fields: string[]; templates: Array<{ name: string; qfmt: string; afmt: string }> }

export interface SynthOptions {
  models: SynthModel[];
  decks: Array<{ id: number; name: string }>;
  notes: SynthNote[];
  cards: SynthCard[];
  media?: Array<{ name: string; data: Buffer }>;
  /** Replace the notes table by a view, as a hostile package might. */
  notesAsView?: boolean;
  meta?: Buffer;
}

export const CRT = 1_700_000_000;

export function buildLegacyApkg(opts: SynthOptions): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "lf-synth-"));
  const file = path.join(dir, "collection.anki2");
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null,
      dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null,
      dconf text not null, tags text not null);
    CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null,
      usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null,
      reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
    CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null,
      lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
    CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
  `);
  db.exec(opts.notesAsView
    ? `CREATE TABLE real_notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
       CREATE VIEW notes AS SELECT * FROM real_notes;`
    : `CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null,
       tags text not null, flds text not null, sfld text not null, csum integer not null, flags integer not null, data text not null);`);

  const models: Record<string, unknown> = {};
  for (const m of opts.models) {
    models[String(m.id)] = {
      id: m.id, name: m.name, type: m.type ?? 0, css: m.css ?? ".card {}", sortf: 0, mod: CRT,
      flds: m.fields.map((name, ord) => ({ name, ord })),
      tmpls: m.templates.map((t, ord) => ({ name: t.name, ord, qfmt: t.qfmt, afmt: t.afmt })),
    };
  }
  const decks: Record<string, unknown> = {};
  for (const d of opts.decks) decks[String(d.id)] = { id: d.id, name: d.name, dyn: 0 };
  db.prepare("INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, '{}', ?, ?, '{}', '{}')").run(CRT, CRT, CRT, JSON.stringify(models), JSON.stringify(decks));

  const insertNote = db.prepare(`INSERT INTO ${opts.notesAsView ? "real_notes" : "notes"} VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0, 0, '')`);
  opts.notes.forEach((n, i) => insertNote.run(i + 1, n.guid, n.mid, n.mod ?? CRT, n.tags ? ` ${n.tags} ` : "", n.fields.join("\x1f"), n.fields[0] ?? ""));
  const insertCard = db.prepare("INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, '')");
  opts.cards.forEach((c, i) => insertCard.run(1000 + i, c.nid, c.did, c.ord, CRT, c.type ?? 0, c.queue ?? 0, c.due ?? i, c.ivl ?? 0, c.factor ?? 0, c.reps ?? 0));
  db.close();

  const zip = new AdmZip();
  zip.addFile("collection.anki2", readFileSync(file));
  const map: Record<string, string> = {};
  (opts.media ?? []).forEach((m, i) => { map[String(i)] = m.name; zip.addFile(String(i), m.data); });
  zip.addFile("media", Buffer.from(JSON.stringify(map)));
  if (opts.meta) zip.addFile("meta", opts.meta);
  rmSync(dir, { recursive: true, force: true });
  return zip.toBuffer();
}

export const BASIC_MODEL: SynthModel = {
  id: 1_600_000_000_001, name: "Synthetic Basic", fields: ["Front", "Back"],
  templates: [{ name: "Card 1", qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr id=answer>{{Back}}" }],
};

export const CLOZE_MODEL: SynthModel = {
  id: 1_600_000_000_002, name: "Synthetic Cloze", type: 1, fields: ["Text", "Extra"],
  templates: [{ name: "Cloze", qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}<br>{{Extra}}" }],
};
