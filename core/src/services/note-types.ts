import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { FIGURE_FIELD, FRONT_FIGURE_FIELD } from "../lib/figures.js";

/**
 * Note types: fields + card templates + CSS. The built-ins below are copied
 * into each user's account on first use; the user may restyle them (which sets
 * `customized`) but their fields are fixed. To change fields, duplicate the type.
 */

/** 2: the optional fields "Figure" (back, below the answer) and "Front figure" (front, below the question). */
export const BUILTIN_TYPES_VERSION = 2;

export interface NoteTypeFieldDef { key: string; name: string; ord: number }
export interface CardTemplateDef { id?: string; ord: number; name: string; frontTemplate: string; backTemplate: string }

export interface NoteType {
  id: string;
  userId: string;
  builtinKey: string | null;
  builtinVersion: number;
  customized: boolean;
  name: string;
  kind: "standard" | "cloze";
  css: string;
  sortFieldKey: string | null;
  fields: NoteTypeFieldDef[];
  templates: Array<CardTemplateDef & { id: string }>;
  noteCount?: number;
}

// The back shows the full figure; the front's version with parts hidden steps aside when both exist.
const FIGURE_CSS = `.lf-figure { margin-top: 14px; text-align: center; }
.lf-figure img, .lf-figure svg { max-width: 100%; height: auto; }
.card:has(.lf-figure-back) .lf-figure-front { display: none; }`;

const FRONT_FIGURE_BLOCK = `{{#${FRONT_FIGURE_FIELD}}}<div class="lf-figure lf-figure-front">{{${FRONT_FIGURE_FIELD}}}</div>{{/${FRONT_FIGURE_FIELD}}}`;
const FIGURE_BLOCK = `{{#${FIGURE_FIELD}}}<div class="lf-figure lf-figure-back">{{${FIGURE_FIELD}}}</div>{{/${FIGURE_FIELD}}}`;

const BASE_CSS = `.card { font-family: "Segoe UI", system-ui, sans-serif; font-size: 17px; line-height: 1.55; padding: 4px; }
.q { font-weight: 600; margin-bottom: 12px; }
.opt { padding: 8px 12px; border: 1px solid rgba(128,128,128,.35); border-radius: 8px; margin-top: 6px; }
.why, .extra { margin-top: 12px; opacity: .85; }
hr { border: 0; border-top: 1px solid rgba(128,128,128,.3); margin: 14px 0; }
.cloze { font-weight: 700; color: #2563eb; }
.cloze-inactive { }
.typeans { width: 100%; padding: 6px 8px; margin-top: 8px; }
${FIGURE_CSS}`;

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];

export const BUILTIN_TYPES: Record<string, { name: string; kind: "standard" | "cloze"; css: string; sortFieldKey: string; fields: NoteTypeFieldDef[]; templates: CardTemplateDef[] }> = {
  open: {
    name: "Open",
    kind: "standard",
    css: BASE_CSS,
    sortFieldKey: "f1",
    fields: [
      { key: "f1", name: "Question", ord: 0 },
      { key: "f2", name: "Answer", ord: 1 },
      { key: "f3", name: "Explanation", ord: 2 },
      { key: "f4", name: FIGURE_FIELD, ord: 3 },
      { key: "f5", name: FRONT_FIGURE_FIELD, ord: 4 },
    ],
    templates: [{
      ord: 0, name: "Card 1",
      frontTemplate: `<div class="q">{{Question}}</div>${FRONT_FIGURE_BLOCK}`,
      backTemplate: `{{FrontSide}}<hr id="answer">{{Answer}}${FIGURE_BLOCK}{{#Explanation}}<div class="why">{{Explanation}}</div>{{/Explanation}}`,
    }],
  },
  choice: {
    name: "Choice",
    kind: "standard",
    css: BASE_CSS,
    sortFieldKey: "f1",
    fields: [
      { key: "f1", name: "Question", ord: 0 },
      ...CHOICE_LETTERS.map((l, i) => ({ key: `f${i + 2}`, name: `Option ${l}`, ord: i + 1 })),
      { key: "f8", name: "Correct", ord: 7 },
      { key: "f9", name: "Explanation", ord: 8 },
      { key: "f10", name: FIGURE_FIELD, ord: 9 },
      { key: "f11", name: FRONT_FIGURE_FIELD, ord: 10 },
    ],
    templates: [{
      ord: 0, name: "Card 1",
      frontTemplate: `<div class="q">{{Question}}</div>${FRONT_FIGURE_BLOCK}\n` + CHOICE_LETTERS.map(l =>
        `{{#Option ${l}}}<div class="opt">${l} · {{Option ${l}}}</div>{{/Option ${l}}}`).join("\n"),
      backTemplate: `{{FrontSide}}<hr id="answer">Correct: <b>{{Correct}}</b>${FIGURE_BLOCK}{{#Explanation}}<div class="why">{{Explanation}}</div>{{/Explanation}}`,
    }],
  },
  cloze: {
    name: "Cloze",
    kind: "cloze",
    css: BASE_CSS,
    sortFieldKey: "f1",
    fields: [
      { key: "f1", name: "Text", ord: 0 },
      { key: "f2", name: "Extra", ord: 1 },
      { key: "f3", name: FIGURE_FIELD, ord: 2 },
      { key: "f4", name: FRONT_FIGURE_FIELD, ord: 3 },
    ],
    templates: [{
      ord: 0, name: "Cloze",
      frontTemplate: `{{cloze:Text}}${FRONT_FIGURE_BLOCK}`,
      // No {{FrontSide}} here, so a front figure stands in on the back when there is no full one.
      backTemplate: `{{cloze:Text}}${FIGURE_BLOCK}{{^${FIGURE_FIELD}}}${FRONT_FIGURE_BLOCK}{{/${FIGURE_FIELD}}}{{#Extra}}<div class="extra">{{Extra}}</div>{{/Extra}}`,
    }],
  },
};

