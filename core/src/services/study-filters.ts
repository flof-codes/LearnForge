import { sql } from "drizzle-orm";

/**
 * Cards whose current original is disputed stay out of study, the due counts,
 * the forecast and the stats until the dispute is resolved. Expects the cards
 * table to be aliased `c` in the surrounding query.
 */
export const NOT_DISPUTED = sql`NOT EXISTS (
  SELECT 1 FROM card_originals co WHERE co.id = c.current_original_id AND co.status = 'disputed'
)`;

/** Suspended cards (a cloze gap that vanished, a card the user removed from a note) are neither served nor counted. */
export const NOT_SUSPENDED = sql`c.suspended = false`;

/** A sibling reviewed in the last 12 hours buries the rest of its note (Anki's bury rule). */
export const NOT_BURIED = sql`(c.note_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM cards sib JOIN fsrs_state sfs ON sfs.card_id = sib.id
  WHERE sib.note_id = c.note_id AND sib.id <> c.id AND sfs.last_review > NOW() - INTERVAL '12 hours'
))`;

/** Everything a study query should apply. */
export const STUDYABLE = sql`${NOT_DISPUTED} AND ${NOT_SUSPENDED}`;
