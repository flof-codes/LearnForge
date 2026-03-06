import { pgTable, uuid, varchar, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const topics = pgTable("topics", {
  id: uuid("id").defaultRandom().primaryKey(),
  parentId: uuid("parent_id").references((): AnyPgColumn => topics.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const topicsRelations = relations(topics, ({ one, many }) => ({
  parent: one(topics, { fields: [topics.parentId], references: [topics.id], relationName: "topicParent" }),
  children: many(topics, { relationName: "topicParent" }),
}));
