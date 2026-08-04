import { pgTable, uuid, integer, timestamp, unique, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.js";
import { topics } from "./topics.js";

export const focusTopics = pgTable(
  "focus_topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }).notNull(),
    priority: integer("priority").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userTopicUnique: unique("focus_topics_user_topic_unique").on(table.userId, table.topicId),
    userIdIdx: index("focus_topics_user_id_idx").on(table.userId),
    userExpiresIdx: index("focus_topics_user_expires_idx").on(table.userId, table.expiresAt),
  }),
);

export const focusTopicsRelations = relations(focusTopics, ({ one }) => ({
  user: one(users, { fields: [focusTopics.userId], references: [users.id] }),
  topic: one(topics, { fields: [focusTopics.topicId], references: [topics.id] }),
}));