interface TypeRow extends Record<string, unknown> {
  id: string; user_id: string; builtin_key: string | null; builtin_version: number; customized: boolean;
  name: string; kind: string; css: string; sort_field_key: string | null;
}

async function loadTypes(db: Db, where: ReturnType<typeof sql>): Promise<NoteType[]> {
  const types = await db.execute<TypeRow>(sql`SELECT * FROM note_types WHERE ${where} ORDER BY builtin_key NULLS LAST, name`);
  if (types.rows.length === 0) return [];
  const ids = sql.join(types.rows.map(t => sql`${t.id}::uuid`), sql`, `);
  const fields = await db.execute<{ note_type_id: string; key: string; name: string; ord: number }>(sql`
    SELECT note_type_id, key, name, ord FROM note_type_fields WHERE note_type_id IN (${ids}) ORDER BY ord
  `);
  const templates = await db.execute<{ id: string; note_type_id: string; ord: number; name: string; front_template: string; back_template: string }>(sql`
    SELECT id, note_type_id, ord, name, front_template, back_template FROM card_templates WHERE note_type_id IN (${ids}) ORDER BY ord
  `);
  const counts = await db.execute<{ note_type_id: string; n: number }>(sql`
    SELECT note_type_id, count(*)::int AS n FROM notes WHERE note_type_id IN (${ids}) GROUP BY note_type_id
  `);
  const countBy = new Map(counts.rows.map(c => [c.note_type_id, c.n]));
  return types.rows.map(t => ({
    id: t.id, userId: t.user_id, builtinKey: t.builtin_key, builtinVersion: t.builtin_version, customized: t.customized,
    name: t.name, kind: t.kind as NoteType["kind"], css: t.css, sortFieldKey: t.sort_field_key,
    fields: fields.rows.filter(f => f.note_type_id === t.id).map(f => ({ key: f.key, name: f.name, ord: f.ord })),
    templates: templates.rows.filter(x => x.note_type_id === t.id).map(x => ({ id: x.id, ord: x.ord, name: x.name, frontTemplate: x.front_template, backTemplate: x.back_template })),
    noteCount: countBy.get(t.id) ?? 0,
  }));
}

/**
 * What a customized copy gets appended when a version adds a field: the user's
 * own design stays, and the new field shows up only where it is filled.
 */
const UPGRADE_BLOCKS: Record<string, { side: "front" | "back"; block: string }> = {
  [FIGURE_FIELD]: { side: "back", block: FIGURE_BLOCK },
  [FRONT_FIGURE_FIELD]: { side: "front", block: FRONT_FIGURE_BLOCK },
};

/**
 * Brings a user's built-in copies up to BUILTIN_TYPES_VERSION. Fields missing
 * by name are added with the built-in's key (empty in every existing note, so
 * nothing renders differently). An untouched copy takes the new templates and
 * CSS; a customized one keeps its design and gets the new fields' blocks
 * appended. Existing cards are not re-rendered: with the new fields empty
 * they look the same, and the next edit renders them from the new templates.
 */
