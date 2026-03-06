import { pgTable, uuid, text, timestamp, customType } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { topics } from "./topics.js";

const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(384)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    return String(value).replace(/[[\]]/g, "").split(",").map(Number);
  },
});

export const cards = pgTable("cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }).notNull(),
  concept: text("concept").notNull(),
  frontHtml: text("front_html").notNull(),
  backHtml: text("back_html").notNull(),
  tags: text("tags").array().default([]),
  embedding: vector("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const cardsRelations = relations(cards, ({ one }) => ({
  topic: one(topics, { fields: [cards.topicId], references: [topics.id] }),
}));
