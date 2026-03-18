import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  mcpApiKeyHash: varchar("mcp_api_key_hash", { length: 64 }),
  mcpApiKeyCreatedAt: timestamp("mcp_api_key_created_at", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).unique(),
  subscriptionStatus: varchar("subscription_status", { length: 50 }),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
