import { pgTable, uuid, smallint, text, real, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cards } from "./cards.js";
import { studyQuestions } from "./studyQuestions.js";

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  bloomLevel: smallint("bloom_level").notNull(),
  rating: smallint("rating").notNull(),
  questionText: text("question_text").notNull(),
  modality: text("modality").default("web").notNull(),
  answerExpected: text("answer_expected"),
  userAnswer: text("user_answer"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),

  // --- Dials (rules version 2). NULL on rows written before release 1. ---
  /** The ticket this review answers; unique, so a ticket is graded at most once. NULL for web self-rating. */
  questionId: uuid("question_id").references(() => studyQuestions.id, { onDelete: "set null" }).unique(),
  style: text("style"), // open | single | multiple | self
  targetLevel: smallint("target_level"),
  cardLevel: smallint("card_level"),
  onLevel: boolean("on_level"),
  correctness: real("correctness"), // 0..1, NULL when self-rated
  gradedBy: text("graded_by"), // server | tutor | self
  changeRate: real("change_rate"),
  sessionDifficulty: real("session_difficulty"),
  levelStep: real("level_step"),
  intervalFactor: real("interval_factor"),
  fsrsIntervalDays: real("fsrs_interval_days"),
  scheduledDays: real("scheduled_days"),
  elapsedDays: real("elapsed_days"),
  retrievability: real("retrievability"),
  rulesVersion: smallint("rules_version"),
  fsrsParamsVersion: text("fsrs_params_version"),
  skipBloom: boolean("skip_bloom"),
  /** Bloom + FSRS state before this review, for undo of the latest review. */
  stateBefore: jsonb("state_before"),
});

export const reviewsRelations = relations(reviews, ({ one }) => ({
  card: one(cards, { fields: [reviews.cardId], references: [cards.id] }),
}));
