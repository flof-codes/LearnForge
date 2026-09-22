import { sql } from "drizzle-orm";

/**
 * Cards whose current original is disputed stay out of study, the due counts,
 * the forecast and the stats until the dispute is resolved. Expects the cards
 * table to be aliased `c` in the surrounding query.
 */
export const NOT_DISPUTED = sql`NOT EXISTS (
  SELECT 1 FROM card_originals co WHERE co.id = c.current_original_id AND co.status = 'disputed'
)`;
