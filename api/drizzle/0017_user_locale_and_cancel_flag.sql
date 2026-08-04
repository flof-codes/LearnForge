-- Webhooks have no request context to derive a language from, so the user's
-- preferred locale has to live on the row.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" varchar(5) DEFAULT 'de' NOT NULL;

-- Mirrors Stripe's cancel_at_period_end. Webhook processing failures make Stripe
-- redeliver the event, so the cancellation mail keys off a local false → true
-- transition rather than the event payload, which would resend on every retry.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_cancel_at_period_end" boolean DEFAULT false NOT NULL;
