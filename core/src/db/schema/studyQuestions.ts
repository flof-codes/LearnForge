import { pgTable, uuid, smallint, real, text, timestamp, index } from "drizzle-orm/pg-core";
import { cards } from "./cards.js";
import { studySessions } from "./studySessions.js";
import { cardOriginals } from "./cardOriginals.js";

/**
 * A ticket issued by the server when it serves a card to a tutor session.
 * Freezes the settings the question is asked under (level, change rate, original)
 * before the tutor asks anything. Exactly one review may answer a ticket.
 */
export const studyQuestions = pgTable("study_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => studySessions.id, { onDelete: "cascade" }).notNull(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  originalId: uuid("original_id").references(() => cardOriginals.id, { onDelete: "set null" }),
  cardLevel: smallint("card_level").notNull(),
  changeRate: real("change_rate").notNull(),
  rateSource: text("rate_source").notNull(), // card | topic | default
  /** fsrs_state.last_review at serve time; a later review invalidates the ticket. */
  lastReviewAtServe: timestamp("last_review_at_serve", { withTimezone: true }),
  servedAt: timestamp("served_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("study_questions_session_idx").on(t.sessionId),
  index("study_questions_card_idx").on(t.cardId),
]);
