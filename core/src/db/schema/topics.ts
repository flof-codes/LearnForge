import { pgTable, uuid, varchar, text, real, timestamp, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { users } from "./users.js";

export const topics = pgTable("topics", {
  id: uuid("id").defaultRandom().primaryKey(),
  parentId: uuid("parent_id").references((): AnyPgColumn => topics.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  /** Question variation 0..1 for cards below this topic; NULL inherits from the parent (root default 0.8). */
  changeRate: real("change_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("topics_change_rate_range", sql`${t.changeRate} IS NULL OR (${t.changeRate} >= 0 AND ${t.changeRate} <= 1)`),
]);

export const topicsRelations = relations(topics, ({ one, many }) => ({
  parent: one(topics, { fields: [topics.parentId], references: [topics.id], relationName: "topicParent" }),
  children: many(topics, { relationName: "topicParent" }),
  user: one(users, { fields: [topics.userId], references: [users.id] }),
}));
