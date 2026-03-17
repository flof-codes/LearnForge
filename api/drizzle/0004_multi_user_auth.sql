-- Migration: Multi-User Auth
-- Adds users table, user_id FK to topics and images

-- 1. Create users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" varchar(255) NOT NULL,
  "mcp_api_key_hash" varchar(64),
  "mcp_api_key_created_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Insert migration user (placeholder for existing data)
INSERT INTO "users" ("id", "email", "password_hash", "name")
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'migrated@learnforge.local',
  '$invalid$',
  'Migrated User'
);

-- 3. Add user_id columns (nullable first)
ALTER TABLE "topics" ADD COLUMN "user_id" uuid;
ALTER TABLE "images" ADD COLUMN "user_id" uuid;

-- 4. Backfill existing rows with migration user
UPDATE "topics" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;
UPDATE "images" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;

-- 5. Make columns NOT NULL and add FK constraints
ALTER TABLE "topics" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "topics" ADD CONSTRAINT "topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "images" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "images" ADD CONSTRAINT "images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- 6. Create indexes
CREATE INDEX "topics_user_id_idx" ON "topics" ("user_id");
CREATE INDEX "images_user_id_idx" ON "images" ("user_id");
CREATE INDEX "users_mcp_api_key_hash_idx" ON "users" ("mcp_api_key_hash") WHERE "mcp_api_key_hash" IS NOT NULL;