async function upgradeBuiltinTypes(db: Db, userId: string, rows: Array<{ id: string; builtin_key: string; builtin_version: number }>): Promise<void> {
  for (const row of rows) {
    const def = BUILTIN_TYPES[row.builtin_key];
    if (!def || row.builtin_version >= BUILTIN_TYPES_VERSION) continue;
    await db.transaction(async (tx) => {
      // The row lock makes a concurrent request wait, then find the copy already upgraded.
      const locked = await tx.execute<{ builtin_version: number; customized: boolean; css: string }>(sql`
        SELECT builtin_version, customized, css FROM note_types WHERE id = ${row.id} AND user_id = ${userId} FOR UPDATE
      `);
      const current = locked.rows[0];
      if (!current || current.builtin_version >= BUILTIN_TYPES_VERSION) return;
      const fields = await tx.execute<{ key: string; name: string; ord: number }>(sql`
        SELECT key, name, ord FROM note_type_fields WHERE note_type_id = ${row.id}
      `);
      const names = new Set(fields.rows.map(f => f.name));
      const keys = new Set(fields.rows.map(f => f.key));
      let nextOrd = fields.rows.reduce((m, f) => Math.max(m, f.ord), -1) + 1;
      let nextKey = fields.rows.reduce((m, f) => Math.max(m, parseInt(f.key.slice(1), 10) || 0), 0) + 1;
      const added: string[] = [];
      for (const f of def.fields) {
        if (names.has(f.name)) continue;
        let key = f.key;
        if (keys.has(key)) key = `f${nextKey++}`;
        keys.add(key);
        await tx.execute(sql`INSERT INTO note_type_fields (note_type_id, key, name, ord) VALUES (${row.id}, ${key}, ${f.name}, ${nextOrd++})`);
        added.push(f.name);
      }
      const templates = await tx.execute<{ id: string; ord: number; front_template: string; back_template: string }>(sql`
        SELECT id, ord, front_template, back_template FROM card_templates WHERE note_type_id = ${row.id} ORDER BY ord
      `);
      if (!current.customized) {
        for (const t of templates.rows) {
          const next = def.templates.find(d => d.ord === t.ord);
          if (!next) continue;
          await tx.execute(sql`UPDATE card_templates SET front_template = ${next.frontTemplate}, back_template = ${next.backTemplate} WHERE id = ${t.id}`);
        }
        await tx.execute(sql`UPDATE note_types SET css = ${def.css} WHERE id = ${row.id}`);
      } else {
        for (const t of templates.rows) {
          let front = t.front_template, back = t.back_template;
          for (const name of added) {
            const up = UPGRADE_BLOCKS[name];
            if (!up || front.includes(`{{${name}}}`) || back.includes(`{{${name}}}`)) continue;
            if (up.side === "front") front += up.block; else back += up.block;
          }
          // A cloze back has no {{FrontSide}}: the front figure stands in there when there is no full one, as in the built-in.
          if (added.includes(FRONT_FIGURE_FIELD) && row.builtin_key === "cloze" && !back.includes("{{FrontSide}}") && !back.includes(`{{${FRONT_FIGURE_FIELD}}}`)) {
            back += `{{^${FIGURE_FIELD}}}${FRONT_FIGURE_BLOCK}{{/${FIGURE_FIELD}}}`;
          }
          if (front !== t.front_template || back !== t.back_template) {
            await tx.execute(sql`UPDATE card_templates SET front_template = ${front}, back_template = ${back} WHERE id = ${t.id}`);
          }
        }
        if (added.some(n => n in UPGRADE_BLOCKS) && !current.css.includes(".lf-figure")) {
          await tx.execute(sql`UPDATE note_types SET css = ${`${current.css}\n${FIGURE_CSS}`} WHERE id = ${row.id}`);
        }
      }
      await tx.execute(sql`UPDATE note_types SET builtin_version = ${BUILTIN_TYPES_VERSION}, updated_at = NOW() WHERE id = ${row.id}`);
    });
  }
}

/** Creates the user's private copies of the built-in types when they are missing, and upgrades outdated ones. Idempotent. */
export async function ensureBuiltinTypes(db: Db, userId: string): Promise<void> {
  const existing = await db.execute<{ id: string; builtin_key: string; builtin_version: number }>(sql`
    SELECT id, builtin_key, builtin_version FROM note_types WHERE user_id = ${userId} AND builtin_key IS NOT NULL
  `);
  await upgradeBuiltinTypes(db, userId, existing.rows);
  const have = new Set(existing.rows.map(r => r.builtin_key));
  for (const [key, def] of Object.entries(BUILTIN_TYPES)) {
    if (have.has(key)) continue;
    await db.transaction(async (tx) => {
      const inserted = await tx.execute<{ id: string }>(sql`
        INSERT INTO note_types (user_id, builtin_key, builtin_version, name, kind, css, sort_field_key)
        VALUES (${userId}, ${key}, ${BUILTIN_TYPES_VERSION}, ${def.name}, ${def.kind}, ${def.css}, ${def.sortFieldKey})
        ON CONFLICT (user_id, builtin_key) DO NOTHING
        RETURNING id
      `);
      const id = inserted.rows[0]?.id;
      if (!id) return;
      for (const f of def.fields) {
        await tx.execute(sql`INSERT INTO note_type_fields (note_type_id, key, name, ord) VALUES (${id}, ${f.key}, ${f.name}, ${f.ord})`);
      }
      for (const t of def.templates) {
        await tx.execute(sql`INSERT INTO card_templates (note_type_id, ord, name, front_template, back_template) VALUES (${id}, ${t.ord}, ${t.name}, ${t.frontTemplate}, ${t.backTemplate})`);
      }
    });
  }
}

