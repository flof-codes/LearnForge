import { pgTable, uuid, text, integer, smallint, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.js";

/**
 * Anki's "model": fields plus one or more card templates plus CSS. Built-in
 * types (Open, Choice, Cloze) are private copies per user, keyed by
 * `builtin_key`; `customized` flips once the user edits templates or CSS, and a
 * later `builtin_version` bump only touches copies that are not customized.
 */
export const noteTypes = pgTable("note_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  builtinKey: text("builtin_key"), // open | choice | cloze | null for the user's own types
  builtinVersion: integer("builtin_version").notNull().default(1),
  customized: boolean("customized").notNull().default(false),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("standard"), // standard | cloze
  css: text("css").notNull().default(""),
  /** Field whose text names the note in lists and seeds `concept` when none is given. */
  sortFieldKey: text("sort_field_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  unique("note_types_user_builtin_uq").on(t.userId, t.builtinKey),
  index("note_types_user_idx").on(t.userId),
]);

/** Fields are addressed by a short stable key (f1, f2 …) so renames never move note content. */
export const noteTypeFields = pgTable("note_type_fields", {
  id: uuid("id").defaultRandom().primaryKey(),
  noteTypeId: uuid("note_type_id").references(() => noteTypes.id, { onDelete: "cascade" }).notNull(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  ord: smallint("ord").notNull(),
}, (t) => [
  unique("note_type_fields_key_uq").on(t.noteTypeId, t.key),
  unique("note_type_fields_ord_uq").on(t.noteTypeId, t.ord),
]);

/** One template per card a note can produce. Cards reference the id, so reordering is harmless. */
export const cardTemplates = pgTable("card_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  noteTypeId: uuid("note_type_id").references(() => noteTypes.id, { onDelete: "cascade" }).notNull(),
  ord: smallint("ord").notNull(),
  name: text("name").notNull(),
  frontTemplate: text("front_template").notNull(),
  backTemplate: text("back_template").notNull(),
}, (t) => [
  unique("card_templates_ord_uq").on(t.noteTypeId, t.ord),
]);

export const noteTypesRelations = relations(noteTypes, ({ many }) => ({
  fields: many(noteTypeFields),
  templates: many(cardTemplates),
}));
export const noteTypeFieldsRelations = relations(noteTypeFields, ({ one }) => ({
  noteType: one(noteTypes, { fields: [noteTypeFields.noteTypeId], references: [noteTypes.id] }),
}));
export const cardTemplatesRelations = relations(cardTemplates, ({ one }) => ({
  noteType: one(noteTypes, { fields: [cardTemplates.noteTypeId], references: [noteTypes.id] }),
}));
