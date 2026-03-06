import { pgTable, uuid, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cards } from "./cards.js";

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  bloomLevel: smallint("bloom_level").notNull(),
  rating: smallint("rating").notNull(),
  questionText: text("question_text").notNull(),
  modality: text("modality").default("web").notNull(),
  answerExpected: text("answer_expected"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reviewsRelations = relations(reviews, ({ one }) => ({
  card: one(cards, { fields: [reviews.cardId], references: [cards.id] }),
}));
