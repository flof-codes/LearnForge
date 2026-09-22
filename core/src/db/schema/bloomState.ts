import { pgTable, uuid, smallint, real, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cards } from "./cards.js";

export const bloomState = pgTable("bloom_state", {
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).primaryKey(),
  currentLevel: smallint("current_level").notNull().default(0),
  highestReached: smallint("highest_reached").notNull().default(0),
  /** Progress inside the current level, -0.5 .. +0.5. Crossing an edge moves the level and resets to 0. */
  progress: real("progress").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const bloomStateRelations = relations(bloomState, ({ one }) => ({
  card: one(cards, { fields: [bloomState.cardId], references: [cards.id] }),
}));
