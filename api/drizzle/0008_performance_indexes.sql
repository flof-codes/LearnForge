-- Performance indexes for study, context, and export queries
CREATE INDEX IF NOT EXISTS reviews_card_id_idx ON reviews (card_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reviews_reviewed_at_idx ON reviews (reviewed_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cards_topic_id_idx ON cards (topic_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fsrs_state_due_idx ON fsrs_state (due) WHERE state > 0;
