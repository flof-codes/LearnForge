import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { verifyCardOwnership } from "../lib/card-ownership.js";

export interface OriginalOption {
  id: string;
  text: string;
  correct?: boolean;
}

export interface CardOriginal {
  id: string;
  cardId: string;
  version: number;
  questionText: string;
  expectedAnswer: string | null;
  options: OriginalOption[] | null;
  context: string | null;
  createdBy: string;
  status: string;
  isStale: boolean;
  disputeNote: string | null;
  createdAt: string;
}

interface OriginalRow extends Record<string, unknown> {
  id: string; card_id: string; version: number; question_text: string; expected_answer: string | null;
  options: OriginalOption[] | null; context: string | null; created_by: string; status: string;
  is_stale: boolean; dispute_note: string | null; created_at: string;
}

function mapOriginal(r: OriginalRow): CardOriginal {
  return {
    id: r.id, cardId: r.card_id, version: r.version, questionText: r.question_text,
    expectedAnswer: r.expected_answer, options: r.options, context: r.context,
    createdBy: r.created_by, status: r.status, isStale: r.is_stale,
    disputeNote: r.dispute_note, createdAt: r.created_at,
  };
}

/** Current originals for a set of the user's cards, keyed by card id. */
export async function getCurrentOriginals(db: Db, userId: string, cardIds: string[]): Promise<Map<string, CardOriginal>> {
  if (cardIds.length === 0) return new Map();
  const list = sql.join(cardIds.map(id => sql`${id}::uuid`), sql`, `);
  const rows = await db.execute<OriginalRow>(sql`
    SELECT co.* FROM card_originals co
    JOIN cards c ON c.current_original_id = co.id
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    WHERE c.id IN (${list})
  `);
  return new Map(rows.rows.map(r => [r.card_id, mapOriginal(r)]));
}

export async function getCardOriginal(db: Db, userId: string, cardId: string): Promise<CardOriginal | null> {
  await verifyCardOwnership(db, cardId, userId);
  const m = await getCurrentOriginals(db, userId, [cardId]);
  return m.get(cardId) ?? null;
}

export interface SetOriginalInput {
  card_id: string;
  question_text: string;
  expected_answer?: string;
  options?: OriginalOption[];
  context?: string;
  created_by?: "tutor" | "user" | "derived";
}

/**
 * Stores the next version of a card's original question and makes it current.
 * The previous version is superseded, never edited.
 */
export async function setOriginal(db: Db, userId: string, input: SetOriginalInput): Promise<CardOriginal> {
  const { card_id, question_text, expected_answer, options, context } = input;
  if (!question_text?.trim()) throw new ValidationError("question_text is required");
  if (options !== undefined) {
    if (!Array.isArray(options) || options.some(o => !o || typeof o.id !== "string" || typeof o.text !== "string")) {
      throw new ValidationError("options must be an array of { id, text, correct? }");
    }
  }
  await verifyCardOwnership(db, card_id, userId);

  return db.transaction(async (tx) => {
    // Lock the card row so two tutors cannot both create version n+1.
    await tx.execute(sql`SELECT id FROM cards WHERE id = ${card_id} FOR UPDATE`);
    await tx.execute(sql`
      UPDATE card_originals SET status = 'superseded'
      WHERE card_id = ${card_id} AND status IN ('current', 'disputed')
    `);
    const rows = await tx.execute<OriginalRow>(sql`
      INSERT INTO card_originals (card_id, version, question_text, expected_answer, options, context, created_by)
      VALUES (
        ${card_id},
        COALESCE((SELECT MAX(version) FROM card_originals WHERE card_id = ${card_id}), 0) + 1,
        ${question_text}, ${expected_answer ?? null}, ${options ? JSON.stringify(options) : null}::jsonb,
        ${context ?? null}, ${input.created_by ?? "tutor"}
      )
      RETURNING *
    `);
    const original = rows.rows[0];
    await tx.execute(sql`UPDATE cards SET current_original_id = ${original.id} WHERE id = ${card_id}`);
    return mapOriginal(original);
  });
}

/**
 * Flags the current original as disputed. Disputed cards are not served in study
 * until the dispute is resolved by storing a new original or clearing the dispute.
 */
export async function disputeOriginal(db: Db, userId: string, cardId: string, note: string): Promise<CardOriginal> {
  if (!note?.trim()) throw new ValidationError("A dispute note is required");
  await verifyCardOwnership(db, cardId, userId);
  const rows = await db.execute<OriginalRow>(sql`
    UPDATE card_originals co SET status = 'disputed', dispute_note = ${note}
    FROM cards c
    WHERE c.id = ${cardId} AND co.id = c.current_original_id
    RETURNING co.*
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Card has no original question to dispute");
  return mapOriginal(rows.rows[0]);
}

/** Clears a dispute and keeps the current original as it is. */
export async function resolveDispute(db: Db, userId: string, cardId: string): Promise<CardOriginal> {
  await verifyCardOwnership(db, cardId, userId);
  const rows = await db.execute<OriginalRow>(sql`
    UPDATE card_originals co SET status = 'current', dispute_note = NULL, is_stale = false
    FROM cards c
    WHERE c.id = ${cardId} AND co.id = c.current_original_id AND co.status = 'disputed'
    RETURNING co.*
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Card has no disputed original");
  return mapOriginal(rows.rows[0]);
}

/** Called when card content changes: a tutor-written original may no longer match. */
export async function markOriginalStale(db: Db, userId: string, cardId: string): Promise<void> {
  await db.execute(sql`
    UPDATE card_originals co SET is_stale = true
    FROM cards c
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    WHERE c.id = ${cardId} AND co.id = c.current_original_id AND co.created_by <> 'derived'
  `);
}
