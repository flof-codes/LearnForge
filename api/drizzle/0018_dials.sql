-- Release 1 of the card-model direction: change rate, session difficulty,
-- level progress, originals, session tickets and the review log columns.
-- Additive only; rows written before this migration keep rules_version NULL (= v1).

ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "change_rate" real;
DO $$ BEGIN
  ALTER TABLE "topics" ADD CONSTRAINT "topics_change_rate_range" CHECK ("change_rate" IS NULL OR ("change_rate" >= 0 AND "change_rate" <= 1));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "change_rate" real;
DO $$ BEGIN
  ALTER TABLE "cards" ADD CONSTRAINT "cards_change_rate_range" CHECK ("change_rate" IS NULL OR ("change_rate" >= 0 AND "change_rate" <= 1));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "current_original_id" uuid;

ALTER TABLE "bloom_state" ADD COLUMN IF NOT EXISTS "progress" real DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "card_originals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "question_text" text NOT NULL,
  "expected_answer" text,
  "options" jsonb,
  "context" text,
  "created_by" text DEFAULT 'tutor' NOT NULL,
  "status" text DEFAULT 'current' NOT NULL,
  "is_stale" boolean DEFAULT false NOT NULL,
  "dispute_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "card_originals_card_version_uq" UNIQUE ("card_id", "version")
);
CREATE INDEX IF NOT EXISTS "card_originals_card_idx" ON "card_originals" ("card_id");

CREATE TABLE IF NOT EXISTS "study_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client" text DEFAULT 'claude' NOT NULL,
  "session_difficulty" real DEFAULT 1 NOT NULL,
  "voice" boolean DEFAULT false NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_activity" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "study_sessions_difficulty_range" CHECK ("session_difficulty" >= 0 AND "session_difficulty" <= 1)
);
CREATE INDEX IF NOT EXISTS "study_sessions_user_idx" ON "study_sessions" ("user_id");

CREATE TABLE IF NOT EXISTS "study_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "study_sessions"("id") ON DELETE CASCADE,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
  "original_id" uuid REFERENCES "card_originals"("id") ON DELETE SET NULL,
  "card_level" smallint NOT NULL,
  "change_rate" real NOT NULL,
  "rate_source" text NOT NULL,
  "last_review_at_serve" timestamp with time zone,
  "served_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "study_questions_session_idx" ON "study_questions" ("session_id");
CREATE INDEX IF NOT EXISTS "study_questions_card_idx" ON "study_questions" ("card_id");

ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "question_id" uuid REFERENCES "study_questions"("id") ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_question_id_unique" UNIQUE ("question_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "style" text;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "target_level" smallint;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "card_level" smallint;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "on_level" boolean;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "correctness" real;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "graded_by" text;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "change_rate" real;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "session_difficulty" real;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "level_step" real;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "interval_factor" real;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "fsrs_interval_days" real;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "scheduled_days" real;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "elapsed_days" real;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "retrievability" real;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "rules_version" smallint;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "fsrs_params_version" text;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "skip_bloom" boolean;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "state_before" jsonb;

-- The existing fsrs_state_due_idx is partial (WHERE state > 0); the due query also wants new cards.
CREATE INDEX IF NOT EXISTS "fsrs_state_due_all_idx" ON "fsrs_state" ("due");
