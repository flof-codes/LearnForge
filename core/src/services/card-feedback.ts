import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import type { QuestionPayload, QuestionTerm } from "./question-forms.js";

/**
 * What the learner has left on a card while studying: feedback that guides the
 * questions written for it, and terms saved from a generated definition. Read
 * by the question writer and by the study view; written by services/study-help.ts.
 */

/** The preset labels of the feedback sheet, and how the writer reads them. */
export const FEEDBACK_LABELS = {
  unclear: "The wording is unclear",
  not_my_way: "This is not how I want to learn it",
  too_easy: "Too trivial",
  too_detailed: "It asks about a detail that does not matter",
  wrong_answer: "The answer looks wrong",
  gives_away: "The options give the answer away",
} as const;
export type FeedbackLabel = keyof typeof FEEDBACK_LABELS;

export interface WriterFeedback { labels: string[]; note: string }

/** How many feedback entries per card the writer reads, newest first. */
const FEEDBACK_PER_CARD = 5;

export const feedbackForWriter = (labels: string[], note: string): WriterFeedback => ({
  labels: labels.map(l => FEEDBACK_LABELS[l as FeedbackLabel] ?? l),
  note,
});

/** Feedback that applies to every question of a card, newest first. */
export async function loadCardFeedback(db: Db, cardIds: string[]): Promise<Map<string, WriterFeedback[]>> {
  const map = new Map<string, WriterFeedback[]>();
  if (cardIds.length === 0) return map;
  const list = sql.join(cardIds.map(id => sql`${id}::uuid`), sql`, `);
  const rows = await db.execute<{ card_id: string; labels: string[]; note: string }>(sql`
    SELECT card_id, labels, note FROM card_feedback
    WHERE card_id IN (${list}) AND scope = 'card'
    ORDER BY created_at DESC
  `);
  for (const r of rows.rows) {
    const entries = map.get(r.card_id) ?? [];
    if (entries.length < FEEDBACK_PER_CARD) entries.push(feedbackForWriter(r.labels, r.note));
    map.set(r.card_id, entries);
  }
  return map;
}

export async function loadCardTerms(db: Db, cardIds: string[]): Promise<Map<string, QuestionTerm[]>> {
  const map = new Map<string, QuestionTerm[]>();
  if (cardIds.length === 0) return map;
  const list = sql.join(cardIds.map(id => sql`${id}::uuid`), sql`, `);
  const rows = await db.execute<{ card_id: string; term: string; definition: string }>(sql`
    SELECT card_id, term, definition FROM card_terms WHERE card_id IN (${list}) ORDER BY created_at
  `);
  for (const r of rows.rows) map.set(r.card_id, [...(map.get(r.card_id) ?? []), { term: r.term, definition: r.definition }]);
  return map;
}

/** Adds the card's saved terms that occur in the question, so the study view underlines them too. */
export function withCardTerms<P extends QuestionPayload>(payload: P, saved: QuestionTerm[]): P {
  if (saved.length === 0) return payload;
  const texts = [payload.stem, payload.explanation, ...("options" in payload ? payload.options.map(o => o.text) : [])].join("\n").toLowerCase();
  const have = new Set(payload.terms.map(t => t.term.toLowerCase()));
  const extra = saved.filter(t => !have.has(t.term.toLowerCase()) && texts.includes(t.term.toLowerCase()));
  return extra.length === 0 ? payload : { ...payload, terms: [...payload.terms, ...extra] };
}
