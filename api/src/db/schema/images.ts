import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cards } from "./cards.js";
import { users } from "./users.js";

export const images = pgTable("images", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const imagesRelations = relations(images, ({ one }) => ({
  card: one(cards, { fields: [images.cardId], references: [cards.id] }),
  user: one(users, { fields: [images.userId], references: [users.id] }),
}));
