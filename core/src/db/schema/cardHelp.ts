import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cards } from "./cards.js";
import { cardQuestions } from "./cardQuestions.js";

/**
 * What the learner told the tutor about a question: preset labels and a note.
 * `scope = 'card'` guides every question written for the card from then on;
 * `scope = 'question'` only the rewrite asked for right then.
 * `card_question_id` is the question the feedback was given on, `replacement_id`
 * the question written from it; undoing the feedback drops the replacement.
 */
export const cardFeedback = pgTable("card_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
  note: text("note").notNull().default(""),
  scope: text("scope").notNull(), // question | card
  questionStem: text("question_stem").notNull(),
  cardQuestionId: uuid("card_question_id").references(() => cardQuestions.id, { onDelete: "set null" }),
  replacementId: uuid("replacement_id").references(() => cardQuestions.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("card_feedback_card_idx").on(t.cardId),
]);

/** Terms the learner saved to a card from a generated definition; every later question underlines them. */
export const cardTerms = pgTable("card_terms", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  term: text("term").notNull(),
  definition: text("definition").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("card_terms_card_term_uq").on(t.cardId, sql`lower(${t.term})`),
]);

/**
 * Generated help, kept so a second look is instant and costs nothing:
 * a definition or a tutorial of a term (`subject` = the term, lower case), or a
 * tutorial of a whole question (`card_question_id` set, `subject` empty).
 * A row is fresh while `card_updated_at` matches the card and `prompt_version`
 * the current rules.
 */
export const cardHelp = pgTable("card_help", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  kind: text("kind").notNull(), // definition | tutorial
  subject: text("subject").notNull().default(""),
  cardQuestionId: uuid("card_question_id").references(() => cardQuestions.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  promptVersion: integer("prompt_version").notNull(),
  model: text("model").notNull(),
  cardUpdatedAt: timestamp("card_updated_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("card_help_card_idx").on(t.cardId),
]);
