import { pgTable, uuid, varchar, timestamp, text, integer, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cards } from "./cards.js";
import { users } from "./users.js";

export const images = pgTable("images", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  /** SHA-256 of the bytes; an Anki import stores each distinct file once per user. NULL for uploads before release 3. */
  contentHash: text("content_hash"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("images_user_hash_idx").on(t.userId, t.contentHash),
]);

export const imagesRelations = relations(images, ({ one }) => ({
  card: one(cards, { fields: [images.cardId], references: [cards.id] }),
  user: one(users, { fields: [images.userId], references: [users.id] }),
}));
