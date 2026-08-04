ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;

-- Grandfather every account that exists at migration time. Without this the
-- write-gate would lock out all current users the moment this deploys, and
-- they have no way to trigger a verification mail for an address they never
-- confirmed in the first place.
UPDATE "users" SET "email_verified_at" = now() WHERE "email_verified_at" IS NULL;

CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(20) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE ("token_hash")
);

CREATE INDEX IF NOT EXISTS "auth_tokens_user_type_idx" ON "auth_tokens"("user_id", "type");
CREATE INDEX IF NOT EXISTS "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");
