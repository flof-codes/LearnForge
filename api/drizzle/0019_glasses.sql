-- Even Realities G2 glasses: pairing codes, device tokens, and the cache of
-- questions Claude compiles for the display. Additive only.

CREATE TABLE IF NOT EXISTS "glasses_pair_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(8) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "claimed_at" timestamp with time zone,
  "claimed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "glasses_pair_codes_code_unique" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "glasses_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "label" text DEFAULT 'G2 glasses' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "glasses_tokens_token_hash_unique" UNIQUE ("token_hash")
);
CREATE INDEX IF NOT EXISTS "glasses_tokens_user_idx" ON "glasses_tokens" ("user_id");

CREATE TABLE IF NOT EXISTS "glasses_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
  "bloom_level" smallint NOT NULL,
  "prompt_version" integer NOT NULL,
  "status" text DEFAULT 'ready' NOT NULL,
  "stem" text,
  "options" jsonb,
  "correct" integer[],
  "explanation" text,
  "skip_reason" text,
  "original_id" uuid REFERENCES "card_originals"("id") ON DELETE SET NULL,
  "card_updated_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "glasses_questions_card_level_version_uq" UNIQUE ("card_id", "bloom_level", "prompt_version")
);
CREATE INDEX IF NOT EXISTS "glasses_questions_card_idx" ON "glasses_questions" ("card_id");
