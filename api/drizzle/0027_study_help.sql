-- Help while studying: feedback that rewrites a question, terms saved to a card,
-- and generated definitions and tutorials kept for the next look.

ALTER TABLE "card_questions" ADD COLUMN IF NOT EXISTS "replaced_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
  "labels" text[] DEFAULT '{}'::text[] NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "scope" text NOT NULL,
  "question_stem" text NOT NULL,
  "card_question_id" uuid REFERENCES "card_questions"("id") ON DELETE SET NULL,
  "replacement_id" uuid REFERENCES "card_questions"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_feedback_card_idx" ON "card_feedback" ("card_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_terms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
  "term" text NOT NULL,
  "definition" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "card_terms_card_term_uq" ON "card_terms" ("card_id", lower("term"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_help" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "subject" text DEFAULT '' NOT NULL,
  "card_question_id" uuid REFERENCES "card_questions"("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "prompt_version" integer NOT NULL,
  "model" text NOT NULL,
  "card_updated_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_help_card_idx" ON "card_help" ("card_id");
