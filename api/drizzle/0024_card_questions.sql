-- Questions written ahead of time for the study view, one per card, Bloom
-- level and form, and the link from a study ticket to the question it served.

CREATE TABLE IF NOT EXISTS "card_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
  "bloom_level" smallint NOT NULL,
  "form" text NOT NULL,
  "prompt_version" integer NOT NULL,
  "status" text DEFAULT 'ready' NOT NULL,
  "payload" jsonb,
  "skip_reason" text,
  "difficulty" real NOT NULL,
  "model" text NOT NULL,
  "original_id" uuid REFERENCES "card_originals"("id") ON DELETE SET NULL,
  "card_updated_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_questions_card_idx" ON "card_questions" ("card_id");
--> statement-breakpoint
ALTER TABLE "study_questions" ADD COLUMN IF NOT EXISTS "card_question_id" uuid REFERENCES "card_questions"("id") ON DELETE SET NULL;
