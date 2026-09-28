-- Release 2 of the card-model direction: the Anki note model underneath cards.
-- note types (fields + card templates + CSS) → notes → cards. Freeform cards keep
-- note_id NULL and are untouched. Additive; the legacy cloze conversion runs in
-- code at API boot (convertLegacyClozeCards), not here.

CREATE TABLE IF NOT EXISTS "note_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "builtin_key" text,
  "builtin_version" integer DEFAULT 1 NOT NULL,
  "customized" boolean DEFAULT false NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'standard' NOT NULL,
  "css" text DEFAULT '' NOT NULL,
  "sort_field_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "note_types_user_builtin_uq" UNIQUE ("user_id", "builtin_key")
);
CREATE INDEX IF NOT EXISTS "note_types_user_idx" ON "note_types" ("user_id");

CREATE TABLE IF NOT EXISTS "note_type_fields" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "note_type_id" uuid NOT NULL REFERENCES "note_types"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "ord" smallint NOT NULL,
  CONSTRAINT "note_type_fields_key_uq" UNIQUE ("note_type_id", "key"),
  CONSTRAINT "note_type_fields_ord_uq" UNIQUE ("note_type_id", "ord")
);

CREATE TABLE IF NOT EXISTS "card_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "note_type_id" uuid NOT NULL REFERENCES "note_types"("id") ON DELETE CASCADE,
  "ord" smallint NOT NULL,
  "name" text NOT NULL,
  "front_template" text NOT NULL,
  "back_template" text NOT NULL,
  CONSTRAINT "card_templates_ord_uq" UNIQUE ("note_type_id", "ord")
);

CREATE TABLE IF NOT EXISTS "notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "note_type_id" uuid NOT NULL REFERENCES "note_types"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "topics"("id") ON DELETE CASCADE,
  "fields" jsonb NOT NULL,
  "tags" text[] DEFAULT '{}' NOT NULL,
  "anki_guid" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "notes_user_idx" ON "notes" ("user_id");
CREATE INDEX IF NOT EXISTS "notes_topic_idx" ON "notes" ("topic_id");

ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "note_id" uuid REFERENCES "notes"("id") ON DELETE CASCADE;
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "template_id" uuid REFERENCES "card_templates"("id") ON DELETE CASCADE;
-- 0 on standard cards so the uniqueness below holds (NULLs would compare as distinct).
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "cloze_number" smallint DEFAULT 0 NOT NULL;
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "suspended" boolean DEFAULT false NOT NULL;
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "renderer_version" smallint;
DO $$ BEGIN
  ALTER TABLE "cards" ADD CONSTRAINT "cards_note_template_cloze_uq" UNIQUE ("note_id", "template_id", "cloze_number");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "cards_note_idx" ON "cards" ("note_id");
