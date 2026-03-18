-- Migration: Stripe billing and trial support
-- Adds billing columns to users table

-- 1. Add trial column (nullable first for backfill)
ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamptz;

-- 2. Backfill: existing users get 30-day trial from now
UPDATE "users" SET "trial_ends_at" = NOW() + INTERVAL '30 days' WHERE "trial_ends_at" IS NULL;

-- 3. Make trial NOT NULL (all new users must have a trial end date)
ALTER TABLE "users" ALTER COLUMN "trial_ends_at" SET NOT NULL;

-- 4. Add Stripe columns (all nullable -- set when user subscribes)
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" varchar(255) UNIQUE;
ALTER TABLE "users" ADD COLUMN "subscription_status" varchar(50);
ALTER TABLE "users" ADD COLUMN "subscription_current_period_end" timestamptz;

-- 5. Index for webhook lookups by Stripe customer ID
CREATE INDEX "users_stripe_customer_id_idx" ON "users" ("stripe_customer_id") WHERE "stripe_customer_id" IS NOT NULL;
