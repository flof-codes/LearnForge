import { pgTable, uuid, varchar, text, smallint, integer, jsonb, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { cards } from "./cards.js";
import { cardOriginals } from "./cardOriginals.js";

/**
 * One-time pairing codes shown on the Even Realities G2 glasses.
 *
 * The glasses generate their own bearer secret and send only its SHA-256 here;
 * the admin claims the code in the web UI, which turns the hash into a
 * glasses_tokens row. Polling the code therefore reveals a status and nothing
 * else: whoever guesses a code cannot walk away with a token.
 */
export const glassesPairCodes = pgTable("glasses_pair_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

/** Bearer tokens of paired glasses. Hash only, like the MCP API key. */
export const glassesTokens = pgTable("glasses_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  label: text("label").notNull().default("G2 glasses"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  index("glasses_tokens_user_idx").on(t.userId),
]);

/**
 * A card compiled into a question that fits the 576×288 display: one stem,
 * four short options, the correct indices and a one-line explanation.
 *
 * Compiled by Claude through the MCP, never by the API. A row is fresh only while
 * `card_updated_at` and `original_id` still match the card; `status = 'skipped'`
 * records that the card cannot be compressed (formulas, diagrams) so the compile
 * queue stops offering it.
 */
export const glassesQuestions = pgTable("glasses_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  bloomLevel: smallint("bloom_level").notNull(),
  promptVersion: integer("prompt_version").notNull(),
  status: text("status").notNull().default("ready"), // ready | skipped
  stem: text("stem"),
  /** Exactly four option texts, in display order A..D. */
  options: jsonb("options").$type<string[]>(),
  /** Indices into `options` that are correct; one entry = single choice. */
  correct: integer("correct").array(),
  explanation: text("explanation"),
  skipReason: text("skip_reason"),
  originalId: uuid("original_id").references(() => cardOriginals.id, { onDelete: "set null" }),
  cardUpdatedAt: timestamp("card_updated_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("glasses_questions_card_level_version_uq").on(t.cardId, t.bloomLevel, t.promptVersion),
  index("glasses_questions_card_idx").on(t.cardId),
]);
