import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.js";
import { topics } from "./topics.js";
import { noteTypes } from "./noteTypes.js";

/**
 * The knowledge itself, once. A note produces one card per template (or per
 * cloze number); all of its cards live in the note's topic. Field values are
 * HTML keyed by the field key (f1, f2 …).
 */
export const notes = pgTable("notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  noteTypeId: uuid("note_type_id").references(() => noteTypes.id, { onDelete: "cascade" }).notNull(),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }).notNull(),
  fields: jsonb("fields").$type<Record<string, string>>().notNull(),
  tags: text("tags").array().notNull().default([]),
  /** Anki's note guid, kept so an imported deck can be re-exported. */
  ankiGuid: text("anki_guid"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  index("notes_user_idx").on(t.userId),
  index("notes_topic_idx").on(t.topicId),
]);

export const notesRelations = relations(notes, ({ one }) => ({
  noteType: one(noteTypes, { fields: [notes.noteTypeId], references: [noteTypes.id] }),
  topic: one(topics, { fields: [notes.topicId], references: [topics.id] }),
}));
