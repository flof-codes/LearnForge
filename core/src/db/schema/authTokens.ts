import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.js";

/**
 * Single-use tokens for e-mail verification and password reset.
 *
 * Only the SHA-256 hash of the token is stored — the plaintext exists solely
 * in the mail we send, so a database leak cannot be replayed into an account
 * takeover.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).unique().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("auth_tokens_user_type_idx").on(table.userId, table.type),
    index("auth_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export const authTokensRelations = relations(authTokens, ({ one }) => ({
  user: one(users, { fields: [authTokens.userId], references: [users.id] }),
}));
