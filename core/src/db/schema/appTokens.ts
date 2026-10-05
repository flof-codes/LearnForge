import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * One-time codes for connecting an app (Lecture Scribe) to an account.
 *
 * Same idea as the glasses pairing: the app generates its own bearer secret and
 * sends only its SHA-256; the signed-in user approves the code in the web UI,
 * which turns the hash into an app_tokens row. Polling reveals a status and
 * nothing else.
 */
export const appPairCodes = pgTable("app_pair_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  app: text("app").notNull(),
  device: text("device").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

/** Bearer tokens of connected apps. Hash only; the scope is the route list in api/src/plugins/auth.ts. */
export const appTokens = pgTable("app_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  app: text("app").notNull(),
  device: text("device").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  index("app_tokens_user_idx").on(t.userId),
]);
