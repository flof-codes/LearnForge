import { pgTable, uuid, text, varchar, jsonb, timestamp, integer, bigserial, unique, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * One uploaded Anki package and its way through the import:
 * analyzing → staged (preview ready) → running → done | failed.
 * The staged file lives on the API host until the import ends.
 */
export const ankiImports = pgTable("anki_imports", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  status: text("status").notNull().default("analyzing"),
  packageVersion: text("package_version"),
  options: jsonb("options"),
  preview: jsonb("preview"),
  stats: jsonb("stats"),
  error: text("error"),
  stagedPath: text("staged_path"),
  progressDone: integer("progress_done").notNull().default(0),
  progressTotal: integer("progress_total").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  index("anki_imports_user_idx").on(t.userId, t.createdAt),
]);

/**
 * Everything from an Anki package that LearnForge does not model, verbatim:
 * note type configs, deck options, raw note and card columns, the review log
 * per card. Keyed per user by (kind, anki_key) so a re-import replaces rows
 * instead of adding them; the rows outlive the import that wrote them.
 */
export const ankiRecords = pgTable("anki_records", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  importId: uuid("import_id").references(() => ankiImports.id, { onDelete: "set null" }),
  /** notetype | deck | deck_config | note | card | collection */
  kind: text("kind").notNull(),
  /** notetype: Anki id; deck: path joined by \x1f; note: guid; card: guid:ord. */
  ankiKey: text("anki_key").notNull(),
  localId: uuid("local_id"),
  raw: jsonb("raw").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("anki_records_key_uq").on(t.userId, t.kind, t.ankiKey),
]);
