import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { topics } from "./topics.js";
import { users } from "./users.js";

export const shareLinks = pgTable("share_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: text("token").unique().notNull(),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  topic: one(topics, { fields: [shareLinks.topicId], references: [topics.id] }),
  owner: one(users, { fields: [shareLinks.ownerId], references: [users.id] }),
}));
