import { pgTable, uuid, smallint, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cards } from "./cards.js";

export const bloomState = pgTable("bloom_state", {
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).primaryKey(),
  currentLevel: smallint("current_level").notNull().default(0),
  highestReached: smallint("highest_reached").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const bloomStateRelations = relations(bloomState, ({ one }) => ({
  card: one(cards, { fields: [bloomState.cardId], references: [cards.id] }),
}));
