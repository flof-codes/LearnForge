import { pgTable, uuid, text, varchar, real, smallint, boolean, timestamp, jsonb, customType, check, unique, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { topics } from "./topics.js";
import { notes } from "./notes.js";
import { cardTemplates } from "./noteTypes.js";

const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    return String(value).replace(/[[\]]/g, "").split(",").map(Number);
  },
});

export const cards = pgTable("cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }).notNull(),
  concept: text("concept").notNull(),
  frontHtml: text("front_html").notNull(),
  backHtml: text("back_html").notNull(),
  tags: text("tags").array().default([]),
  cardType: varchar("card_type", { length: 20 }).notNull().default("standard"),
  clozeData: jsonb("cloze_data"),
  /** Question variation 0..1 for this card; NULL inherits from the topic chain. */
  changeRate: real("change_rate"),
  /** The current anchor question (card_originals.id). No FK to avoid a cycle; the originals table cascades from cards. */
  currentOriginalId: uuid("current_original_id"),
  /** Typed cards: the note and template they render from. NULL = Freeform, the card's own HTML is the truth. */
  noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => cardTemplates.id, { onDelete: "cascade" }),
  /** Cloze cards: the gap number this card hides; 0 on every other card so the uniqueness below holds. */
  clozeNumber: smallint("cloze_number").notNull().default(0),
  suspended: boolean("suspended").notNull().default(false),
  /** Why: gap (its cloze gap vanished, comes back with the gap), user, anki (suspended in Anki), unsupported (note type LearnForge cannot render). */
  suspendedBy: text("suspended_by"),
  rendererVersion: smallint("renderer_version"),
  embedding: vector("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  check("cards_change_rate_range", sql`${t.changeRate} IS NULL OR (${t.changeRate} >= 0 AND ${t.changeRate} <= 1)`),
  unique("cards_note_template_cloze_uq").on(t.noteId, t.templateId, t.clozeNumber),
  index("cards_note_idx").on(t.noteId),
]);

export const cardsRelations = relations(cards, ({ one }) => ({
  topic: one(topics, { fields: [cards.topicId], references: [topics.id] }),
}));
