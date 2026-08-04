CREATE TABLE IF NOT EXISTS "focus_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "topics"("id") ON DELETE CASCADE,
  "priority" integer NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "focus_topics_user_topic_unique" UNIQUE ("user_id", "topic_id")
);

CREATE INDEX IF NOT EXISTS "focus_topics_user_id_idx" ON "focus_topics"("user_id");
CREATE INDEX IF NOT EXISTS "focus_topics_user_expires_idx" ON "focus_topics"("user_id", "expires_at");
