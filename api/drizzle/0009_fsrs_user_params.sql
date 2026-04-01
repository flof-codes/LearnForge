-- Per-user FSRS parameter optimization columns
ALTER TABLE users ADD COLUMN fsrs_params jsonb;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN reviews_since_optimization integer NOT NULL DEFAULT 0;