export async function listNoteTypes(db: Db, userId: string, opts: { ensureBuiltins?: boolean } = {}): Promise<NoteType[]> {
  if (opts.ensureBuiltins !== false) await ensureBuiltinTypes(db, userId);
  return loadTypes(db, sql`user_id = ${userId}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getNoteType(db: Db, userId: string, noteTypeId: string): Promise<NoteType> {
  if (!UUID_RE.test(noteTypeId)) throw new NotFoundError("Note type not found");
  const [t] = await loadTypes(db, sql`user_id = ${userId} AND id = ${noteTypeId}`);
  if (!t) throw new NotFoundError("Note type not found");
  // A copy made before the last built-in change would refuse the new fields.
  if (t.builtinKey && t.builtinVersion < BUILTIN_TYPES_VERSION) {
    await upgradeBuiltinTypes(db, userId, [{ id: t.id, builtin_key: t.builtinKey, builtin_version: t.builtinVersion }]);
    const [fresh] = await loadTypes(db, sql`user_id = ${userId} AND id = ${noteTypeId}`);
    return fresh;
  }
  return t;
}

/** Resolves a type by id or by built-in key ("open", "choice", "cloze"), creating the built-ins if needed. */
export async function resolveNoteType(db: Db, userId: string, idOrKey: string): Promise<NoteType> {
  if (idOrKey in BUILTIN_TYPES) {
    await ensureBuiltinTypes(db, userId);
    const [t] = await loadTypes(db, sql`user_id = ${userId} AND builtin_key = ${idOrKey}`);
    if (!t) throw new NotFoundError("Note type not found");
    return t;
  }
  return getNoteType(db, userId, idOrKey);
}

export interface SaveNoteTypeInput {
  id?: string;
  name?: string;
  kind?: "standard" | "cloze";
  css?: string;
  /** Own types only: full field list in order. Names must be unique; keys of existing fields are kept by name. */
  fields?: Array<{ key?: string; name: string }>;
  /** Full template list in order; existing templates are matched by id, then by ord. */
  templates?: Array<{ id?: string; name?: string; frontTemplate: string; backTemplate: string }>;
  sortFieldKey?: string | null;
}

function validateTemplates(templates: SaveNoteTypeInput["templates"], kind: string) {
  if (!templates || templates.length === 0) throw new ValidationError("At least one card template is required");
  if (kind === "cloze" && templates.length !== 1) throw new ValidationError("A cloze type has exactly one template");
  for (const t of templates) {
    if (!t.frontTemplate?.trim()) throw new ValidationError("front_template must not be empty");
    if (typeof t.backTemplate !== "string") throw new ValidationError("back_template is required");
  }
}

/** Creates a note type, or updates one; built-ins accept css/templates/name only. Returns the saved type. */
export async function saveNoteType(db: Db, userId: string, input: SaveNoteTypeInput): Promise<NoteType> {
  if (input.id) {
    const current = await getNoteType(db, userId, input.id);
    if (current.builtinKey && input.fields) throw new ValidationError("Fields of a built-in type cannot change; duplicate the type instead");
    if (input.kind && input.kind !== current.kind) throw new ValidationError("The kind of a note type cannot change");
    if (input.templates) validateTemplates(input.templates, current.kind);
    await db.transaction(async (tx) => {
      const touchesDesign = input.css !== undefined || input.templates !== undefined;
      await tx.execute(sql`
        UPDATE note_types SET
          name = COALESCE(${input.name ?? null}, name),
          css = COALESCE(${input.css ?? null}, css),
          sort_field_key = ${input.sortFieldKey === undefined ? current.sortFieldKey : input.sortFieldKey},
          customized = customized OR ${touchesDesign && !!current.builtinKey},
          updated_at = NOW()
        WHERE id = ${current.id}
      `);
      if (input.fields) await replaceFields(tx, current, input.fields);
      if (input.templates) await replaceTemplates(tx, current, input.templates);
    });
    // Rendered HTML carries the CSS and templates, so every note of the type renders again.
    const { rerenderNotesOfType } = await import("./note-service.js");
    await rerenderNotesOfType(db, userId, current.id);
    return getNoteType(db, userId, current.id);
  }

  if (!input.name?.trim()) throw new ValidationError("name is required");
  const kind = input.kind ?? "standard";
  if (!input.fields || input.fields.length === 0) throw new ValidationError("At least one field is required");
  validateTemplates(input.templates, kind);
  const id = await db.transaction(async (tx) => {
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO note_types (user_id, name, kind, css, sort_field_key)
      VALUES (${userId}, ${input.name!.trim()}, ${kind}, ${input.css ?? BASE_CSS}, ${input.sortFieldKey ?? "f1"})
      RETURNING id
    `);
    const created = { id: ins.rows[0].id, fields: [] as NoteTypeFieldDef[], templates: [] as NoteType["templates"], kind } as unknown as NoteType;
    await replaceFields(tx, created, input.fields!);
    await replaceTemplates(tx, created, input.templates!);
    return created.id;
  });
  return getNoteType(db, userId, id);
}

