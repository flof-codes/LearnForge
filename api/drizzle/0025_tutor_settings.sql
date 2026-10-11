-- Each user's own tutor setup: their Anthropic API key (encrypted), the model
-- and the effort.

CREATE TABLE IF NOT EXISTS "tutor_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "api_key_enc" text,
  "key_hint" varchar(8),
  "model" text DEFAULT 'claude-opus-5-5' NOT NULL,
  "effort" text DEFAULT 'medium' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
