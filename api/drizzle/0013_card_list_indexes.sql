-- Pagination indexes for the browse/list endpoint.
-- cards(topic_id) index already exists from 0008; add composites for ORDER BY pagination.

CREATE INDEX IF NOT EXISTS cards_topic_id_created_at_idx
  ON cards (topic_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cards_topic_id_updated_at_idx
  ON cards (topic_id, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bloom_state_current_level_idx
  ON bloom_state (current_level);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fsrs_state_state_idx
  ON fsrs_state (state);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fsrs_state_last_review_idx
  ON fsrs_state (last_review DESC NULLS LAST);
