import { pgTable, uuid, integer, text, jsonb, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cards } from "./cards.js";

/**
 * The anchor question of a card. Every variant the tutor asks derives from the
 * current original, never from the previous variant, so wording cannot drift.
 * Rows are immutable: a correction creates the next version and supersedes the old one.
 */
export const cardOriginals = pgTable("card_originals", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  version: integer("version").notNull(),
  questionText: text("question_text").notNull(),
  expectedAnswer: text("expected_answer"),
  /** Ordered answer options for choice questions: [{ id, text, correct }]. */
  options: jsonb("options"),
  context: text("context"),
  createdBy: text("created_by").notNull().default("tutor"), // tutor | user | derived
  status: text("status").notNull().default("current"), // current | superseded | disputed
  /** Set when the card content changed after this original was written. */
  isStale: boolean("is_stale").notNull().default(false),
  disputeNote: text("dispute_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("card_originals_card_version_uq").on(t.cardId, t.version),
  index("card_originals_card_idx").on(t.cardId),
]);

export const cardOriginalsRelations = relations(cardOriginals, ({ one }) => ({
  card: one(cards, { fields: [cardOriginals.cardId], references: [cards.id] }),
}));
