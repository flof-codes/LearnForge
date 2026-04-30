-- Migration: link users to their active Stripe subscription
-- Closes the multi-subscription overwrite race: webhook handlers can now
-- match events by subscription ID instead of customer ID alone.

ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" varchar(255);

CREATE INDEX "users_stripe_subscription_id_idx"
  ON "users" ("stripe_subscription_id")
  WHERE "stripe_subscription_id" IS NOT NULL;
