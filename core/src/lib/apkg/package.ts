import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { ValidationError } from "../errors.js";
import { listZip, readZipEntry, type ZipEntry } from "./zip.js";
import { parseMessage, pbBytes, pbHas, pbInt, pbString } from "./protobuf.js";

/**
 * Reads every Anki package flavour into one shape:
 * - legacy 1: `collection.anki2` (schema 11), JSON `media` map, raw media;
 * - legacy 2: `collection.anki21` (schema 11), `meta` v2, JSON map, raw media;
 * - latest:   `collection.anki21b` zstd (schema 18), `meta` v3, protobuf map, zstd media.
 * `.colpkg` backups use the same container. Nothing is interpreted here beyond
 * the format; mapping onto LearnForge happens in the import service.
 */

export type PackageVersion = "legacy1" | "legacy2" | "latest";

export interface ReadLimits {
  maxCollectionBytes: number;
  maxMediaFileBytes: number;
  /** All media of one package together; overlapping zip entries cannot multiply the work past this. */
  maxTotalMediaBytes: number;
  maxNotes: number;
  maxCards: number;
}

export const DEFAULT_LIMITS: ReadLimits = {
  maxCollectionBytes: 500 * 1024 * 1024,
  maxMediaFileBytes: 50 * 1024 * 1024,
  maxTotalMediaBytes: 2 * 1024 * 1024 * 1024,
  maxNotes: 100_000,
  maxCards: 300_000,
};

export interface AnkiNoteType {
  id: number;
  name: string;
  /** 0 standard, 1 cloze. */
  kind: number;
  css: string;
  sortFieldIdx: number;
  mtime: number;
  /** Anki's stock kind (6 = image occlusion), 0 when not a stock type. */
  originalStockKind: number;
  fields: Array<{ ord: number; name: string }>;
  templates: Array<{ ord: number; name: string; qfmt: string; afmt: string }>;
  raw: Record<string, unknown>;
}

export interface AnkiDeck { id: number; path: string[]; filtered: boolean; raw: Record<string, unknown> }

export interface AnkiNote {
  id: number; guid: string; mid: number; mod: number; tags: string[]; fields: string[];
  raw: Record<string, unknown>;
}

export interface AnkiCard {
  id: number; nid: number; did: number; odid: number; ord: number; type: number; queue: number;
  due: number; odue: number; ivl: number; factor: number; reps: number; lapses: number; left: number;
  flags: number; mod: number; usn: number;
  /** Parsed `cards.data` JSON: FSRS memory state (`s`, `d`, `decay`, `lrt`) when Anki used FSRS. */
  data: Record<string, unknown>;
}

export interface AnkiRevlog { id: number; cid: number; usn: number; ease: number; ivl: number; lastIvl: number; factor: number; time: number; type: number }

export interface AnkiMediaRef { name: string; entry: string; size: number | null; sha1: string | null }

export interface AnkiPackage {
  version: PackageVersion;
  schema: 11 | 18;
  /** Collection creation time in seconds; review-card due days count from here. */
  crt: number;
  noteTypes: AnkiNoteType[];
  decks: AnkiDeck[];
  deckConfigs: Array<Record<string, unknown>>;
  notes: AnkiNote[];
  cards: AnkiCard[];
  media: AnkiMediaRef[];
  revlogCount: number;
  revlogFor(cardIds: number[]): AnkiRevlog[];
  readMedia(ref: AnkiMediaRef): Buffer;
  close(): void;
}

