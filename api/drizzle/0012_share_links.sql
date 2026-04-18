CREATE TABLE IF NOT EXISTS "share_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text UNIQUE NOT NULL,
  "topic_id" uuid NOT NULL REFERENCES "topics"("id") ON DELETE CASCADE,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "share_links_token_idx" ON "share_links"("token");
CREATE INDEX IF NOT EXISTS "share_links_owner_id_idx" ON "share_links"("owner_id");
