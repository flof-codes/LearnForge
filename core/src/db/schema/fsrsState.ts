import { pgTable, uuid, doublePrecision, timestamp, integer, smallint } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cards } from "./cards.js";

export const fsrsState = pgTable("fsrs_state", {
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).primaryKey(),
  stability: doublePrecision("stability").notNull().default(0),
  difficulty: doublePrecision("difficulty").notNull().default(0),
  due: timestamp("due", { withTimezone: true }).defaultNow().notNull(),
  lastReview: timestamp("last_review", { withTimezone: true }),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  state: smallint("state").notNull().default(0),
});

export const fsrsStateRelations = relations(fsrsState, ({ one }) => ({
  card: one(cards, { fields: [fsrsState.cardId], references: [cards.id] }),
}));