async function replaceFields(tx: Db, type: NoteType, fields: Array<{ key?: string; name: string }>) {
  const names = fields.map(f => f.name.trim());
  if (names.some(n => !n)) throw new ValidationError("Field names must not be empty");
  if (new Set(names).size !== names.length) throw new ValidationError("Field names must be unique");
  const byName = new Map(type.fields.map(f => [f.name, f.key]));
  const usedKeys = new Set<string>();
  let next = type.fields.reduce((m, f) => Math.max(m, parseInt(f.key.slice(1), 10) || 0), 0) + 1;
  const sameCount = fields.length === type.fields.length;
  const resolved = fields.map((f, i) => {
    // Match by key, then by name, then (a pure rename) by position, so note content is never orphaned.
    let key = f.key ?? byName.get(f.name.trim()) ?? (sameCount ? type.fields[i]?.key : undefined);
    if (!key || usedKeys.has(key)) key = `f${next++}`;
    usedKeys.add(key);
    return { key, name: f.name.trim(), ord: i };
  });
  await tx.execute(sql`DELETE FROM note_type_fields WHERE note_type_id = ${type.id}`);
  for (const f of resolved) {
    await tx.execute(sql`INSERT INTO note_type_fields (note_type_id, key, name, ord) VALUES (${type.id}, ${f.key}, ${f.name}, ${f.ord})`);
  }
}

async function replaceTemplates(tx: Db, type: NoteType, templates: NonNullable<SaveNoteTypeInput["templates"]>) {
  const keep = new Set<string>();
  // Two passes: park the ords first so a reorder does not hit the (note_type_id, ord) uniqueness.
  await tx.execute(sql`UPDATE card_templates SET ord = ord + 1000 WHERE note_type_id = ${type.id}`);
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const existing = (t.id && type.templates.find(x => x.id === t.id)) || type.templates[i];
    const name = t.name?.trim() || existing?.name || `Card ${i + 1}`;
    if (existing) {
      await tx.execute(sql`
        UPDATE card_templates SET ord = ${i}, name = ${name}, front_template = ${t.frontTemplate}, back_template = ${t.backTemplate}
        WHERE id = ${existing.id}
      `);
      keep.add(existing.id);
    } else {
      const ins = await tx.execute<{ id: string }>(sql`
        INSERT INTO card_templates (note_type_id, ord, name, front_template, back_template)
        VALUES (${type.id}, ${i}, ${name}, ${t.frontTemplate}, ${t.backTemplate}) RETURNING id
      `);
      keep.add(ins.rows[0].id);
    }
  }
  const removed = type.templates.filter(x => !keep.has(x.id));
  for (const r of removed) {
    // Cards of a removed template disappear with it (Anki semantics); their history goes too.
    await tx.execute(sql`DELETE FROM card_templates WHERE id = ${r.id}`);
  }
}

/** Refuses while notes still use the type. */
export async function deleteNoteType(db: Db, userId: string, noteTypeId: string): Promise<void> {
  const type = await getNoteType(db, userId, noteTypeId);
  if ((type.noteCount ?? 0) > 0) throw new ValidationError(`Note type is used by ${type.noteCount} note(s); move or delete them first`);
  if (type.builtinKey) throw new ValidationError("Built-in types cannot be deleted");
  await db.execute(sql`DELETE FROM note_types WHERE id = ${type.id}`);
}
