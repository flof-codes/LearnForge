import { pgTable, uuid, text, real, boolean, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/**
 * One tutor study session. Carries the per-session difficulty (0..1) and lets a
 * session resume on another device by its id. Web self-study has no session.
 */
export const studySessions = pgTable("study_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  client: text("client").notNull().default("claude"), // codex | claude | other
  sessionDifficulty: real("session_difficulty").notNull().default(1),
  voice: boolean("voice").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  lastActivity: timestamp("last_activity", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("study_sessions_difficulty_range", sql`${t.sessionDifficulty} >= 0 AND ${t.sessionDifficulty} <= 1`),
  index("study_sessions_user_idx").on(t.userId),
]);