function zstd(buf: Buffer, max: number, what: string): Buffer {
  try {
    return zstdDecompressSync(buf, { maxOutputLength: max });
  } catch (err) {
    if (err instanceof RangeError || (err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") throw new ValidationError(`${what} exceeds the size limit`);
    throw new ValidationError(`${what} is damaged`);
  }
}

function detectVersion(entries: Map<string, ZipEntry>, buf: Buffer): PackageVersion {
  const meta = entries.get("meta");
  if (meta) {
    const version = pbInt(parseMessage(readZipEntry(buf, meta, 1024)), 1);
    if (version === 1) return "legacy1";
    if (version === 2) return "legacy2";
    if (version === 3) return "latest";
    throw new ValidationError("This package was made by a newer Anki than LearnForge can read");
  }
  if (entries.has("collection.anki21")) return "legacy2";
  if (entries.has("collection.anki2")) return "legacy1";
  throw new ValidationError("Not an Anki package: no collection inside");
}

function readMediaMap(version: PackageVersion, entries: Map<string, ZipEntry>, buf: Buffer): AnkiMediaRef[] {
  const entry = entries.get("media");
  if (!entry) return [];
  if (version === "latest") {
    const bytes = zstd(readZipEntry(buf, entry, 64 * 1024 * 1024), 64 * 1024 * 1024, "The media list");
    return pbBytes(parseMessage(bytes), 1).map((m, i) => {
      const f = parseMessage(m);
      const sha = pbBytes(f, 3)[0];
      return { name: pbString(f, 1), entry: String(i), size: pbInt(f, 2), sha1: sha ? sha.toString("hex") : null };
    });
  }
  let map: Record<string, unknown>;
  try {
    map = JSON.parse(readZipEntry(buf, entry, 64 * 1024 * 1024).toString("utf8"));
  } catch {
    throw new ValidationError("The media list is damaged");
  }
  return Object.entries(map)
    .filter(([, name]) => typeof name === "string")
    .map(([key, name]) => ({ name: name as string, entry: key, size: entries.get(key)?.size ?? null, sha1: null }));
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : Number(v ?? 0));
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function parseJsonObject(text: unknown): Record<string, unknown> {
  if (typeof text !== "string" || !text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Schema-18 name columns use Anki's own `unicase` collation, which node:sqlite
 * cannot register, and SQLite then refuses queries that touch those tables.
 * The collection is our private temp copy, so the collation is removed from
 * its schema text; LearnForge only scans these tables, never searches by name.
 */
function dropUnicase(file: string) {
  const db = new DatabaseSync(file);
  try {
    // Defensive mode (on by default in newer Node) forbids writable_schema. Missing from @types/node 22.
    (db as DatabaseSync & { enableDefensive?: (on: boolean) => void }).enableDefensive?.(false);
    db.exec("PRAGMA writable_schema = ON");
    db.exec("UPDATE sqlite_master SET sql = replace(sql, 'COLLATE unicase', '') WHERE sql LIKE '%COLLATE unicase%'");
    db.exec("PRAGMA writable_schema = OFF");
  } finally {
    db.close();
  }
}

/**
 * The tables must be plain tables: no view, and no hidden or generated column,
 * whose value SQLite would compute on every read (a hostile package could make
 * a few kilobytes expand into gigabytes that way).
 */
function requireTables(db: DatabaseSync, names: string[]) {
  const rows = db.prepare("SELECT name, type FROM sqlite_master").all() as Array<{ name: string; type: string }>;
  for (const n of names) {
    const row = rows.find(r => r.name === n);
    if (!row || row.type !== "table") throw new ValidationError(`The collection has no ${n} table`);
    const cols = db.prepare(`PRAGMA table_xinfo("${n}")`).all() as Array<{ hidden: number }>;
    if (cols.some(c => c.hidden !== 0)) throw new ValidationError(`The collection's ${n} table has computed columns`);
  }
}

function readSchema11(db: DatabaseSync) {
  const col = db.prepare("SELECT crt, models, decks, dconf FROM col LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!col) throw new ValidationError("The collection is empty");
  const models = parseJsonObject(col.models);
  const noteTypes: AnkiNoteType[] = Object.values(models).map((m) => {
    const o = m as Record<string, unknown>;
    const flds = Array.isArray(o.flds) ? o.flds as Array<Record<string, unknown>> : [];
    const tmpls = Array.isArray(o.tmpls) ? o.tmpls as Array<Record<string, unknown>> : [];
    const rest = Object.fromEntries(Object.entries(o).filter(([k]) => k !== "flds" && k !== "tmpls"));
    return {
      id: num(o.id), name: str(o.name), kind: num(o.type), css: str(o.css), sortFieldIdx: num(o.sortf), mtime: num(o.mod),
      originalStockKind: num(o.originalStockKind),
      fields: flds.map(f => ({ ord: num(f.ord), name: str(f.name) })),
      templates: tmpls.map(t => ({ ord: num(t.ord), name: str(t.name), qfmt: str(t.qfmt), afmt: str(t.afmt) })),
      raw: { ...rest, fieldsRaw: flds, templatesRaw: tmpls.map(({ qfmt: _q, afmt: _a, ...r }) => r) },
    };
  });
  const decks: AnkiDeck[] = Object.values(parseJsonObject(col.decks)).map((d) => {
    const o = d as Record<string, unknown>;
    return { id: num(o.id), path: str(o.name).split("::"), filtered: num(o.dyn) === 1, raw: o };
  });
  const deckConfigs = Object.values(parseJsonObject(col.dconf)) as Array<Record<string, unknown>>;
  return { crt: num(col.crt), noteTypes, decks, deckConfigs };
}

function readSchema18(db: DatabaseSync) {
  const col = db.prepare("SELECT crt FROM col LIMIT 1").get() as Record<string, unknown> | undefined;
  const fields = db.prepare("SELECT ntid, ord, name, config FROM fields ORDER BY ntid, ord").all() as Array<Record<string, unknown>>;
  const templates = db.prepare("SELECT ntid, ord, name, mtime_secs, config FROM templates ORDER BY ntid, ord").all() as Array<Record<string, unknown>>;
  const noteTypes: AnkiNoteType[] = (db.prepare("SELECT id, name, mtime_secs, config FROM notetypes").all() as Array<Record<string, unknown>>).map((t) => {
    const id = num(t.id);
    const cfg = parseMessage(Buffer.from(t.config as Uint8Array));
    return {
      id, name: str(t.name), kind: pbInt(cfg, 1), css: pbString(cfg, 3), sortFieldIdx: pbInt(cfg, 2), mtime: num(t.mtime_secs),
      originalStockKind: pbInt(cfg, 9),
      fields: fields.filter(f => num(f.ntid) === id).map(f => ({ ord: num(f.ord), name: str(f.name) })),
      templates: templates.filter(x => num(x.ntid) === id).map(x => {
        const c = parseMessage(Buffer.from(x.config as Uint8Array));
        return { ord: num(x.ord), name: str(x.name), qfmt: pbString(c, 1), afmt: pbString(c, 2) };
      }),
      raw: {
        config: Buffer.from(t.config as Uint8Array).toString("base64"),
        fieldConfigs: fields.filter(f => num(f.ntid) === id).map(f => Buffer.from(f.config as Uint8Array).toString("base64")),
        templateConfigs: templates.filter(x => num(x.ntid) === id).map(x => Buffer.from(x.config as Uint8Array).toString("base64")),
      },
    };
  });
  const decks: AnkiDeck[] = (db.prepare("SELECT id, name, mtime_secs, common, kind FROM decks").all() as Array<Record<string, unknown>>).map((d) => {
    const kind = parseMessage(Buffer.from(d.kind as Uint8Array));
    return {
      id: num(d.id), path: str(d.name).split("\x1f"), filtered: pbHas(kind, 2),
      raw: { mtime: num(d.mtime_secs), common: Buffer.from(d.common as Uint8Array).toString("base64"), kind: Buffer.from(d.kind as Uint8Array).toString("base64") },
    };
  });
  const deckConfigs = (db.prepare("SELECT id, name, mtime_secs, config FROM deck_config").all() as Array<Record<string, unknown>>).map(c => ({
    id: num(c.id), name: str(c.name), mtime: num(c.mtime_secs), config: Buffer.from(c.config as Uint8Array).toString("base64"),
  }));
  return { crt: num(col?.crt), noteTypes, decks, deckConfigs };
}

export function readAnkiPackage(buf: Buffer, limits: ReadLimits = DEFAULT_LIMITS, opts: { tempDir?: string } = {}): AnkiPackage {
  const entries = new Map(listZip(buf).map(e => [e.name, e]));
  const version = detectVersion(entries, buf);
  const collectionName = version === "latest" ? "collection.anki21b" : version === "legacy2" ? "collection.anki21" : "collection.anki2";
  const colEntry = entries.get(collectionName);
  if (!colEntry) throw new ValidationError(`The package has no ${collectionName}`);
  let colBytes = readZipEntry(buf, colEntry, limits.maxCollectionBytes);
  if (version === "latest") colBytes = zstd(colBytes, limits.maxCollectionBytes, "The collection");

  // The caller may name the parent, so a job killed mid-read leaves its copy where it cleans up.
  if (opts.tempDir) mkdirSync(opts.tempDir, { recursive: true });
  const dir = mkdtempSync(path.join(opts.tempDir ?? tmpdir(), "lf-anki-"));
  const file = path.join(dir, "collection.db");
  writeFileSync(file, colBytes);
  colBytes = Buffer.alloc(0);
  let db: DatabaseSync;
  try {
    dropUnicase(file);
    db = new DatabaseSync(file, { readOnly: true });
    // Never run functions named by the file's own schema; check pages as they are read.
    db.exec("PRAGMA trusted_schema = OFF");
    db.exec("PRAGMA cell_size_check = ON");
  } catch {
    rmSync(dir, { recursive: true, force: true });
    throw new ValidationError("The collection is not a readable database");
  }
  const close = () => { try { db.close(); } catch { /* already closed */ } rmSync(dir, { recursive: true, force: true }); };

  try {
    requireTables(db, ["col", "notes", "cards", "revlog"]);
    const schema: 11 | 18 = (db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'notetypes'").get() as { n: number }).n > 0 ? 18 : 11;
    if (schema === 18) requireTables(db, ["notetypes", "fields", "templates", "decks", "deck_config"]);
    const meta = schema === 18 ? readSchema18(db) : readSchema11(db);

    const noteCount = (db.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n;
    if (noteCount > limits.maxNotes) throw new ValidationError(`The package has ${noteCount} notes; the limit is ${limits.maxNotes}`);
    const cardCount = (db.prepare("SELECT count(*) AS n FROM cards").get() as { n: number }).n;
    if (cardCount > limits.maxCards) throw new ValidationError(`The package has ${cardCount} cards; the limit is ${limits.maxCards}`);

    const notes: AnkiNote[] = (db.prepare("SELECT id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data FROM notes ORDER BY id").all() as Array<Record<string, unknown>>).map(n => ({
      id: num(n.id), guid: str(n.guid), mid: num(n.mid), mod: num(n.mod),
      tags: str(n.tags).split(/\s+/).filter(Boolean), fields: str(n.flds).split("\x1f"),
      raw: { usn: num(n.usn), sfld: n.sfld, csum: num(n.csum), flags: num(n.flags), data: str(n.data) },
    }));
    const cards: AnkiCard[] = (db.prepare("SELECT id, nid, did, odid, ord, type, queue, due, odue, ivl, factor, reps, lapses, left, flags, mod, usn, data FROM cards ORDER BY nid, ord").all() as Array<Record<string, unknown>>).map(c => ({
      id: num(c.id), nid: num(c.nid), did: num(c.did), odid: num(c.odid), ord: num(c.ord), type: num(c.type), queue: num(c.queue),
      due: num(c.due), odue: num(c.odue), ivl: num(c.ivl), factor: num(c.factor), reps: num(c.reps), lapses: num(c.lapses),
      left: num(c.left), flags: num(c.flags), mod: num(c.mod), usn: num(c.usn), data: parseJsonObject(c.data),
    }));
    const media = readMediaMap(version, entries, buf);
    const revlogCount = (db.prepare("SELECT count(*) AS n FROM revlog").get() as { n: number }).n;

    let mediaBytesRead = 0;
    const revlogStmt = db.prepare("SELECT id, cid, usn, ease, ivl, lastIvl, factor, time, type FROM revlog WHERE cid IN (SELECT value FROM json_each(?)) ORDER BY cid, id");
    return {
      version, schema, crt: meta.crt, noteTypes: meta.noteTypes, decks: meta.decks, deckConfigs: meta.deckConfigs, notes, cards, media, revlogCount,
      revlogFor(cardIds) {
        if (cardIds.length === 0) return [];
        return (revlogStmt.all(JSON.stringify(cardIds)) as Array<Record<string, unknown>>).map(r => ({
          id: num(r.id), cid: num(r.cid), usn: num(r.usn), ease: num(r.ease), ivl: num(r.ivl), lastIvl: num(r.lastIvl),
          factor: num(r.factor), time: num(r.time), type: num(r.type),
        }));
      },
      readMedia(ref) {
        const entry = entries.get(ref.entry);
        if (!entry) throw new ValidationError(`Media file ${ref.name} is missing from the package`);
        if (mediaBytesRead >= limits.maxTotalMediaBytes) throw new ValidationError("The package's media exceed the total size limit");
        const cap = Math.min(limits.maxMediaFileBytes, limits.maxTotalMediaBytes - mediaBytesRead);
        // Charged before inflating: an entry that fails at its cap still spends it, so repeated
        // overlapping entries run out of budget instead of burning CPU until the job timeout.
        mediaBytesRead += cap;
        const raw = readZipEntry(buf, entry, cap);
        const bytes = version === "latest" ? zstd(raw, cap, `Media file ${ref.name}`) : raw;
        mediaBytesRead -= cap - bytes.length;
        return bytes;
      },
      close,
    };
  } catch (err) {
    close();
    throw err;
  }
}
