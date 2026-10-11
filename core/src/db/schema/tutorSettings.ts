import { pgTable, uuid, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * A user's own setup for the tutor in the web app: their Anthropic API key and
 * which model writes and grades their questions.
 *
 * The key is stored encrypted (core lib/secret-box.ts) and leaves the server
 * only towards Anthropic. `key_hint` holds its last four characters so the
 * settings page can show which key is on file without decrypting anything.
 */
export const tutorSettings = pgTable("tutor_settings", {
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).primaryKey(),
  apiKeyEnc: text("api_key_enc"),
  keyHint: varchar("key_hint", { length: 8 }),
  model: text("model").notNull().default("claude-opus-5-5"),
  effort: text("effort").notNull().default("medium"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
