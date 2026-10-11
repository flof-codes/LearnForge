import { pgTable, uuid, text, smallint, integer, real, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { cards } from "./cards.js";
import { cardOriginals } from "./cardOriginals.js";

/**
 * A question written ahead of time for one card at one Bloom level, shown by
 * the study view instead of the plain card.
 *
 * `payload` holds everything the client needs to ask and to give feedback
 * without another model call; its shape depends on `form` (see
 * services/card-questions.ts). A row is fresh while `card_updated_at` and
 * `original_id` still match the card and it has not been answered: `used_at`
 * is set by the review, so the next visit gets a new variant.
 * `status = 'skipped'` records that the card cannot be asked this way
 * (formulas, pictures that carry the meaning) and is shown as it is.
 */
export const cardQuestions = pgTable("card_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  bloomLevel: smallint("bloom_level").notNull(),
  form: text("form").notNull(), // choice | gap | open
  promptVersion: integer("prompt_version").notNull(),
  status: text("status").notNull().default("ready"), // ready | skipped
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  skipReason: text("skip_reason"),
  /** Session difficulty the question was written for. */
  difficulty: real("difficulty").notNull(),
  model: text("model").notNull(),
  originalId: uuid("original_id").references(() => cardOriginals.id, { onDelete: "set null" }),
  cardUpdatedAt: timestamp("card_updated_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("card_questions_card_idx").on(t.cardId),
]);
